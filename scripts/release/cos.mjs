import COS from "cos-nodejs-sdk-v5";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { Readable } from "node:stream";

export function cosConfig(env = process.env) {
    const required = (name) => {
        const value = env[name]?.trim();
        if (!value) throw new Error(`缺少 ${name}，请在 .env.release.local 配置 COS 上传凭据`);
        return value;
    };
    const bucket = env.IRIS_COS_BUCKET?.trim() || "irisnote-1334342309";
    const region = env.IRIS_COS_REGION?.trim() || "ap-guangzhou";
    const prefix = (env.IRIS_COS_PREFIX ?? "").trim().replace(/^\/+|\/+$/g, "");
    if (!/^[a-z0-9][a-z0-9-]*-\d+$/.test(bucket) || !/^[a-z]+-[a-z]+-?\d*$/.test(region))
        throw new Error("COS 桶名或地域格式错误");
    if (prefix && !prefix.split("/").every((part) => /^[a-zA-Z0-9_-]+$/.test(part)))
        throw new Error("COS 目录前缀仅支持英文、数字、下划线、连字符及目录分隔符");
    const cdn = new URL(env.IRIS_COS_CDN_BASE_URL?.trim() || "https://download.tech-mou.top");
    if (cdn.protocol !== "https:" || cdn.username || cdn.password || cdn.search || cdn.hash)
        throw new Error("CDN 基础地址必须是无凭据的 HTTPS 地址");
    if (cdn.pathname.replace(/^\/+|\/+$/g, "") !== prefix)
        throw new Error("CDN 基础地址的目录必须与 IRIS_COS_PREFIX 一致");
    return {
        bucket, region, prefix, cdn: cdn.href.replace(/\/$/, ""),
        secretId: required("IRIS_COS_SECRET_ID"),
        secretKey: required("IRIS_COS_SECRET_KEY"),
        securityToken: env.IRIS_COS_SECURITY_TOKEN?.trim(),
    };
}

// This environment is passed to npm, Expo, Gradle and EAS, never to the uploader.
export function withoutCosCredentials(env) {
    return Object.fromEntries(Object.entries(env).filter(([key]) =>
        !/^(IRIS_COS_|COS_|TENCENTCLOUD_)/i.test(key)));
}

export function cosObjectKey(config, release) {
    if (!/^\d+\.\d+\.\d+$/.test(release.version) ||
        !Number.isSafeInteger(release.build_code) || release.build_code < 1)
        throw new Error("COS 对象版本或构建号无效");
    return `${config.prefix ? `${config.prefix}/` : ""}IRisNote-${release.version}-${release.build_code}.apk`;
}

// Do not print SDK error objects: they can contain signed request headers.
function cloudError(error) {
    const status = Number(error?.statusCode) || "未知";
    const code = /^[a-zA-Z0-9_-]{1,80}$/.test(error?.code ?? "") ? error.code : "RequestFailed";
    return new Error(`COS 请求失败：HTTP ${status} / ${code}`);
}

export function createCosUploader(config, client = new COS({
    SecretId: config.secretId,
    SecretKey: config.secretKey,
    SecurityToken: config.securityToken,
    Protocol: "https:",
    Timeout: 120000,
}), fetcher = fetch) {
    const bucket = { Bucket: config.bucket, Region: config.region };
    async function preflight() {
        let result;
        try { result = await client.getBucketVersioning(bucket); }
        catch (error) { throw cloudError(error); }
        const status = result.VersioningConfiguration?.Status;
        // Enabled preserves previous versions. Suspended can overwrite a null version.
        if (status && status !== "Enabled")
            throw new Error("COS 版本控制已暂停或状态无法识别；请核对配置，脚本不会更改桶设置");
        return status || "Unversioned";
    }
    async function head(params) {
        try { return await client.headObject(params); }
        catch (error) {
            if (error.statusCode === 404 && error.code !== "NoSuchBucket") return null;
            throw cloudError(error);
        }
    }
    function sameObject(before, after) {
        return after && before.ETag === after.ETag &&
            before.VersionId === after.VersionId &&
            before.headers?.["content-length"] === after.headers?.["content-length"];
    }
    async function verify(params, info, metadata, url) {
        if (!metadata || Number(metadata.headers?.["content-length"]) !== info.size)
            throw new Error("COS 同名对象大小不一致或不存在，拒绝覆盖/认定上传成功");
        if (!metadata.ETag) throw new Error("COS 未返回 ETag，无法校验 CDN 对应对象");
        if (metadata.headers?.["x-cos-meta-sha256"] && metadata.headers["x-cos-meta-sha256"] !== info.sha256)
            throw new Error("COS 同名对象 SHA-256 元数据冲突，拒绝覆盖");
        const hash = createHash("sha256");
        let bytes = 0;
        // Never send COS credentials to CDN; default COS domains reject APK GET.
        let response;
        try {
            response = await fetcher(url, {
                method: "GET", redirect: "error",
                headers: { "If-Match": metadata.ETag, "Accept-Encoding": "identity", "Cache-Control": "no-cache" },
                signal: AbortSignal.timeout(30 * 60 * 1000),
            });
        } catch { throw new Error("CDN 回读请求失败或超时，APK 保留，可重试 upload"); }
        if (response.status !== 200 || !response.body ||
            Number(response.headers.get("content-length")) !== info.size ||
            response.headers.get("etag") !== metadata.ETag) {
            await response.body?.cancel();
            throw new Error(`CDN 回读不匹配（HTTP ${response.status}、大小或 ETag）；请检查 CDN 回源/缓存后重试，不会覆盖 COS 对象`);
        }
        try {
            for await (const chunk of Readable.fromWeb(response.body)) {
                bytes += chunk.length;
                if (bytes > info.size) throw new Error("CDN 对象超出预期大小");
                hash.update(chunk);
            }
        } catch { throw new Error("CDN 回读中断或超出预期大小，可重试 upload"); }
        if (bytes !== info.size || hash.digest("hex") !== info.sha256)
            throw new Error("CDN APK SHA-256 不一致，拒绝覆盖/认定上传成功");
        if (!sameObject(metadata, await head(params)))
            throw new Error("COS 对象在校验期间发生变化，拒绝认定上传成功；请检查其他上传进程");
    }
    async function upload(apk, release, info) {
        // Recheck immediately before COS writes, even after an earlier preflight.
        const versioning = await preflight();
        const Key = cosObjectKey(config, release);
        const url = `${config.cdn}/${Key.split("/").at(-1)}`;
        const params = { ...bucket, Key };
        const existing = await head(params);
        if (existing) {
            await verify(params, info, existing, url);
            return { skipped: true, key: Key, url };
        }
        const body = createReadStream(apk);
        let uploaded;
        try {
            uploaded = await client.putObject({
                ...params, Body: body, ContentLength: info.size,
                ContentType: "application/vnd.android.package-archive",
                Headers: { "x-cos-forbid-overwrite": "true", "x-cos-meta-sha256": info.sha256 },
            });
        } catch (error) {
            // Unversioned buckets enforce forbid-overwrite atomically.
            if (error.statusCode !== 409 && error.statusCode !== 412) throw cloudError(error);
        } finally { body.destroy(); }
        const metadata = await head(params);
        if (uploaded && (!uploaded.ETag || uploaded.ETag !== metadata?.ETag ||
            (versioning === "Enabled" && (!uploaded.VersionId || uploaded.VersionId !== metadata?.VersionId))))
            throw new Error("COS 当前对象与本次上传的 ETag/版本 ID 不一致；可能存在并发写入，请核对后重试");
        await verify(params, info, metadata, url);
        return { skipped: false, key: Key, url };
    }
    async function verifyExisting(release, info) {
        const Key = cosObjectKey(config, release);
        const params = { ...bucket, Key };
        const url = `${config.cdn}/${Key.split("/").at(-1)}`;
        await verify(params, info, await head(params), url);
        return { key: Key, url };
    }
    return { preflight, upload, verifyExisting };
}

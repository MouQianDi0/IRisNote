import { createHash } from "node:crypto";

export function assertUploadedArtifact(release, info) {
    if (release.status !== "draft" || release.sha256 !== info.sha256 ||
        Number(release.size_bytes) !== info.size || release.certificate_sha256 !== info.certificate)
        throw new Error("服务器草稿与本地 APK 的摘要、大小或签名不一致，不能继续上传");
}

export async function verifyArtifactStream(stream, info) {
    const hash = createHash("sha256");
    let bytes = 0;
    for await (const chunk of stream) {
        bytes += chunk.length;
        if (bytes > info.size) throw new Error("服务器 APK 超出预期大小");
        hash.update(chunk);
    }
    if (bytes !== info.size || hash.digest("hex") !== info.sha256)
        throw new Error("服务器 APK 实际内容与本地文件不一致");
}

export async function uploadBoth({ release, apk, info, cos, getRelease, putServer, verifyServer, patches, log = console.log }) {
    let stage = "COS 配置检查";
    try {
        if (!["reserved", "draft"].includes(release.status))
            throw new Error("仅允许上传预留版本或继续未发布草稿");
        if (release.status === "draft") assertUploadedArtifact(release, info);
        await cos.preflight();
        stage = "服务器 APK 上传";
        if (release.status === "reserved") await putServer();
        const draft = await getRelease();
        assertUploadedArtifact(draft, info);
        stage = "服务器 APK 回读校验";
        await verifyServer();
        log("服务器 APK 已保存并通过 SHA-256 校验。");
        stage = "COS APK 上传/校验";
        const result = await cos.upload(apk, draft, info);
        log(`COS APK ${result.skipped ? "已存在且校验一致" : "已上传并校验"}：${result.key}`);
        log(`CDN 候选地址：${result.url}（实际可用性由后端检测）`);
        stage = "差量包生成/上传";
        await patches(draft, apk);
        log("完整 APK 已上传服务器和 COS，所需差量包已就绪；仍为草稿，请核对后运行 publish。");
    } catch (error) {
        throw new Error(`${stage}失败：${error.message}\n本地 APK 保留：${apk}\n修复后执行 npm run release -- upload --build ${release.build_code} --apk "${apk}" 继续；不会自动发布。`);
    }
}

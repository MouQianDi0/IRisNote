export const ANDROID_PACKAGE = "com.mouqiandi.irisNote";
export type AppRelease = {
    packageName: string;
    version: string;
    buildCode: number;
    notes: string;
    sha256: string;
    size: number;
    publishedAt: string;
    updatePolicy?: UpdatePolicy;
    delivery: Delivery;
};
/** Version 3 adds developer-set full-package barriers; version 2 may still come from an older server. */
export type UpdatePolicy =
    | { version: 2; releasesBehind: number; mandatory: boolean }
    | {
          version: 3;
          releasesBehind: number;
          mandatory: boolean;
          fullPackageRequired: boolean;
      };
export type InstalledVersion = {
    version: string;
    buildCode: number;
    sha256: string;
    deltaSupported: boolean;
};
type Transfer = { size: number; sha256: string; downloadUrl: string };
export type Delivery =
    | ({ mode: "full" } & Transfer)
    | ({
          mode: "delta";
          algorithm: "hdiffpatch-zlib-v1";
          baseBuildCode: number;
          baseSha256: string;
      } & Transfer)
    | { mode: "unavailable"; reason: string };

export function majorVersion(version: string) {
    if (!/^(0|[1-9]\d{0,7})\.(0|[1-9]\d{0,7})\.(0|[1-9]\d{0,7})$/.test(version))
        throw new Error("无效版本号");
    return Number(version.split(".")[0]);
}

export function parseRelease(
    input: unknown,
    installedPackage: string,
    installed: InstalledVersion,
): AppRelease | null {
    if (input === null) return null;
    const v = input as Partial<AppRelease> | undefined;
    if (
        !v ||
        v.packageName !== installedPackage ||
        !Number.isInteger(v.buildCode) ||
        v.buildCode! < 1 ||
        v.buildCode! > 2100000000 ||
        typeof v.version !== "string" ||
        !/^\d+\.\d+\.\d+$/.test(v.version) ||
        typeof v.notes !== "string" ||
        v.notes.length > 12000 ||
        typeof v.sha256 !== "string" ||
        !/^[a-f0-9]{64}$/.test(v.sha256) ||
        !Number.isSafeInteger(v.size) ||
        v.size! < 1 ||
        v.size! > 1024 ** 3 ||
        typeof v.publishedAt !== "string" ||
        !v.delivery
    ) {
        throw new Error("版本信息不完整或与当前应用不匹配");
    }
    let expectedMode =
        majorVersion(v.version) === majorVersion(installed.version)
            ? "delta"
            : "full";
    if (majorVersion(v.version) < majorVersion(installed.version))
        throw new Error("禁止版本降级");
    if (v.updatePolicy !== undefined) {
        const policy = v.updatePolicy;
        if (
            !policy ||
            (policy.version !== 2 && policy.version !== 3) ||
            (policy.version === 3 &&
                typeof policy.fullPackageRequired !== "boolean") ||
            !Number.isSafeInteger(policy.releasesBehind) ||
            policy.releasesBehind < 1 ||
            policy.mandatory !== policy.releasesBehind >= 3
        )
            throw new Error("无效更新策略");
        if (
            policy.releasesBehind > 3 ||
            (policy.version === 3 && policy.fullPackageRequired)
        )
            expectedMode = "full";
    }
    const delivery = v.delivery;
    if (delivery.mode === "unavailable") {
        if (
            typeof delivery.reason !== "string" ||
            delivery.reason.length > 1000
        )
            throw new Error("无效更新状态");
        return v as AppRelease;
    }
    if (delivery.mode !== expectedMode)
        throw new Error("更新方式不符合版本规则，已停止下载");
    if (
        !Number.isSafeInteger(delivery.size) ||
        delivery.size < 1 ||
        delivery.size > 1024 ** 3 ||
        !/^[a-f0-9]{64}$/.test(delivery.sha256)
    )
        throw new Error("无效更新包信息");
    if (
        delivery.mode === "full" &&
        (delivery.size !== v.size || delivery.sha256 !== v.sha256)
    )
        throw new Error("完整包信息不匹配");
    if (
        delivery.mode === "delta" &&
        (!installed.deltaSupported ||
            delivery.algorithm !== "hdiffpatch-zlib-v1" ||
            delivery.baseBuildCode !== installed.buildCode ||
            delivery.baseSha256 !== installed.sha256)
    )
        throw new Error("差量包与本机旧版本不匹配");
    const url = new URL(delivery.downloadUrl);
    if (url.protocol !== "https:" || url.username || url.password)
        throw new Error("下载地址必须使用 HTTPS");
    return v as AppRelease;
}

export function isRequiredUpdate(release: AppRelease | null) {
    return release?.updatePolicy?.mandatory === true;
}

export function isFullPackageRequired(release: AppRelease | null) {
    const policy = release?.updatePolicy;
    return policy?.version === 3 && policy.fullPackageRequired;
}

export function isNewerRelease(
    release: AppRelease | null,
    installedCode: string | null,
) {
    return (
        !!release &&
        !!installedCode &&
        /^\d+$/.test(installedCode) &&
        release.buildCode > Number(installedCode)
    );
}

/**
 * 开发者选项「运行环境」的展示行与复制文本。
 * 只允许版本、构建、地址、能力位等设备与构建信息；不得加入账号标识、邮箱或令牌。
 */
export type DeveloperEnvironmentRow = {
    label: string;
    value: string;
};

export type DeveloperEnvironmentSnapshot = {
    appVersion: string;
    buildCode: string;
    applicationId: string;
    runMode: string;
    apiBaseUrl: string;
    releaseApiUrl: string;
    cloudStorage: string;
    system: string;
    nativeModules: string;
    notificationPermission: string;
    exactAlarm: string;
    liveUpdate: string;
    scheduledReminders: string;
};

const ROW_LABELS: Readonly<Record<keyof DeveloperEnvironmentSnapshot, string>> =
    {
        appVersion: "应用版本",
        buildCode: "构建号",
        applicationId: "包名",
        runMode: "运行模式",
        apiBaseUrl: "API 地址",
        releaseApiUrl: "更新服务",
        cloudStorage: "云存储",
        system: "系统",
        nativeModules: "原生模块",
        notificationPermission: "通知权限",
        exactAlarm: "精确闹钟",
        liveUpdate: "动态通知",
        scheduledReminders: "已排程提醒",
    };

export function developerEnvironmentRows(
    snapshot: DeveloperEnvironmentSnapshot,
): DeveloperEnvironmentRow[] {
    return (
        Object.keys(ROW_LABELS) as (keyof DeveloperEnvironmentSnapshot)[]
    ).map((key) => ({ label: ROW_LABELS[key], value: snapshot[key] }));
}

export function formatDeveloperEnvironment(
    snapshot: DeveloperEnvironmentSnapshot,
    generatedAt: Date,
): string {
    return [
        `IRisNote 运行环境（${generatedAt.toISOString()}）`,
        ...developerEnvironmentRows(snapshot).map(
            (row) => `${row.label}：${row.value}`,
        ),
    ].join("\n");
}

export function exactAlarmLabel(
    access: "not-required" | "granted" | "denied" | "unavailable",
): string {
    switch (access) {
        case "granted":
            return "已授权";
        case "denied":
            return "未授权";
        case "not-required":
            return "无需授权";
        default:
            return "不可用";
    }
}

export function liveUpdateLabel(
    progressCapable: boolean,
    compatCapable: boolean,
): string {
    if (progressCapable) return "支持提升式（Android 16+）";
    if (compatCapable) return "仅兼容卡片";
    return "不支持";
}

export type ReleaseNoteSection = {
    title: string;
    items: readonly string[];
};

export type ReleaseHistoryItem = {
    version: string;
    buildCode: number;
    publishedOn: string;
    intro?: string;
    sections: readonly ReleaseNoteSection[];
    footer?: string;
};

/**
 * 面向用户的已构建版本说明。页面还会按本机安装版本过滤，较新的记录不会提前展示。
 * 新版本发布时，应与 releases/notes-*.txt 和最终构建号同步更新。
 */
export const RELEASE_HISTORY: readonly ReleaseHistoryItem[] = [
    {
        version: "0.3.0",
        buildCode: 15,
        publishedOn: "2026-09-21",
        sections: [
            {
                title: "新增功能",
                items: [
                    "待办全面升级：待办现在会保存在本地，重启应用不再丢失；列表按整周分节展示，点选日期即可快速定位，还支持按状态筛选和批量处理。",
                    "待办开始提醒：创建待办时可设置提醒时间，到点后会通过系统通知提醒你，可在设置中管理通知权限。",
                    "待办云同步：登录账号后，待办会自动同步到云端，在多台设备间保持一致；出现冲突时会提供处理入口，由你决定保留哪个版本。",
                    "笔记增量同步：日常同步笔记时只传输有变化的内容，不再每次搬运全部笔记。",
                ],
            },
            {
                title: "体验优化",
                items: ["常用按钮加入触觉反馈，点按操作的手感更清晰。"],
            },
            {
                title: "问题修复",
                items: [
                    "修复选择时间时，时间滚轮偶发的显示异常。",
                    "修复部分历史笔记因云端标记字段为空导致同步失败的问题。",
                ],
            },
            {
                title: "升级提醒",
                items: [
                    "待办云同步需要登录账号后使用；未登录时待办仍为本地保存，功能不受影响。",
                ],
            },
        ],
    },
    {
        version: "0.2.4",
        buildCode: 13,
        publishedOn: "2026-09-21",
        sections: [
            {
                title: "体验优化",
                items: [
                    "更新了应用图标。",
                    "更换头像更顺手：点击用户中心的头像，会以气泡菜单快捷选择“从相册选择”或“拍照”，上传结果也会在顶部以横幅提示。",
                    "优化更新提示策略：当应用落后较多版本时，更新提醒将不再支持跳过，避免继续使用过旧的版本。",
                ],
            },
            {
                title: "问题修复",
                items: [
                    "修复左右滑动页面时，笔记和待办页面边缘偶尔出现灰色细线的问题。",
                    "修复多设备同步时，云端较旧的笔记内容可能覆盖本地较新编辑的问题，同时笔记的编辑时间记录更准确。",
                ],
            },
        ],
    },
    {
        version: "0.2.3",
        buildCode: 12,
        publishedOn: "2026-09-19",
        sections: [
            {
                title: "问题修复",
                items: [
                    "修复切换底部标签页时，毛玻璃区域偶尔出现深灰色闪烁带的问题。",
                ],
            },
        ],
    },
    {
        version: "0.2.2",
        buildCode: 11,
        publishedOn: "2026-09-18",
        sections: [
            {
                title: "问题修复",
                items: [
                    "修复更新安装时可能反复跳转授权页面的问题。",
                    "修复更新安装过程中，正在编辑的笔记可能来不及保存的问题：现在安装前会自动保存当前草稿。",
                ],
            },
            {
                title: "体验优化",
                items: [
                    "更新下载支持后台进行，回到应用后自动继续，并显示实时下载进度。",
                    "更新弹窗界面细节优化。",
                ],
            },
        ],
    },
    {
        version: "0.2.1",
        buildCode: 10,
        publishedOn: "2026-09-17",
        sections: [
            {
                title: "问题修复",
                items: [
                    "修复部分情况下登录时应用闪退的问题。",
                    "修复笔记同步后列表顺序可能变化、偶发列表闪退的问题。",
                ],
            },
            {
                title: "体验优化",
                items: ["待办页日历轨道间距微调，视觉节奏与笔记页保持一致。"],
            },
        ],
    },
    {
        version: "0.2.0",
        buildCode: 7,
        publishedOn: "2026-09-17",
        sections: [
            {
                title: "新增功能",
                items: [
                    "待办页右侧新增日历轨道：上下滑动切换周，点击顶部月份可打开月历快速跳转日期；离开今天后出现“返回今天”按钮，一键回到今天。",
                ],
            },
            {
                title: "体验优化",
                items: ["底部标签栏调整：“待办”移到了“剪贴”右侧。"],
            },
            {
                title: "升级提醒",
                items: [
                    "待办与剪贴仍为占位页面，完整的待办创建和清单功能将在后续版本提供。",
                ],
            },
        ],
    },
    {
        version: "0.1.0",
        buildCode: 6,
        publishedOn: "2026-09-16",
        intro: "欢迎安装 IRisNote，一个本地优先、可多端同步的笔记应用。",
        sections: [
            {
                title: "笔记",
                items: [
                    "创建、编辑、查看笔记，支持置顶、标星与分类整理。",
                    "本地优先：内容保存在本机数据库，离线也能完整使用。",
                    "自动草稿与历史版本，误退出不丢内容。",
                    "阅读进度、字数与预计阅读时长统计。",
                    "多格式分享：复制、Markdown、TXT、PDF、长图导出。",
                ],
            },
            {
                title: "分类",
                items: [
                    "自定义分类：创建、重命名、更换图标、置顶与标星。",
                    "顶部分类栏快速筛选，下拉刷新列表。",
                ],
            },
            {
                title: "账号与同步",
                items: [
                    "邮箱验证码注册、密码登录，会话自动恢复。",
                    "自动同步队列：联网后自动上传本地变更，可在同步任务页查看与管理。",
                ],
            },
            {
                title: "个人工作台",
                items: [
                    "头像上传与内容概览。",
                    "继续阅读、星标笔记与草稿箱快捷入口。",
                ],
            },
            {
                title: "其他",
                items: [
                    "应用内通知横幅，同步与连接状态一目了然。",
                    "本版本为差量更新的基础版本，后续升级仅需下载差量包，更快更省流量。",
                ],
            },
        ],
        footer: "已知限制：待办与剪贴板摘录暂为占位页面，Web 端数据库仍处于早期阶段。",
    },
];

function versionParts(version: string) {
    const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
    return match ? match.slice(1).map(Number) : null;
}

export function compareVersions(left: string, right: string) {
    const leftParts = versionParts(left);
    const rightParts = versionParts(right);
    if (!leftParts || !rightParts) return left.localeCompare(right);
    for (let index = 0; index < 3; index += 1) {
        const difference = leftParts[index] - rightParts[index];
        if (difference !== 0) return difference;
    }
    return 0;
}

/**
 * 真机布局实测：uiautomator dump → 控件树 px/dp 对账单。
 * 用法：node scripts/ui-dump-parse.mjs [--serial <serial>]
 * 流程与判读规则见 docs/IRisNote视觉设计规范.md「真机布局实测验收」。
 */
import { execFileSync } from "node:child_process";

const args = process.argv.slice(2);
const serialFlag = args.indexOf("--serial");
const serial = serialFlag >= 0 ? args[serialFlag + 1] : undefined;
const base = serial ? ["-s", serial] : [];

function adb(subargs) {
    return execFileSync("adb", [...base, ...subargs], {
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024,
        stdio: ["ignore", "pipe", "pipe"],
    });
}

try {
    const densityOut = adb(["shell", "wm", "density"]);
    const density = Number(
        densityOut.match(/Override density: (\d+)/)?.[1] ??
            densityOut.match(/Physical density: (\d+)/)?.[1],
    );
    if (!density) throw new Error(`无法解析屏幕密度：${densityOut.trim()}`);
    const scale = density / 160;

    const dumpOut = adb([
        "shell",
        "uiautomator",
        "dump",
        "/sdcard/window_dump.xml",
    ]);
    if (!/dumped to/i.test(dumpOut)) {
        throw new Error(
            `uiautomator dump 失败（屏幕动画中可重试）：${dumpOut.trim()}`,
        );
    }

    const xml = adb(["exec-out", "cat", "/sdcard/window_dump.xml"]);
    const nodes = [...xml.matchAll(/<node[^>]*>/g)].map((m) => m[0]);
    const attr = (node, name) =>
        node.match(new RegExp(`${name}="([^"]*)"`))?.[1] ?? "";

    const dp = (px) => Math.round((px / scale) * 10) / 10;
    const rows = [];
    for (const node of nodes) {
        const text = attr(node, "text");
        const desc = attr(node, "content-desc");
        const rid = attr(node, "resource-id");
        if (!text && !desc && !rid) continue;
        const bounds = attr(node, "bounds").match(
            /\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]/,
        );
        if (!bounds) continue;
        const [left, top, right, bottom] = bounds.slice(1).map(Number);
        rows.push({
            cls: attr(node, "class").replace(/^android\.\w+\./, ""),
            label: (text || desc || rid.split("/").pop()).slice(0, 24),
            kind: text ? "text" : desc ? "desc" : "rid",
            px: `${left},${top} ${right - left}x${bottom - top}`,
            dp: `${dp(left)},${dp(top)} ${dp(right - left)}x${dp(bottom - top)}`,
        });
    }

    const sizeOut = adb(["shell", "wm", "size"]);
    const size = sizeOut.match(/(\d+)x(\d+)/);
    const [widthPx, heightPx] = size ? size.slice(1).map(Number) : [0, 0];

    console.log(
        `节点总数 ${nodes.length}｜密度 ${density}dpi（1dp=${scale}px）｜屏幕约 ${Math.round(widthPx / scale)}x${Math.round(heightPx / scale)}dp`,
    );
    for (const row of rows) {
        console.log(
            `[${row.cls}·${row.kind}] "${row.label}"  px(${row.px})  dp(${row.dp})`,
        );
    }
    console.log(`共 ${rows.length} 个带文本/无障碍描述/资源ID 的元素`);
} catch (err) {
    console.error(err.message ?? err);
    console.error(
        "提示：确认真机已连接（adb devices）；多设备时用 --serial 指定。",
    );
    process.exit(1);
}

import { createHash } from "node:crypto";
import { createReadStream, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

export function run(command, args = [], options = {}) {
    const { capture = false, ...rest } = options;
    // Windows .cmd/.bat require cmd.exe. Arguments are quoted separately and shell
    // metacharacters are rejected; never interpolate passwords into a command.
    if (process.platform === "win32" && /\.(cmd|bat)$/i.test(command)) {
        if (!path.isAbsolute(command)) {
            const resolved = (process.env.PATH || process.env.Path || "")
                .split(path.delimiter)
                .map((directory) =>
                    path.join(directory.replace(/^"|"$/g, ""), command),
                )
                .find((candidate) => existsSync(candidate));
            if (!resolved) throw new Error(`找不到命令 ${command}`);
            command = resolved;
        }
        const quote = (value) => {
            if (/["%\r\n&|<>^!]/.test(value))
                throw new Error("命令参数含不支持的 Windows shell 字符");
            return `"${value}"`;
        };
        return run(
            process.env.ComSpec || "cmd.exe",
            ["/d", "/s", "/c", `"${[command, ...args].map(quote).join(" ")}"`],
            { capture, ...rest, windowsVerbatimArguments: true },
        );
    }
    const result = spawnSync(command, args, {
        stdio: capture ? "pipe" : "inherit",
        encoding: "utf8",
        windowsHide: true,
        ...rest,
    });
    if (result.error || result.status !== 0)
        throw new Error(
            `${path.basename(command)} 执行失败${capture ? `: ${result.stderr || result.stdout}` : "，请查看上方日志"}`,
        );
    return result.stdout?.trim() ?? "";
}
export const npm = process.platform === "win32" ? "npm.cmd" : "npm";
export async function fileSha256(file) {
    const hash = createHash("sha256");
    for await (const chunk of createReadStream(file)) hash.update(chunk);
    return hash.digest("hex");
}
export function parseApkInfo(output) {
    const match = output.match(
        /package: name='([^']+)' versionCode='(\d+)' versionName='([^']+)'/,
    );
    if (!match) throw new Error("无法读取 APK 包信息");
    return {
        packageName: match[1],
        buildCode: Number(match[2]),
        version: match[3],
    };
}
export function validateApkInfo(info, release) {
    if (
        info.packageName !== release.package_name ||
        info.buildCode !== release.build_code ||
        info.version !== release.version
    )
        throw new Error("APK 的包名、版本或构建号与预留记录不一致");
}
export function certificateDigest(output) {
    const digests = [
        ...output.matchAll(
            /^(?:Signer #\d+ certificate|V(?:1|2|3(?:\.1)?) Signer: certificate) SHA-256 digest:[ \t]*([a-f0-9]{64})[ \t]*\r?$/gmi,
        ),
    ].map((m) => m[1].toLowerCase());
    if (digests.length !== 1)
        throw new Error("安装包必须包含且仅包含一个可核对的签名证书");
    return digests[0];
}

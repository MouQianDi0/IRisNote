export type ReleaseNoteSection = {
    title: string;
    items: readonly string[];
};

export type ReleaseHistoryItem = {
    version: string;
    buildCode: number;
    publishedOn: string;
    sections: readonly ReleaseNoteSection[];
};

/**
 * 服务端历史说明条目（GET /api/releases/history）。
 * notes 是按更新说明编写规范生成的纯文本：标题行 + “- ”列表项。
 */
export type ServerRelease = {
    version: string;
    buildCode: number;
    notes: string;
    publishedAt: string;
};

const MAX_RELEASES = 100;
const MAX_NOTES_CHARS = 12000;

/**
 * 把服务端纯文本说明解析为分组结构。
 * 首行“IRisNote <版本号> 更新说明”是标题占位，跳过；无标题行的散落条目归入“更新内容”。
 */
export function parseReleaseNotes(notes: string): ReleaseNoteSection[] {
    const sections: ReleaseNoteSection[] = [];
    let current: { title: string; items: string[] } | null = null;
    const pushCurrent = () => {
        if (current && current.items.length > 0) sections.push({ ...current });
        current = null;
    };
    for (const rawLine of notes.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line) continue;
        if (line.startsWith("-")) {
            const item = line.replace(/^-\s*/, "").trim();
            if (!item) continue;
            if (!current) current = { title: "更新内容", items: [] };
            current.items.push(item);
            continue;
        }
        if (/^IRisNote\s+\d+\.\d+\.\d+\s+更新说明$/.test(line)) continue;
        pushCurrent();
        current = { title: line, items: [] };
    }
    pushCurrent();
    return sections;
}

/** 校验并归一化服务端返回的历史列表；任何字段非法即返回 null（由调用方降级）。 */
export function parseReleaseHistory(
    input: unknown,
): readonly ReleaseHistoryItem[] | null {
    if (!Array.isArray(input)) return null;
    if (input.length === 0 || input.length > MAX_RELEASES) return null;
    const seen = new Set<string>();
    const items: ReleaseHistoryItem[] = [];
    for (const entry of input) {
        const v = entry as Partial<ServerRelease> | null;
        if (
            !v ||
            typeof v.version !== "string" ||
            !/^\d+\.\d+\.\d+$/.test(v.version) ||
            !Number.isInteger(v.buildCode) ||
            v.buildCode! < 1 ||
            v.buildCode! > 2100000000 ||
            typeof v.notes !== "string" ||
            v.notes.length > MAX_NOTES_CHARS ||
            typeof v.publishedAt !== "string"
        )
            return null;
        if (seen.has(v.version)) return null;
        seen.add(v.version);
        const date = /^\d{4}-\d{2}-\d{2}/.exec(v.publishedAt);
        items.push({
            version: v.version,
            buildCode: v.buildCode!,
            publishedOn: date ? date[0] : "",
            sections: parseReleaseNotes(v.notes),
        });
    }
    return items;
}

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

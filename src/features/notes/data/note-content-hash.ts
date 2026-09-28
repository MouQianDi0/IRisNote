import type { ApplicationDatabase } from "@/core/database";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";

/** 与服务端一致：正文原样按 UTF-8 编码后取 SHA-256（小写十六进制），不做任何规范化；null 正文没有哈希。 */
export function noteContentHash(content: string | null): string | null {
    return content === null ? null : bytesToHex(sha256(utf8ToBytes(content)));
}

/**
 * 为有云端副本、正文非空却还没有哈希的本地笔记补算哈希。正文改写会由触发器清空哈希，
 * 因此只有新写入或改过的正文需要计算；写回时核对正文未被并发修改。
 */
export async function fillLocalContentHashes(
    db: ApplicationDatabase,
    owner: number,
    check: () => void,
) {
    const rows = await db.getAll<{ client_id: number; content: string }>(
        `SELECT client_id,content FROM local_notes
         WHERE owner_user_id=? AND server_id IS NOT NULL AND content IS NOT NULL AND content_hash IS NULL`,
        [owner],
    );
    if (!rows.length) return 0;
    check();
    const hashes = rows.map((row) => noteContentHash(row.content));
    await db.transaction(async (tx) => {
        check();
        for (const [index, row] of rows.entries()) {
            await tx.run(
                `UPDATE local_notes SET content_hash=?
                 WHERE owner_user_id=? AND client_id=? AND content IS ? AND content_hash IS NULL`,
                [hashes[index], owner, row.client_id, row.content],
            );
        }
    });
    return rows.length;
}

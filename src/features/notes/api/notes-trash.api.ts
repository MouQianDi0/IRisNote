import api from "@/shared/http/client";
import { parseCloudNote } from "./notes-sync.types";
import {
    parseDeletedNote,
    parseDeletion,
    parseTrashPage,
    parseTrashState,
    type NoteDeletion,
} from "./notes-trash.types";

export const notesTrashApi = {
    async list(owner: number) {
        return parseTrashPage(
            (await api.get<unknown>("/notes/trash")).data,
            owner,
        );
    },
    async status(owner: number, id: number) {
        return parseTrashState(
            (await api.get<unknown>(`/notes/${id}/trash`)).data,
            owner,
            id,
        );
    },
    async remove(
        owner: number,
        id: number,
        client_id: string,
        version: number,
    ) {
        const note = parseDeletedNote(
            (
                await api.post<unknown>(`/notes/${id}/trash`, {
                    client_id,
                    version,
                })
            ).data,
            owner,
        );
        if (
            note.id !== id ||
            note.client_id !== client_id ||
            note.version !== version + 1
        )
            throw new Error("删除回执与笔记不匹配");
        return note;
    },
    async restore(owner: number, receipt: NoteDeletion) {
        const note = parseCloudNote(
            (await api.post<unknown>(`/notes/${receipt.id}/restore`, receipt))
                .data,
            owner,
        );
        if (
            note.id !== receipt.id ||
            note.client_id !== receipt.client_id ||
            note.version <= receipt.version
        )
            throw new Error("恢复回执与笔记不匹配");
        return note;
    },
    async purge(receipt: NoteDeletion) {
        const { data } = await api.post<unknown>(
            `/notes/${receipt.id}/purge`,
            receipt,
        );
        if (
            !data ||
            typeof data !== "object" ||
            !("purged" in data) ||
            data.purged !== true ||
            !("deletion" in data)
        )
            throw new Error("清理回执无效");
        const result = parseDeletion(data.deletion);
        if (JSON.stringify(result) !== JSON.stringify(receipt))
            throw new Error("清理回执与删除版本不匹配");
        return result;
    },
};

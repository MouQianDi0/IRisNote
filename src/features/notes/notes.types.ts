export type NoteSyncStatus =
    | "pending"
    | "syncing"
    | "synced"
    | "rejected"
    | "unknown";

export type NoteSyncOperation = "create" | "update";

/**
 * 笔记模块使用的本地域模型。
 *
 * 服务器已有笔记的 id 为正数；本地新建笔记的 id 为稳定负数。
 * 所有云端请求必须使用 server_id，禁止把负数客户端 id 写入接口路径。
 */
export type Note = {
    id: number;
    server_id?: number | null;
    user_id?: number;
    title: string;
    content: string | null;
    category_id: number | null;
    created_at: string;
    is_pinned?: boolean;
    is_starred?: boolean;
    local_order?: number;
    pinned_order?: number;
    sync_status?: NoteSyncStatus;
    sync_operation?: NoteSyncOperation | null;
    last_sync_error?: string | null;
    local_updated_at?: string;
    /** 本地当前稳定版本指针；服务器来源的笔记在合并入库前为空。 */
    current_revision_id?: string | null;
};

/** Notes API 返回的服务端 DTO，不包含本地同步字段。 */
export type ServerNote = Omit<
    Note,
    | "server_id"
    | "sync_status"
    | "sync_operation"
    | "last_sync_error"
    | "local_updated_at"
>;

export type CreateNotePayload = {
    title: string;
    content: string;
    category_id?: number;
};

export type UpdateNotePayload = Partial<
    Pick<Note, "title" | "content" | "category_id" | "is_pinned" | "is_starred">
>;

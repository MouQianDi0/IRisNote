/** 创建时间、内容编辑时间和版本保存时间共用格式，未知编辑时间不能回退成创建时间。 */
export function formatNoteHistoryTime(value: string | null | undefined) {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date.toLocaleString("zh-CN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
    });
}

export function noteEditTimeLabel(value: string | null | undefined) {
    const time = formatNoteHistoryTime(value);
    return time ? `最后编辑 ${time}` : "编辑时间未知";
}

import { Redirect, useLocalSearchParams } from "expo-router";

/** 兼容旧编辑深链；现有笔记统一在详情页内完成查看与编辑。 */
export default function EditNoteScreen() {
    const params = useLocalSearchParams<{ id?: string | string[] }>();
    const id = Array.isArray(params.id) ? params.id[0] : params.id;

    return (
        <Redirect
            href={{
                pathname: "/pages/note/[id]",
                params: { id: id ?? "", edit: "1" },
            }}
        />
    );
}

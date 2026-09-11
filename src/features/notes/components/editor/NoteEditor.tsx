import { useApplicationDatabase } from "@/core/database";
import { banner, captureNotificationSession } from "@/core/notifications";
import { PlainTextEditor, type PlainTextEditorValue } from "@/core/editor";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { Button, Column, Host } from "@expo/ui";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { noteDraftValue } from "../../data/note-draft.repository";
import { useNoteDraft } from "../../hooks/useNoteDraft";
import NewNoteEditor from "./new-note-editor";
import { LocalOnlyText } from "@/shared/ui/local-only-text";
import { colors } from "@/shared/theme";
import { History as RotateCcwClock } from "lucide-react-native";
import type { Note } from "../../notes.types";
import { saveEditedNoteLocalFirst, saveNewNoteLocalFirst } from "../../services/note-save.service";

type NoteEditorProps = {
    draftKey?: string;
    autoFocusContent?: boolean;
    note?: Note;
    categoryId?: number | null;
    categoryName?: string;
    onCancel: () => void;
    onSaved: (note: Note) => void;
};

/** 账户变化时整个会话重新挂载，旧账户输入不会复用。 */
export default function NoteEditor(props: NoteEditorProps) {
    const { user } = useAuth();
    if (!user) return <View className="flex-1 bg-white p-5"><Text>请登录后编辑笔记</Text></View>;
    if (props.note?.user_id != null && props.note.user_id !== user.id) {
        return <View className="flex-1 bg-white p-5"><Text>正在切换账户，请重新打开笔记</Text></View>;
    }
    if (!props.note) return <NewNoteEditor key={user.id + ":" + (props.draftKey ?? "new")} {...props} owner={user.id} />;
    return <DraftEditor key={user.id + ":" + props.note.id} {...props} owner={user.id} />;
}

function DraftEditor({ note, categoryId = null, categoryName, autoFocusContent = false, onCancel, onSaved, owner }: NoteEditorProps & { owner: number }) {
    const database = useApplicationDatabase();
    const draft = useNoteDraft(owner, note ? "note:" + note.id : "new", note,
        note ? noteDraftValue(note) : { title: "", content: "", categoryId });
    const [message, setMessage] = useState("");
    const [showSaved, setShowSaved] = useState(false);
    const [confirmDiscard, setConfirmDiscard] = useState(false);
    const [savedResult, setSavedResult] = useState<Note | null>(null);
    const submitting = useRef(false);
    const mounted = useRef(true);
    useEffect(() => {
        mounted.current = true;
        return () => { mounted.current = false; };
    }, []);

    const handleSave = async (value: PlainTextEditorValue) => {
        if (submitting.current) return;
        if (!value.title.trim()) { setMessage("请输入笔记标题"); return; }
        if (!note && !value.content.trim()) { setMessage("请输入笔记内容"); return; }
        setMessage("");
        submitting.current = true;
        const sessionCurrent = captureNotificationSession();
        const noticeId = `note-save:${owner}:${Date.now()}`;
        let committed = false;
        const onLocalSaved = () => {
            committed = true;
            if (sessionCurrent()) banner.show({ id: noticeId, type: "success", title: "笔记已保存", message: "仅本机保存，正在尝试同步到云端。" });
        };
        try {
            const snapshot = await draft.beginSave();
            if (!mounted.current) return;
            const payload = {
                title: snapshot.value.title.trim(),
                content: snapshot.value.content.trim(),
                category_id: snapshot.value.categoryId,
            };
            const result = snapshot.target
                ? await saveEditedNoteLocalFirst(database, owner, snapshot.target, payload, snapshot.commit, onLocalSaved)
                : await saveNewNoteLocalFirst(database, owner,
                    { ...payload, category_id: payload.category_id ?? undefined }, snapshot.commit, onLocalSaved);
            if (sessionCurrent()) {
                const notice = result.cloudState === "accepted"
                    ? { type: "success" as const, title: result.unchanged ? "内容未变化，笔记已同步" : "笔记已同步到云端" }
                    : { type: "important" as const, title: "笔记仅本机保存成功，云端同步未完成", message: result.cloudState === "unknown" ? "云端接收结果未知，请稍后检查同步状态" : "云端未接受保存，请检查页面提示" };
                if (!banner.resolve(noticeId, { ...notice, lifetime: notice.type === "important" ? { mode: "persistent" } : { mode: "timed" } })) banner.show({ id: noticeId, ...notice });
            }
            if (!mounted.current) return;
            draft.endSave(true);
            if (result.cloudState === "accepted") {
                if (result.unchanged) {
                    console.info("[NoteEditor] 保存内容未变化，未创建新版本", { clientId: result.note.id });
                }
                onSaved(result.note); return;
            }
            setSavedResult(result.note);
            setMessage(result.unchanged
                ? result.cloudState === "unknown"
                    ? "内容没有变化，未创建新版本。云端接收结果未知，草稿已保留。"
                    : "内容没有变化，未创建新版本。云端未接受保存，草稿已保留。"
                : result.cloudState === "unknown"
                    ? "已保存到本地，云端接收结果未知。草稿已保留，恢复时会关联这篇笔记。"
                    : "已保存到本地，云端未接受保存。草稿已保留，可稍后重新打开处理。");
        } catch (cause: unknown) {
            if (sessionCurrent()) {
                const notice = { type: "important" as const, title: committed ? "仅本机已保存，后续处理未完成" : "保存失败，请保留当前编辑内容" };
                if (!banner.update(noticeId, { ...notice, lifetime: { mode: "persistent" } })) banner.show({ id: noticeId, ...notice });
            }
            if (!mounted.current) return;
            draft.endSave(false);
            setMessage(cause instanceof Error ? cause.message : "保存失败，草稿已保留，请重试");
        } finally {
            submitting.current = false;
        }
    };

    const actions = (children: ReactNode) => (
        <Host matchContents><Column spacing={8}>{children}</Column></Host>
    );

    if (!draft.resource) {
        return <View className="flex-1 bg-white p-5">
            <Text className="mb-3 text-lg">{draft.error || "正在读取本地草稿…"}</Text>
            {!draft.error && <ActivityIndicator />}
            {actions(<>
                {draft.error && <Button label="重试读取" onPress={draft.retry} />}
                <Button label="返回" variant="text" onPress={onCancel} />
            </>)}
        </View>;
    }

    if (draft.recovery) {
        return <ScrollView className="flex-1 bg-white" contentContainerStyle={{ padding: 20 }}>
            <Text className="mb-3 text-xl font-semibold">发现本地草稿</Text>
            <Text className="mb-3">{draft.resource.conflict
                ? "已保存内容发生变化。草稿仍保留，可以查看和复制；为避免覆盖，本次恢复不能直接提交。"
                : "可以继续编辑草稿，或先查看已保存内容。放弃草稿需要再次确认。"}</Text>
            <Text className="mb-3">{draft.error}</Text>
            {actions(<>
                <Button label="继续草稿" disabled={draft.saving} onPress={draft.continueDraft} />
                <Button label={showSaved ? "收起已保存内容" : "查看已保存内容"} variant="outlined" onPress={() => setShowSaved(!showSaved)} />
                {!confirmDiscard ? <Button label="放弃草稿" variant="text" disabled={draft.saving} onPress={() => setConfirmDiscard(true)} /> : <>
                    <Button label="确认永久放弃此草稿" disabled={draft.saving} onPress={() => {
                        setConfirmDiscard(false); void draft.discard();
                    }} />
                    <Button label="保留草稿" variant="text" onPress={() => setConfirmDiscard(false)} />
                </>}
                <Button label="返回" variant="text" disabled={draft.saving} onPress={onCancel} />
            </>)}
            {showSaved && <View className="mt-5">
                <Text className="mb-2 font-semibold">已保存内容</Text>
                <Text selectable>{draft.resource.current.title}</Text>
                <Text selectable>{draft.resource.current.content || "（空正文）"}</Text>
            </View>}
            <View className="mt-5">
                <Text className="mb-2 font-semibold">草稿内容</Text>
                <Text selectable>{draft.resource.session.value.title}</Text>
                <Text selectable>{draft.resource.session.value.content || "（空正文）"}</Text>
            </View>
        </ScrollView>;
    }

    const hasStatus = draft.state === "error" || !!draft.error || !!message || !!draft.resource.conflict || !!savedResult;
    return <PlainTextEditor
        key={draft.resource.row.session_id}
        initialValue={draft.resource.session.value}
        autoFocusContent={autoFocusContent}
        screenTitle={note ? "编辑笔记" : "新建笔记"}
        saving={draft.saving && !savedResult}
        disabled={savedResult !== null}
        onChange={(value) => draft.change({ ...value, categoryId: draft.resource!.session.value.categoryId })}
        onBlur={draft.requestFlush}
        onCancel={onCancel}
        onSubmit={handleSave}
        headerActions={<View
            accessible
            accessibilityRole="button"
            accessibilityLabel="历史记录，暂未开放"
            accessibilityState={{ disabled: true }}
            className="p-2"
        >
            {/* 当前 Lucide 版本以 History 导出 rotate-ccw-clock 的相同路径。 */}
            <RotateCcwClock size={24} color={colors.textPrimary} />
        </View>}
        statusContent={hasStatus ? <View className="px-5 py-2">
            {!note && draft.resource.session.value.categoryId !== null &&
                <Text>分类：{draft.resource.session.value.categoryId === categoryId ? categoryName : "#" + draft.resource.session.value.categoryId}</Text>}
            {draft.state === "error" && <Text accessibilityLiveRegion="polite">草稿写入失败</Text>}
            {(draft.error || message) ? <Text accessibilityRole="alert"><LocalOnlyText>{draft.error || message}</LocalOnlyText></Text> : null}
            {draft.resource.conflict && <Text>基础内容已变化，草稿保留中，保存已阻止。</Text>}
            {actions(<>
                {draft.state === "error" && <Button label="重试写入草稿" onPress={draft.retry} />}
                {savedResult ? <Button label="完成并返回" onPress={() => onSaved(savedResult)} /> :
                    <Button label="查看草稿与已保存内容" variant="text" disabled={draft.saving} onPress={draft.showRecovery} />}
            </>)}
        </View> : null}
    />;
}

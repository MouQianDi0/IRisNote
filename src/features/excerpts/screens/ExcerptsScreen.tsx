import { useCallback, useEffect, useMemo, useState } from "react";
import { useFocusEffect } from "expo-router";
import { Clipboard } from "lucide-react-native";
import { ActivityIndicator, FlatList, Pressable, Text, View } from "react-native";
import { banner } from "@/core/notifications";
import { excerptSessionSupported } from "../services/excerpt-session-notifications";
import { semanticColors } from "@/shared/theme";
import { Input } from "@/shared/ui";
import DeleteConfirmDialog from "@/shared/ui/Dialog/DeleteConfirmDialog";
import { ExcerptActionDialog } from "../components/ExcerptActionDialog";
import { ExcerptCard } from "../components/ExcerptCard";
import { ClipboardDetectConfirmDialog } from "../components/ClipboardDetectConfirmDialog";
import { ClipboardDetectedCard } from "../components/ClipboardDetectedCard";
import { ClipboardHintBar } from "../components/ClipboardHintBar";
import { ExcerptFormDialog } from "../components/ExcerptFormDialog";
import { ExcerptStashPanel } from "../components/ExcerptStashPanel";
import { DraftDialog } from "@/shared/ui/Dialog/dialog";
import type { ExcerptStashItem } from "../data/excerpt-stash.repository";
import { mergeStashContents } from "../domain/excerpt-stash-merge";
import { useClipboardOfferStore, type ClipboardOffer } from "../state/clipboard-offer-store";
import { useExcerptStash } from "../hooks/useExcerptStash";
import { ExcerptToolbar } from "../components/ExcerptToolbar";
import { ExcerptSessionDialog } from "../components/ExcerptSessionDialog";
import { filterExcerpts } from "../domain/excerpt-validation";
import { useClipboardDetection } from "../hooks/useClipboardDetection";
import { useClipboardPreferences } from "../hooks/useClipboardPreferences";
import { useExcerptScope } from "../hooks/useExcerptScope";
import { clipboardService } from "../services/clipboard.service";
import {
    copyExcerptText,
    newExcerptId,
    saveDetectedOffer,
    pasteClipboardAsExcerpt,
} from "../services/excerpt-service";
import { excerptRepository } from "../state/excerpt-store";
import { useExcerptSessionStore } from "../state/excerpt-session-store";
import { ExcerptError, type ExcerptEntity } from "../excerpts.types";

const NO_EXCERPTS: readonly ExcerptEntity[] = [];

const errorMessage = (cause: unknown) =>
    cause instanceof Error ? cause.message : "请重试";

function ExcerptEmpty({ searching }: { searching: boolean }) {
    return (
        <View
            style={{
                flex: 1,
                alignItems: "center",
                justifyContent: "center",
                paddingHorizontal: 16,
            }}
        >
            <Clipboard size={48} color={semanticColors.textDisabled} />
            <Text
                style={{
                    marginTop: 12,
                    fontSize: 17,
                    color: semanticColors.textPrimary,
                }}
            >
                {searching ? "没有匹配的摘录" : "还没有摘录"}
            </Text>
            {!searching && (
                <Text
                    style={{
                        marginTop: 6,
                        fontSize: 13,
                        textAlign: "center",
                        color: semanticColors.textSecondary,
                    }}
                >
                    点右上角粘贴，或点 + 手动添加
                </Text>
            )}
        </View>
    );
}

export default function ExcerptsScreen() {
    const scope = useExcerptScope();
    const { ownerKey, generation, ready } = scope;
    const [searchOpen, setSearchOpen] = useState(false);
    const [keyword, setKeyword] = useState("");
    const [pasting, setPasting] = useState(false);
    const [statusBusy, setStatusBusy] = useState(false);
    const [actionId, setActionId] = useState<string | null>(null);
    const [editing, setEditing] = useState<ExcerptEntity | null>(null);
    const [deleting, setDeleting] = useState<ExcerptEntity | null>(null);
    const [now, setNow] = useState(() => new Date());
    const [confirmingDetect, setConfirmingDetect] = useState(false);
    const [stashPanel, setStashPanel] = useState(false);
    const [stashBusy, setStashBusy] = useState(false);
    const [stashError, setStashError] = useState("");
    const [stashForm, setStashForm] = useState<{ kind: "offer"; offer: ClipboardOffer } | { kind: "edit"; item: ExcerptStashItem } | { kind: "merge" } | null>(null);
    const [separator, setSeparator] = useState(true);
    const clipboardPreferences = useClipboardPreferences();
    const [sessionDialogOpen, setSessionDialogOpen] = useState(false);
    const sessionState = useExcerptSessionStore();

    // 回到页面时刷新「今天/昨天」的判断基准。
    useFocusEffect(useCallback(() => setNow(new Date()), []));

    const entities = ready ? scope.entities : NO_EXCERPTS;
    const visible = useMemo(
        () => filterExcerpts(entities, keyword),
        [entities, keyword],
    );
    const detection = useClipboardDetection();
    const stash = useExcerptStash(ownerKey, ready);
    useEffect(() => {
        const offer = useClipboardOfferStore.getState().offer;
        if (offer?.ownerKey === ownerKey && stash.items.some((item) => item.contentHash === offer.hash))
            useClipboardOfferStore.setState({ offer: null });
    }, [ownerKey, stash.items]);
    const stashAction = async (action: () => Promise<void>) => {
        if (stashBusy) return false;
        setStashBusy(true); setStashError("");
        try { await action(); await stash.refresh(); return true; }
        catch (cause) { setStashError(errorMessage(cause)); return false; }
        finally { setStashBusy(false); }
    };
    const showHint =
        clipboardPreferences.ready &&
        !clipboardPreferences.autoDetectEnabled &&
        !clipboardPreferences.hintDismissed &&
        !sessionState.session;

    const enableDetection = async () => {
        try {
            await clipboardPreferences.setAutoDetect(true);
            setConfirmingDetect(false);
        } catch (cause) {
            banner.show({
                title: "开启失败",
                message: errorMessage(cause),
                type: "important",
            });
        }
    };

    // 操作弹窗始终展示最新版本，置顶切换后无需重新打开。
    const actionTarget =
        entities.find((excerpt) => excerpt.clientId === actionId) ?? null;

    const paste = async () => {
        if (pasting || !ready) return;
        setPasting(true);
        try {
            const receipt = await pasteClipboardAsExcerpt(
                excerptRepository,
                clipboardService.readText,
                ownerKey,
                generation,
            );
            banner.show(
                receipt.duplicated
                    ? {
                          title: "已存在相同摘录",
                          message: "已移到最前",
                          type: "neutral",
                      }
                    : { title: "已保存为摘录", type: "success" },
            );
        } catch (cause) {
            banner.show(
                cause instanceof ExcerptError && cause.code === "empty"
                    ? {
                          title: cause.message,
                          message: "复制文字后再试",
                          type: "neutral",
                      }
                    : {
                          title: "粘贴失败",
                          message: errorMessage(cause),
                          type: "important",
                      },
            );
        } finally {
            setPasting(false);
        }
    };

    const copy = useCallback(async (excerpt: ExcerptEntity) => {
        try {
            await copyExcerptText(clipboardService.writeText, excerpt.content);
            banner.show({ title: "已复制", type: "success" });
        } catch (cause) {
            banner.show({
                title: "复制失败",
                message: errorMessage(cause),
                type: "important",
            });
        }
    }, []);

    const openActions = useCallback(
        (excerpt: ExcerptEntity) => setActionId(excerpt.clientId),
        [],
    );

    const togglePin = async () => {
        if (!actionTarget || statusBusy) return;
        setStatusBusy(true);
        try {
            await excerptRepository.update(
                ownerKey,
                actionTarget,
                { isPinned: !actionTarget.isPinned },
                new Date(),
            );
        } catch (cause) {
            banner.show({
                title: "置顶失败",
                message: errorMessage(cause),
                type: "important",
            });
        } finally {
            setStatusBusy(false);
        }
    };

    const runAction = (action: (excerpt: ExcerptEntity) => void) => {
        if (!actionTarget) return;
        const target = actionTarget;
        setActionId(null);
        action(target);
    };

    return (
        <View className="mt-[15px] flex-1 bg-app-background">
            <View className="relative flex-1 border-t border-note-page-border bg-white">
                <View style={{ flex: 1, padding: 16, paddingBottom: 24 }}>
                    <ExcerptToolbar
                        count={entities.length}
                        searchOpen={searchOpen}
                        pasting={pasting}
                        disabled={!ready}
                        sessionSupported={excerptSessionSupported()}
                        sessionActive={
                            !!sessionState.session &&
                            sessionState.session.ownerKey === ownerKey
                        }
                        sessionDisabled={
                            !ready ||
                            !sessionState.ready ||
                            sessionState.pending
                        }
                        onSession={() => setSessionDialogOpen(true)}
                        onSearch={() => {
                            setSearchOpen(!searchOpen);
                            setKeyword("");
                        }}
                        onPaste={() => void paste()}
                    />
                    {searchOpen && (
                        <View style={{ marginTop: 12 }}>
                            <Input
                                size="compact"
                                placeholder="搜索摘录"
                                accessibilityLabel="搜索摘录"
                                value={keyword}
                                onChangeText={setKeyword}
                                clearable
                                autoFocus
                            />
                        </View>
                    )}
                    {detection.offer &&
                    ready &&
                    detection.offer.ownerKey === ownerKey &&
                    detection.offer.generation === generation ? (
                        <View style={{ marginTop: 12 }}>
                            <ClipboardDetectedCard
                                content={detection.offer.content}
                                onDismiss={() => useClipboardOfferStore.setState({ offer: null })}
                                onSave={() => { if (detection.offer) setStashForm({ kind: "offer", offer: detection.offer }); }}
                            />
                        </View>
                    ) : (
                        showHint && (
                            <View style={{ marginTop: 12 }}>
                                <ClipboardHintBar
                                    disabled={clipboardPreferences.pending}
                                    onEnable={() => setConfirmingDetect(true)}
                                    onDismiss={() =>
                                        void clipboardPreferences
                                            .dismissHint()
                                            .catch(() => undefined)
                                    }
                                />
                            </View>
                        )
                    )}
                    {ready && stash.items.length > 0 && <Pressable accessibilityRole="button" accessibilityLabel={`查看暂存区，${stash.items.length} 条未合并`} onPress={() => setStashPanel(true)} style={{ marginTop: 12, padding: 16, borderRadius: 16, backgroundColor: semanticColors.surfaceSelected }}>
                        <Text style={{ color: semanticColors.brandPrimary }}>暂存区 · {stash.items.length} 条未合并　查看</Text>
                        <Text numberOfLines={2} style={{ marginTop: 8, color: semanticColors.textPrimary }}>{stash.items.at(-1)?.content}</Text>
                    </Pressable>}
                    {ready ? (
                        <FlatList
                            style={{ marginTop: 12, flex: 1 }}
                            data={visible}
                            keyExtractor={(excerpt) => excerpt.clientId}
                            keyboardShouldPersistTaps="handled"
                            overScrollMode="never"
                            contentContainerStyle={{
                                paddingBottom: 90,
                                flexGrow: 1,
                            }}
                            ItemSeparatorComponent={() => (
                                <View style={{ height: 12 }} />
                            )}
                            ListEmptyComponent={
                                <ExcerptEmpty searching={!!keyword.trim()} />
                            }
                            renderItem={({ item }) => (
                                <ExcerptCard
                                    excerpt={item}
                                    now={now}
                                    onPress={openActions}
                                    onCopy={copy}
                                />
                            )}
                        />
                    ) : (
                        <View
                            style={{
                                flex: 1,
                                alignItems: "center",
                                justifyContent: "center",
                            }}
                        >
                            <ActivityIndicator
                                color={semanticColors.brandPrimary}
                            />
                        </View>
                    )}
                </View>
            </View>
            <ExcerptActionDialog
                excerpt={actionTarget}
                busy={statusBusy}
                onClose={() => setActionId(null)}
                onTogglePin={() => void togglePin()}
                onEdit={() => runAction(setEditing)}
                onCopy={() => runAction((excerpt) => void copy(excerpt))}
                onDelete={() => runAction(setDeleting)}
            />
            {editing && ready && (
                <ExcerptFormDialog
                    key={editing.clientId}
                    ownerKey={ownerKey}
                    generation={generation}
                    base={editing}
                    onClose={() => setEditing(null)}
                />
            )}
            {stashPanel && !stashForm && <DraftDialog visible title={`暂存区（${stash.items.length} 条）`} onClose={() => setStashPanel(false)} closeOnScrimTap={!stashBusy}>
                <ExcerptStashPanel items={stash.items} busy={stashBusy} onReorder={(ids) => stashAction(() => stash.repository.reorder(ownerKey, ids))} onEdit={(item) => setStashForm({ kind: "edit", item })} onRemove={(id) => void stashAction(() => stash.repository.remove(ownerKey, id))} onClear={() => void stashAction(() => stash.repository.clear(ownerKey))} onMerge={() => { setSeparator(true); setStashForm({ kind: "merge" }); }} />
                {stashError && <Text accessibilityRole="alert" style={{ color: semanticColors.destructive }}>{stashError}</Text>}
            </DraftDialog>}
            {stashForm && ready && <ExcerptFormDialog key={stashForm.kind === "edit" ? stashForm.item.clientId : stashForm.kind} ownerKey={ownerKey} generation={generation} duplicateMessage={stashForm.kind === "edit" ? "已在暂存中" : undefined} initialText={stashForm.kind === "offer" ? stashForm.offer.content : stashForm.kind === "edit" ? stashForm.item.content : mergeStashContents(stash.items, separator)} mergeSeparator={stashForm.kind === "merge" ? { enabled: separator, onChange: setSeparator, regenerate: (enabled) => mergeStashContents(stash.items, enabled) } : undefined} onClose={() => setStashForm(null)} onSaved={() => {
                if (stashForm.kind === "offer" && useClipboardOfferStore.getState().offer === stashForm.offer) useClipboardOfferStore.setState({ offer: null });
                else void stash.refresh();
                setStashForm(null);
                if (stashForm.kind === "merge") setStashPanel(false);
            }} submitText={async (text) => {
                if (stashForm.kind === "edit") return stash.repository.update(ownerKey, stashForm.item.clientId, text);
                if (stashForm.kind === "merge") {
                    excerptRepository.assertSession(ownerKey, generation);
                    const receipt = await excerptRepository.save(ownerKey, newExcerptId(), text, "manual", new Date());
                    if (receipt.duplicated) return "duplicate";
                    await stash.repository.clear(ownerKey);
                    return "saved";
                }
                const receipt = await saveDetectedOffer(excerptRepository, stashForm.offer, text);
                return receipt.duplicated ? "duplicate" : "saved";
            }} />}
            <ClipboardDetectConfirmDialog
                visible={confirmingDetect}
                pending={clipboardPreferences.pending}
                onCancel={() => setConfirmingDetect(false)}
                onConfirm={() => void enableDetection()}
            />
            {excerptSessionSupported() && sessionDialogOpen && (
                <ExcerptSessionDialog
                    visible
                    onClose={() => setSessionDialogOpen(false)}
                />
            )}
            <DeleteConfirmDialog
                visible={!!deleting}
                description={"删除后无法找回\n该摘录将被永久删除"}
                onClose={() => setDeleting(null)}
                onConfirm={async () => {
                    if (!deleting) return;
                    excerptRepository.assertSession(ownerKey, generation);
                    const current = excerptRepository.get(
                        ownerKey,
                        deleting.clientId,
                    );
                    await excerptRepository.delete(ownerKey, current);
                }}
            />
        </View>
    );
}

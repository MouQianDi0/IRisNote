import { useCallback, useMemo, useState } from "react";
import { useFocusEffect } from "expo-router";
import { Clipboard } from "lucide-react-native";
import { ActivityIndicator, FlatList, Text, View } from "react-native";
import { banner } from "@/core/notifications";
import { semanticColors } from "@/shared/theme";
import { Input } from "@/shared/ui";
import DeleteConfirmDialog from "@/shared/ui/Dialog/DeleteConfirmDialog";
import { ExcerptActionDialog } from "../components/ExcerptActionDialog";
import { ExcerptCard } from "../components/ExcerptCard";
import { ClipboardDetectConfirmDialog } from "../components/ClipboardDetectConfirmDialog";
import { ClipboardDetectedCard } from "../components/ClipboardDetectedCard";
import { ClipboardHintBar } from "../components/ClipboardHintBar";
import { ExcerptFormDialog } from "../components/ExcerptFormDialog";
import { ExcerptToolbar } from "../components/ExcerptToolbar";
import { filterExcerpts } from "../domain/excerpt-validation";
import { useClipboardDetection } from "../hooks/useClipboardDetection";
import { useClipboardPreferences } from "../hooks/useClipboardPreferences";
import { useExcerptScope } from "../hooks/useExcerptScope";
import { clipboardService } from "../services/clipboard.service";
import { pasteClipboardAsExcerpt } from "../services/excerpt-service";
import { excerptRepository } from "../state/excerpt-store";
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
    const clipboardPreferences = useClipboardPreferences();

    // 回到页面时刷新「今天/昨天」的判断基准。
    useFocusEffect(useCallback(() => setNow(new Date()), []));

    const entities = ready ? scope.entities : NO_EXCERPTS;
    const visible = useMemo(
        () => filterExcerpts(entities, keyword),
        [entities, keyword],
    );
    const detection = useClipboardDetection({
        enabled: clipboardPreferences.autoDetectEnabled,
        ready,
        ownerKey,
        generation,
        entities,
    });
    const showHint =
        clipboardPreferences.ready &&
        !clipboardPreferences.autoDetectEnabled &&
        !clipboardPreferences.hintDismissed;

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
            await clipboardService.writeText(excerpt.content);
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
                    {detection.offer ? (
                        <View style={{ marginTop: 12 }}>
                            <ClipboardDetectedCard
                                content={detection.offer.content}
                                saving={detection.saving}
                                onIgnore={detection.ignore}
                                onSave={() => void detection.save()}
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
            <ClipboardDetectConfirmDialog
                visible={confirmingDetect}
                pending={clipboardPreferences.pending}
                onCancel={() => setConfirmingDetect(false)}
                onConfirm={() => void enableDetection()}
            />
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

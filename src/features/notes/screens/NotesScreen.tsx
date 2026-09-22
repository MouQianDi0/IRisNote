import { useApplicationDatabase } from "@/core/database";
import { useCloudStorage } from "@/core/cloud-storage/cloud-storage-provider";
import {
    assertCloudStorageAllowed,
    captureCloudStorageAccess,
    getCloudStorageSnapshot,
    isCloudStoragePermissionError,
} from "@/core/cloud-storage/cloud-storage-policy";
import { setFloatingMenuHidden } from "@/core/navigation/floating-menu-visibility";
import { useDebouncedNavigation } from "@/core/navigation/hooks/useDebouncedNavigation";
import { captureNotificationSession } from "@/core/notifications";
import { useAuth } from "@/features/auth/hooks/useAuth";
import type { Category } from "@/features/notes/categories/categories.types";
import type { Note } from "@/features/notes/notes.types";
import {
    applyQueuedCategoryChanges,
    enqueueCategoryCreate,
} from "@/features/sync";
import { getApiErrorMessage } from "@/shared/http/errors";
import { colors } from "@/shared/theme";
import { router, useLocalSearchParams, type Href } from "expo-router";
import { Archive, ChevronUp } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    Alert,
    FlatList,
    Pressable,
    Text,
    View,
    type ListRenderItem,
    type NativeScrollEvent,
    type NativeSyntheticEvent,
} from "react-native";
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withRepeat,
    withTiming,
} from "react-native-reanimated";
import { deleteNote } from "../api/notes.api";
import { getCategories } from "../categories/api/categories.api";
import { ALL_CATEGORY } from "../categories/categories.constants";
import {
    notifyCategoriesChanged,
    onCategoriesChanged,
} from "../categories/categories.events";
import CategoryBar from "../categories/components/CategoryBar";
import CreateCategoryModal from "../categories/components/CreateCategoryModal";
import NotesSyncHeader from "../components/NotesSyncHeader";
import SwipeableNoteItem from "../components/card/SwipeableNoteItem";
import DraftListModal from "../components/draft-list-modal";
import DeleteConfirmDialog from "../components/editor/delete-confirm-dialog";
import NoteContextMenu from "../components/viewer/NoteContextMenu";
import {
    getLocalNotes,
    recoverInterruptedNoteSyncs,
    removeLocalNote,
} from "../data/note-local.repository";
import { readNoteSyncTime, saveNoteSyncTime } from "../data/note-sync-history";
import { useNotePin } from "../hooks/useNotePin";
import { useNoteStar } from "../hooks/useNoteStar";
import {
    removeCachedNoteById,
    setCachedNote,
    setCachedNotes,
} from "../notes.cache";
import { onNotesChanged, onNotesRemovedByCategory } from "../notes.events";
import {
    queueNoteUploadNow,
    saveEditedNoteLocalFirst,
} from "../services/note-save.service";
import { syncNotes } from "../services/note-sync-coordinator";

import { sortNotesByPinned, withLocalOrder } from "../notes.selectors";

const firstSearchParam = (value?: string | string[]) =>
    Array.isArray(value) ? value[0] : value;

export default function NotesScreen() {
    const searchParams = useLocalSearchParams<{
        view?: string | string[];
        drafts?: string | string[];
    }>();
    const contentView =
        firstSearchParam(searchParams.view) === "starred" ? "starred" : "all";
    const draftIntent = firstSearchParam(searchParams.drafts);
    const [draftListVisible, setDraftListVisible] = useState(false);
    const isDraftListVisible = draftListVisible || draftIntent === "1";
    const database = useApplicationDatabase();
    const { user } = useAuth();
    const { enabled: cloudEnabled, generation: cloudGeneration } = useCloudStorage();
    const onNavigate = useDebouncedNavigation();
    const [notes, setNotes] = useState<Note[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);
    const [loading, setLoading] = useState(true);
    const [syncHistory, setSyncHistory] = useState<{
        userId: number;
        timestamp: number | null;
    } | null>(null);
    const scrollOffset = useSharedValue(0);
    const [currentCategory, setCurrentCategory] = useState(
        String(ALL_CATEGORY.id),
    );
    const [showScrollTop, setShowScrollTop] = useState(false);
    const [NoteClassMenu, setNoteClassMenu] = useState(false);
    const [openedNoteId, setOpenedNoteId] = useState<number | null>(null);
    const [contextMenuNote, setContextMenuNote] = useState<Note | null>(null);
    const [contextStatusBusy, setContextStatusBusy] = useState(false);
    const contextStatusLock = useRef(false);
    const activeContextNote =
        user && contextMenuNote
            ? (notes.find(
                  (note) =>
                      note.id === contextMenuNote.id &&
                      note.user_id === user.id,
              ) ?? null)
            : null;
    const contextMenuNoteRef = useRef<Note | null>(null);
    const flatListRef = useRef<FlatList<Note>>(null);
    const notesRef = useRef<Note[]>([]);
    const notesRequestRef = useRef<Promise<
        { addedCount: number } | undefined
    > | null>(null);
    const notesRequestOwnerIdRef = useRef<number | null>(null);
    const notesRequestGenerationRef = useRef<number | null>(null);
    const recoveredSyncUserIdRef = useRef<number | null>(null);
    const categoriesRequestRef = useRef<Promise<void> | null>(null);
    const categoriesRequestGenerationRef = useRef<number | null>(null);
    const showScrollTopRef = useRef(false);
    const pinnedOrderRef = useRef(0);
    const floatingMenuRestoreTimerRef = useRef<ReturnType<
        typeof setTimeout
    > | null>(null);
    const openedNoteIdRef = useRef<number | null>(null);

    useEffect(() => {
        const mountedAt = Date.now();
        console.info(
            "[IRisNoteCrashTrace]",
            JSON.stringify({
                scope: "notes",
                stage: "mounted",
                timestamp: mountedAt,
            }),
        );
        return () => {
            console.info(
                "[IRisNoteCrashTrace]",
                JSON.stringify({
                    scope: "notes",
                    stage: "unmounted",
                    timestamp: Date.now(),
                    elapsedMs: Date.now() - mountedAt,
                }),
            );
        };
    }, []);

    useEffect(() => {
        if (!user) return;
        const userId = user.id;
        let active = true;
        void readNoteSyncTime(userId).then((timestamp) => {
            if (!active) return;
            setSyncHistory((current) =>
                current?.userId === userId && current.timestamp !== null
                    ? current
                    : { userId, timestamp },
            );
        });
        return () => {
            active = false;
        };
    }, [user]);

    useEffect(() => {
        openedNoteIdRef.current = openedNoteId;
    }, [openedNoteId]);

    const applyNotes = useCallback((nextNotes: Note[]) => {
        pinnedOrderRef.current = Math.max(
            0,
            ...nextNotes.map((note) => note.pinned_order ?? 0),
        );
        setNotes(nextNotes);
        setCachedNotes(nextNotes);
    }, []);

    const fetchNotes = useCallback(() => {
        if (!user) return Promise.resolve();
        if (
            notesRequestRef.current &&
            notesRequestOwnerIdRef.current === user.id &&
            notesRequestGenerationRef.current === cloudGeneration
        ) {
            return notesRequestRef.current;
        }

        const ownerUserId = user.id;
        const isCurrentSession = captureNotificationSession();
        const startedAt = Date.now();
        const trace = (stage: string, count?: number) => {
            const timestamp = Date.now();
            console.info(
                "[IRisNoteCrashTrace]",
                JSON.stringify({
                    scope: "notes",
                    stage,
                    timestamp,
                    elapsedMs: timestamp - startedAt,
                    count,
                }),
            );
        };
        let request: Promise<{ addedCount: number } | undefined> | undefined;
        request = (async () => {
            try {
                trace("local_load_started");
                if (recoveredSyncUserIdRef.current !== ownerUserId) {
                    await recoverInterruptedNoteSyncs(database, ownerUserId);
                    recoveredSyncUserIdRef.current = ownerUserId;
                }
                const localNotes = withLocalOrder(
                    await getLocalNotes(database, ownerUserId),
                );
                if (!isCurrentSession() || notesRequestGenerationRef.current !== cloudGeneration) return;
                trace("local_load_completed", localNotes.length);
                if (notesRequestOwnerIdRef.current !== ownerUserId) {
                    trace("local_apply_skipped_owner_changed");
                    return;
                }
                trace("local_apply_requested", localNotes.length);
                applyNotes(localNotes);
            } catch (err: any) {
                trace("local_load_failed");
                console.error(
                    "加载本地笔记失败:",
                    err.response?.status,
                    err.response?.data || err.message,
                );
                return;
            }

            try {
                if (!cloudEnabled || getCloudStorageSnapshot().generation !== cloudGeneration) return;
                const checkAccess = captureCloudStorageAccess(ownerUserId);
                trace("cloud_fetch_started");
                const result = await syncNotes(database, ownerUserId);
                checkAccess();
                const addedCount = result.addedCount;
                const reconciledNotes = withLocalOrder(result.notes);
                if (notesRequestOwnerIdRef.current !== ownerUserId) {
                    trace("cloud_apply_skipped_owner_changed");
                    return;
                }
                trace("cloud_apply_requested", reconciledNotes.length);
                applyNotes(reconciledNotes);
                const timestamp = Date.now();
                setSyncHistory({ userId: ownerUserId, timestamp });
                await saveNoteSyncTime(ownerUserId, timestamp);
                trace("sync_completed", reconciledNotes.length);
                return { addedCount };
            } catch (err: any) {
                if (isCloudStoragePermissionError(err)) return;
                trace("cloud_sync_failed");
                console.warn(
                    "云端笔记同步失败，继续使用本地数据:",
                    err.response?.status,
                    err.response?.data || err.message,
                );
            }
        })().finally(() => {
            if (notesRequestRef.current === request) {
                notesRequestRef.current = null;
                notesRequestOwnerIdRef.current = null;
                notesRequestGenerationRef.current = null;
            }
        });

        notesRequestRef.current = request;
        notesRequestOwnerIdRef.current = ownerUserId;
        notesRequestGenerationRef.current = cloudGeneration;
        return request;
    }, [applyNotes, cloudEnabled, cloudGeneration, database, user]);

    const fetchCategories = useCallback(() => {
        if (!user || !cloudEnabled || getCloudStorageSnapshot().generation !== cloudGeneration) return Promise.resolve();
        if (categoriesRequestRef.current && categoriesRequestGenerationRef.current === cloudGeneration) return categoriesRequestRef.current;

        let request: Promise<void> | undefined;
        request = (async () => {
            try {
                const checkAccess = captureCloudStorageAccess(user.id);
                const remoteCategories = await getCategories();
                checkAccess();
                const nextCategories = await applyQueuedCategoryChanges(
                    database,
                    user.id,
                    remoteCategories,
                );
                checkAccess();
                setCategories(nextCategories);
            } catch (err: any) {
                if (isCloudStoragePermissionError(err)) return;
                console.error("获取分类失败:", err.message);
            } finally {
                if (categoriesRequestRef.current === request) {
                    categoriesRequestRef.current = null;
                    categoriesRequestGenerationRef.current = null;
                }
            }
        })();

        categoriesRequestRef.current = request;
        categoriesRequestGenerationRef.current = cloudGeneration;
        return request;
    }, [cloudEnabled, cloudGeneration, database, user]);

    useEffect(() => {
        notesRef.current = notes;
    }, [notes]);

    useEffect(() => {
        void Promise.resolve().then(() => {
            setCategories([]);
            setCurrentCategory(String(ALL_CATEGORY.id));
        });
    }, [user?.id]);

    useEffect(() => {
        if (user) return;
        // 微任务中清空，避免 effect 体内同步 setState 触发级联渲染。
        void Promise.resolve().then(() => {
            setNotes([]);
            setCachedNotes([]);
        });
    }, [user]);

    useEffect(() => {
        let active = true;
        Promise.all([fetchNotes(), fetchCategories()]).finally(() => {
            if (active) setLoading(false);
        });
        return () => { active = false; };
    }, [fetchNotes, fetchCategories]);

    // 订阅分类变更通知（FloatingBar 修改分类后自动刷新标签）
    useEffect(() => {
        const unsub = onCategoriesChanged(() => {
            fetchCategories();
        });
        return unsub;
    }, [fetchCategories]);

    // 本地事务提交后直接增量覆盖列表，禁止再用整表请求覆盖刚保存的内容。
    useEffect(() => {
        const unsub = onNotesChanged((event) => {
            if (
                !user ||
                (event.ownerUserId != null && event.ownerUserId !== user.id)
            )
                return;

            if (event.type === "upsert" && event.note) {
                const changedNote = event.note;
                if (changedNote.user_id !== user.id) return;
                setCachedNote(changedNote);
                setNotes((currentNotes) => {
                    const index = currentNotes.findIndex(
                        (note) => note.id === changedNote.id,
                    );
                    if (index < 0) return [changedNote, ...currentNotes];

                    const nextNotes = [...currentNotes];
                    nextNotes[index] = changedNote;
                    return nextNotes;
                });
                return;
            }

            if (event.type === "remove" && event.noteId != null) {
                removeCachedNoteById(event.noteId, user.id);
                setNotes((currentNotes) =>
                    currentNotes.filter((note) => note.id !== event.noteId),
                );
            }
        });
        return unsub;
    }, [user]);

    // 删除分类成功后，本地增量移除该分类下的笔记，避免重新拉取全部笔记。
    useEffect(() => {
        const unsub = onNotesRemovedByCategory((categoryId) => {
            setNotes((prev) => {
                const nextNotes = prev.filter(
                    (note) => note.category_id !== categoryId,
                );
                setCachedNotes(nextNotes);
                return nextNotes;
            });
        });
        return unsub;
    }, []);

    const handleRefresh = useCallback(async () => {
        assertCloudStorageAllowed(user?.id);
        const current = captureNotificationSession();
        const result = await fetchNotes();
        if (!current()) return;
        return result || undefined;
    }, [fetchNotes, user?.id]);

    const updateNotesLocally = useCallback(
        (updater: (prev: Note[]) => Note[], shouldSort = false) => {
            setNotes((prev) => {
                const nextNotes = updater(prev);
                const orderedNotes = shouldSort
                    ? sortNotesByPinned(nextNotes)
                    : nextNotes;
                setCachedNotes(orderedNotes);
                return orderedNotes;
            });
        },
        [],
    );

    const [deleteTarget, setDeleteTarget] = useState<Note | null>(null);

    // 两条删除入口（列表左滑、长按菜单）统一改为打开规范确认弹窗。
    const handleDelete = useCallback((item: Note) => {
        setDeleteTarget(item);
    }, []);

    // 删除动作由确认弹窗在 2 秒倒计时后调用；失败抛错由弹窗红字展示。
    const handleConfirmDelete = useCallback(async () => {
        const item = deleteTarget;
        if (!item) return;
        if (!user) {
            throw new Error("当前登录信息不可用，请重新登录后再操作");
        }
        const isCurrentSession = captureNotificationSession();
        try {
            const serverId = item.server_id ?? (item.id > 0 ? item.id : null);
            if (serverId != null) {
                const checkAccess = captureCloudStorageAccess(user.id);
                await deleteNote(serverId);
                checkAccess();
            }
            await removeLocalNote(database, user.id, item.id);
            if (!isCurrentSession()) return;
            removeCachedNoteById(item.id, user.id);
            updateNotesLocally((prev) => prev.filter((n) => n.id !== item.id));
            setOpenedNoteId(null);
            console.log("笔记删除成功:", { id: item.id });
        } catch (err) {
            if (isCloudStoragePermissionError(err)) throw err;
            throw new Error(getApiErrorMessage(err, "删除失败"));
        }
    }, [database, deleteTarget, updateNotesLocally, user]);

    const { togglePin: handleTogglePin } = useNotePin(
        notesRef,
        pinnedOrderRef,
        updateNotesLocally,
        setOpenedNoteId,
    );

    const { toggleStar: handleToggleStar } = useNoteStar(
        notesRef,
        updateNotesLocally,
        setOpenedNoteId,
    );

    // Existing hooks roll back a list snapshot, so serialize menu status writes.
    const toggleContextStatus = async (
        toggle: (note: Note) => Promise<void>,
    ) => {
        if (!activeContextNote || contextStatusLock.current) return;
        contextStatusLock.current = true;
        setContextStatusBusy(true);
        try {
            await toggle(activeContextNote);
        } finally {
            contextStatusLock.current = false;
            setContextStatusBusy(false);
        }
    };

    const runContextSave = async (title?: string): Promise<string> => {
        if (!activeContextNote || !user) throw new Error("当前笔记不可用");
        if (contextStatusLock.current)
            throw new Error("操作进行中，请稍后再试");
        contextStatusLock.current = true;
        setContextStatusBusy(true);
        try {
            const result =
                title === undefined
                    ? await queueNoteUploadNow(
                          database,
                          user.id,
                          activeContextNote.id,
                      )
                    : await saveEditedNoteLocalFirst(
                          database,
                          user.id,
                          activeContextNote,
                          { title },
                      );
            return result.localOnly
                ? "标题已保存在本机，开启云存储后可同步"
                : result.cloudState === "accepted"
                ? title === undefined
                    ? "已同步"
                    : "标题已保存并同步"
                : result.cloudState === "queued"
                  ? title === undefined
                      ? "已加入暂存队列"
                      : "标题已保存，等待自动同步"
                  : (title === undefined
                        ? "未同步："
                        : "标题已保存在本地，未同步：") +
                    ("message" in result ? result.message : "请稍后重试");
        } finally {
            contextStatusLock.current = false;
            setContextStatusBusy(false);
        }
    };

    const handleOpenNote = useCallback(
        (item: Note) => {
            onNavigate({
                pathname: "/pages/note/[id]",
                params: { id: String(item.id) },
            } as unknown as Href);
        },
        [onNavigate],
    );

    const handleAddCategory = useCallback(
        async (name: string, icon: string) => {
            if (!user) return;
            try {
                const checkAccess = captureCloudStorageAccess(user.id);
                await enqueueCategoryCreate(database, user.id, { name, icon });
                checkAccess();
                notifyCategoriesChanged();
                setNoteClassMenu(false);
            } catch (err: any) {
                if (isCloudStoragePermissionError(err)) {
                    Alert.alert("需要开启云存储", err.message);
                    return;
                }
                console.error("创建分类失败:", err.message);
            }
        },
        [database, user],
    );

    const handleScrollToTop = useCallback(() => {
        flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
    }, []);

    const clearFloatingMenuRestoreTimer = useCallback(() => {
        if (floatingMenuRestoreTimerRef.current) {
            clearTimeout(floatingMenuRestoreTimerRef.current);
            floatingMenuRestoreTimerRef.current = null;
        }
    }, []);

    const scheduleFloatingMenuRestore = useCallback(() => {
        clearFloatingMenuRestoreTimer();

        setFloatingMenuHidden(true);
        floatingMenuRestoreTimerRef.current = setTimeout(() => {
            if (openedNoteIdRef.current === null) {
                setFloatingMenuHidden(false);
            }

            floatingMenuRestoreTimerRef.current = null;
        }, 500);
    }, [clearFloatingMenuRestoreTimer]);

    const hideFloatingMenu = useCallback(() => {
        clearFloatingMenuRestoreTimer();
        setFloatingMenuHidden(true);
    }, [clearFloatingMenuRestoreTimer]);

    const showFloatingMenu = useCallback(() => {
        clearFloatingMenuRestoreTimer();
        if (contextMenuNoteRef.current === null) {
            setFloatingMenuHidden(false);
        }
    }, [clearFloatingMenuRestoreTimer]);

    const handleOpenContextMenu = useCallback(
        (item: Note) => {
            contextMenuNoteRef.current = item;
            setOpenedNoteId(null);
            hideFloatingMenu();
            setContextMenuNote(item);
        },
        [hideFloatingMenu],
    );

    const handleCloseContextMenu = useCallback(() => {
        contextMenuNoteRef.current = null;
        setContextMenuNote(null);
        showFloatingMenu();
    }, [showFloatingMenu]);

    const handleEditFromContextMenu = useCallback(() => {
        if (!contextMenuNote) return;

        onNavigate({
            pathname: "/pages/note/[id]",
            params: { id: String(contextMenuNote.id), edit: "1" },
        } as unknown as Href);
    }, [contextMenuNote, onNavigate]);

    const handleDeleteFromContextMenu = useCallback(() => {
        if (!contextMenuNote) return;
        handleDelete(contextMenuNote);
    }, [contextMenuNote, handleDelete]);

    useEffect(() => {
        return () => {
            if (floatingMenuRestoreTimerRef.current) {
                clearTimeout(floatingMenuRestoreTimerRef.current);
            }

            setFloatingMenuHidden(false);
        };
    }, []);

    const handleScroll = useCallback(
        (event: NativeSyntheticEvent<NativeScrollEvent>) => {
            scheduleFloatingMenuRestore();

            const offsetY = event.nativeEvent.contentOffset.y;
            scrollOffset.set(offsetY);
            const shouldShowScrollTop = offsetY > 300;

            if (showScrollTopRef.current !== shouldShowScrollTop) {
                showScrollTopRef.current = shouldShowScrollTop;
                setShowScrollTop(shouldShowScrollTop);
            }
        },
        [scheduleFloatingMenuRestore, scrollOffset],
    );

    // 滚动到顶部按钮的上下缓动动画
    const bounceY = useSharedValue(0);
    useEffect(() => {
        bounceY.value = withRepeat(
            withTiming(-10, { duration: 1000 }),
            -1,
            true,
        );
    }, [bounceY]);
    const bounceStyle = useAnimatedStyle(() => ({
        transform: [{ translateY: bounceY.value }],
    }));

    const categoryNameMap = useMemo(() => {
        const map = new Map<number, string>();
        categories.forEach((c) => map.set(c.id, c.name));
        return map;
    }, [categories]); // 缓存分类名称映射，避免每次渲染都重新计算

    const filteredNotes = useMemo(() => {
        const nextNotes =
            contentView === "starred" ||
            currentCategory === String(ALL_CATEGORY.id)
                ? notes
                : notes.filter(
                      (note) => String(note.category_id) === currentCategory,
                  );

        return sortNotesByPinned(
            contentView === "starred"
                ? nextNotes.filter((note) => note.is_starred)
                : nextNotes,
        );
    }, [contentView, currentCategory, notes]);

    useEffect(() => {
        console.info(
            "[IRisNoteCrashTrace]",
            JSON.stringify({
                scope: "notes",
                stage: "list_data_committed",
                timestamp: Date.now(),
                count: filteredNotes.length,
            }),
        );
    }, [filteredNotes]);

    const keyExtractor = useCallback((item: Note) => String(item.id), []);

    const renderNoteItem = useCallback<ListRenderItem<Note>>(
        ({ item }) => {
            const categoryName =
                item.category_id != null
                    ? (categoryNameMap.get(item.category_id) ?? "未知")
                    : "默认";

            return (
                <SwipeableNoteItem
                    item={item}
                    categoryName={categoryName}
                    openedNoteId={openedNoteId}
                    onDelete={handleDelete}
                    onOpen={handleOpenNote}
                    onTogglePin={handleTogglePin}
                    onToggleStar={handleToggleStar}
                    onOpenActions={setOpenedNoteId}
                    onCloseActions={() => setOpenedNoteId(null)}
                    onSwipeStart={hideFloatingMenu}
                    onSwipeClose={showFloatingMenu}
                    onLongPress={handleOpenContextMenu}
                />
            );
        },
        [
            categoryNameMap,
            handleDelete,
            handleOpenNote,
            handleTogglePin,
            handleToggleStar,
            handleOpenContextMenu,
            hideFloatingMenu,
            openedNoteId,
            showFloatingMenu,
        ],
    );

    const listContentContainerStyle = useMemo(
        () => ({ paddingBottom: 10, flexGrow: 1 }),
        [],
    );

    const listHeaderComponent = useMemo(
        () => (
            <View
                className="bg-blue-50 h-[200px] rounded-card mb-6 overflow-hidden"
                style={{ width: "100%", maxWidth: 400 }}
            />
        ),
        [],
    );

    const listEmptyComponent = useMemo(
        () => (
            <View className="items-center py-5">
                <Text className="text-gray-400 text-base">暂无笔记</Text>
            </View>
        ),
        [],
    );

    return (
        <View className="mt-[15px] bg-app-background flex-1">
            {isDraftListVisible && user && (
                <DraftListModal
                    key={user.id}
                    owner={user.id}
                    onClose={() => {
                        setDraftListVisible(false);
                        if (draftIntent === "1")
                            router.setParams({ drafts: undefined });
                    }}
                />
            )}
            <View className="flex-row flex-1">
                <View
                    className="     relative
                                    w-[75px]
                                    bg-app-background
                                    h-auto
                                    rounded-floating
                                    items-center gap-[6px]"
                >
                    <CategoryBar
                        onCategoryPress={setCurrentCategory}
                        onAddCategory={() => setNoteClassMenu(true)}
                    />
                    <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="草稿"
                        onPress={() => setDraftListVisible(true)}
                        className="w-[50px] h-[60px] mb-[6px] rounded-control justify-center items-center pl-[6px] pr-[4px] py-[4px]"
                    >
                        <Archive size={30} color={colors.textSecondary} />
                        <Text
                            numberOfLines={1}
                            ellipsizeMode="tail"
                            className="max-w-[44px] text-[10px] text-gray-400"
                        >
                            草稿
                        </Text>
                    </Pressable>
                </View>
                {/* Separate fill from borders to avoid Android's rounded background inset. */}
                <View className="relative flex-1 bg-white rounded-tl-content">
                    <View className="flex-1 rounded-tl-content p-4 pb-6 border-b border-l border-t border-note-page-border">
                        <NotesSyncHeader
                            key={`${user?.id ?? "signed-out"}:${cloudGeneration}`}
                            count={filteredNotes.length}
                            itemLabel="笔记"
                            lastSyncTime={
                                syncHistory?.userId === user?.id
                                    ? (syncHistory?.timestamp ?? null)
                                    : null
                            }
                            enabled={!!user && cloudEnabled && !loading}
                            scrollOffset={scrollOffset}
                            onRefresh={handleRefresh}
                            successMessage={({ addedCount }) =>
                                addedCount > 0
                                    ? `同步${addedCount}条笔记`
                                    : "暂无新笔记"
                            }
                        >
                            <FlatList
                                ref={flatListRef}
                                className="rounded-card"
                                data={filteredNotes}
                                extraData={categoryNameMap}
                                keyExtractor={keyExtractor}
                                showsVerticalScrollIndicator={false}
                                contentContainerStyle={
                                    listContentContainerStyle
                                }
                                onScroll={handleScroll}
                                scrollEventThrottle={16}
                                ListHeaderComponent={listHeaderComponent}
                                bounces={false}
                                overScrollMode="never"
                                renderItem={renderNoteItem}
                                ListEmptyComponent={listEmptyComponent}
                                initialNumToRender={8}
                                maxToRenderPerBatch={6}
                                updateCellsBatchingPeriod={50}
                                windowSize={7}
                                removeClippedSubviews
                            />
                        </NotesSyncHeader>
                    </View>
                    {showScrollTop && (
                        <Animated.View
                            style={bounceStyle}
                            className="absolute bottom-30 left-1/2 -translate-x-1/2"
                        >
                            <Pressable
                                onPress={handleScrollToTop}
                                className="right-1/2 translate-x-1/2 w-11 h-11 bg-transparent rounded-full"
                            >
                                <ChevronUp
                                    size={50}
                                    color={colors.scrollTopIcon}
                                />
                            </Pressable>
                        </Animated.View>
                    )}
                </View>
            </View>
            <CreateCategoryModal
                visible={NoteClassMenu}
                onClose={() => setNoteClassMenu(false)}
                onAdd={handleAddCategory}
            />
            <NoteContextMenu
                visible={activeContextNote !== null}
                note={activeContextNote}
                isPinned={!!activeContextNote?.is_pinned}
                isStarred={!!activeContextNote?.is_starred}
                statusBusy={contextStatusBusy}
                onRename={(title) => runContextSave(title)}
                onSync={() => runContextSave()}
                onTogglePin={() => void toggleContextStatus(handleTogglePin)}
                onToggleStar={() => void toggleContextStatus(handleToggleStar)}
                onClose={handleCloseContextMenu}
                onEdit={handleEditFromContextMenu}
                onDelete={handleDeleteFromContextMenu}
            />
            <DeleteConfirmDialog
                visible={deleteTarget !== null}
                description={`删除后无法找回\n笔记“${deleteTarget?.title ?? ""}”将被永久删除`}
                onClose={() => setDeleteTarget(null)}
                onConfirm={handleConfirmDelete}
            />
        </View>
    );
}

import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type ReactNode, type Ref } from "react";
import { Trash2 } from "lucide-react-native";
import { Pressable, ScrollView, Text, View, type TextInput } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { semanticColors } from "@/shared/theme";
import { AppButton, Input } from "@/shared/ui";
import type { ExcerptStashItem } from "../data/excerpt-stash.repository";
import { stashDragTarget } from "../domain/excerpt-stash-drag";

function StashRow({ item, index, canDrag, disabled, editor, centers, onHeight, onBegin, onTarget, onDrop, onEdit, onRemove }: {
    item: ExcerptStashItem;
    index: number;
    canDrag: boolean;
    disabled: boolean;
    editor?: ReactNode;
    centers: SharedValue<number[]>;
    onHeight: (id: string, height: number) => void;
    onBegin: (id: string) => void;
    onTarget: (id: string, index: number) => void;
    onDrop: (id: string, index: number, success: boolean) => void;
    onEdit: (item: ExcerptStashItem) => void;
    onRemove: (id: string) => void;
}) {
    const lifted = useSharedValue(false);
    const liftProgress = useSharedValue(0);
    const active = useSharedValue(false);
    const visualY = useSharedValue(0);
    const translationY = useSharedValue(0);
    const currentY = useSharedValue(0);
    const originY = useSharedValue(0);
    const originCenter = useSharedValue(0);
    const targetIndex = useSharedValue(index);
    const currentIndex = useSharedValue(index);
    const id = item.clientId;
    useEffect(() => { currentIndex.set(index); }, [currentIndex, index]);
    const gesture = useMemo(() => Gesture.Pan()
        .enabled(canDrag)
        .activateAfterLongPress(250)
        .onStart(() => {
            active.set(true);
            lifted.set(true);
            liftProgress.set(withTiming(1, { duration: 120 }));
            translationY.set(0);
            originY.set(currentY.get());
            const start = currentIndex.get();
            originCenter.set(centers.get()[start] ?? 0);
            targetIndex.set(start);
            scheduleOnRN(onBegin, id);
        })
        .onUpdate((event) => {
            translationY.set(event.translationY);
            visualY.set(event.translationY + originY.get() - currentY.get());
            const slots = centers.get();
            const center = originCenter.get() + event.translationY;
            const next = stashDragTarget(slots, targetIndex.get(), center);
            if (next !== targetIndex.get()) {
                targetIndex.set(next);
                scheduleOnRN(onTarget, id, next);
            }
        })
        .onFinalize((_event, success) => {
            if (!active.get()) return;
            active.set(false);
            lifted.set(false);
            liftProgress.set(withTiming(0, { duration: 120 }));
            visualY.set(withTiming(0, { duration: 180 }));
            scheduleOnRN(onDrop, id, targetIndex.get(), success);
        }), [active, canDrag, centers, currentIndex, currentY, id, lifted, liftProgress, onBegin, onDrop, onTarget, originCenter, originY, targetIndex, translationY, visualY]);
    const dragStyle = useAnimatedStyle(() => ({
        transform: [{ translateY: visualY.get() }, { scale: 1 + liftProgress.get() * 0.025 }],
        zIndex: lifted.get() ? 2 : 0,
        elevation: lifted.get() ? 8 : 0,
        shadowOpacity: liftProgress.get() * 0.18,
    }));
    return <Animated.View
        className="flex-row items-center bg-hyper-list"
        style={[{ shadowColor: semanticColors.textPrimary, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } }, dragStyle]}
        onLayout={(event) => {
            const { y, height } = event.nativeEvent.layout;
            currentY.set(y);
            if (lifted.get()) visualY.set(translationY.get() + originY.get() - y);
            onHeight(item.clientId, height);
        }}
    >
        {editor ? <View className="flex-1 py-3">{editor}</View> : <><GestureDetector gesture={gesture}>
            <Pressable
                accessibilityRole="button"
                accessibilityLabel={`编辑第 ${index + 1} 条暂存内容`}
                accessibilityHint={canDrag ? "长按并拖动可调整顺序" : undefined}
                disabled={disabled}
                onPress={() => onEdit(item)}
                style={{ flex: 1, minHeight: 56, justifyContent: "center", paddingHorizontal: 16, paddingVertical: 12 }}
            >
                <Text numberOfLines={2} className="text-[17px] text-hyper-text-primary">{item.content}</Text>
            </Pressable>
        </GestureDetector>
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={`删除第 ${index + 1} 条暂存内容`}
            disabled={disabled}
            onPress={() => onRemove(item.clientId)}
            style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center", marginRight: 8 }}
        >
            <Trash2 size={20} color={semanticColors.destructive} />
        </Pressable></>}
    </Animated.View>;
}

/** 摘录页暂存列表：行内编辑；拖拽只在落点提交一次排序事务。 */
export type ExcerptStashPanelHandle = {
    leave: (action: () => void | Promise<void>) => Promise<boolean>;
};

export function ExcerptStashPanel({ ref, items, busy, onReorder, onUpdate, onEditingChange, onRemove, onClear, onMerge, onPaste }: {
    ref?: Ref<ExcerptStashPanelHandle>;
    items: readonly ExcerptStashItem[];
    busy: boolean;
    onReorder: (orderedClientIds: readonly string[]) => Promise<boolean>;
    onUpdate: (id: string, text: string) => Promise<"saved" | "duplicate">;
    onEditingChange?: (editing: boolean) => void;
    onRemove: (id: string) => void;
    onClear: () => void;
    onMerge: () => void;
    onPaste: () => void;
}) {
    const [ordered, setOrdered] = useState<ExcerptStashItem[]>(() => [...items]);
    const orderedRef = useRef(ordered);
    const heights = useRef(new Map<string, number>());
    const dragging = useRef<string | null>(null);
    const pendingRef = useRef(false);
    const [draggingId, setDraggingId] = useState<string | null>(null);
    const [pending, setPending] = useState(false);
    const [editing, setEditing] = useState<{ id: string; text: string; original: string } | null>(null);
    const editingRef = useRef(editing);
    const inputRef = useRef<TextInput>(null);
    const [editError, setEditError] = useState("");
    const [saving, setSaving] = useState(false);
    const saveTask = useRef<Promise<boolean> | null>(null);
    const leaveTask = useRef<Promise<boolean> | null>(null);
    const [leaving, setLeaving] = useState(false);
    const mounted = useRef(true);
    useEffect(() => {
        mounted.current = true;
        return () => { mounted.current = false; };
    }, []);
    const centers = useSharedValue<number[]>([]);
    const updateCenters = useCallback((next: readonly ExcerptStashItem[]) => {
        let top = 0;
        centers.set(next.map((item) => {
            const height = heights.current.get(item.clientId) ?? 56;
            const center = top + height / 2;
            top += height;
            return center;
        }));
    }, [centers]);
    useEffect(() => {
        if (dragging.current || pendingRef.current) return;
        const next = [...items];
        orderedRef.current = next;
        setOrdered(next);
        updateCenters(next);
    }, [items, updateCenters]);
    const begin = useCallback((id: string) => { dragging.current = id; setDraggingId(id); }, []);
    const target = useCallback((id: string, to: number) => {
        if (dragging.current !== id) return;
        const next = [...orderedRef.current];
        const from = next.findIndex((entry) => entry.clientId === id);
        if (from < 0 || from === to || to < 0 || to >= next.length) return;
        next.splice(to, 0, next.splice(from, 1)[0]);
        orderedRef.current = next;
        setOrdered(next);
        updateCenters(next);
    }, [updateCenters]);
    const drop = useCallback((id: string, to: number, success: boolean) => {
        if (dragging.current !== id) return;
        if (!success) {
            dragging.current = null;
            setDraggingId(null);
            const original = [...items];
            orderedRef.current = original;
            setOrdered(original);
            updateCenters(original);
            return;
        }
        target(id, to);
        dragging.current = null;
        setDraggingId(null);
        const ids = orderedRef.current.map((entry) => entry.clientId);
        if (ids.every((value, index) => value === items[index]?.clientId)) return;
        pendingRef.current = true;
        setPending(true);
        void onReorder(ids).then((saved) => {
            if (!saved) {
                const original = [...items];
                orderedRef.current = original;
                setOrdered(original);
                updateCenters(original);
            }
        }).catch(() => {
            const original = [...items];
            orderedRef.current = original;
            setOrdered(original);
            updateCenters(original);
        }).finally(() => { pendingRef.current = false; setPending(false); });
    }, [items, onReorder, target, updateCenters]);
    const finishEditing = useCallback((): Promise<boolean> => {
        if (saveTask.current) return saveTask.current;
        if (!mounted.current) return Promise.resolve(false);
        const edit = editingRef.current;
        if (!edit) return Promise.resolve(true);
        if (busy || pendingRef.current || dragging.current) return Promise.resolve(false);
        if (edit.text === edit.original) {
            editingRef.current = null;
            setEditing(null);
            setEditError("");
            onEditingChange?.(false);
            return Promise.resolve(true);
        }
        setSaving(true);
        setEditError("");
        // 先登记任务，再受理写入；失焦、点行与关闭同帧发生时共用一次保存。
        const task = Promise.resolve().then(async () => {
            try {
                const result = await onUpdate(edit.id, edit.text);
                if (!mounted.current) return false;
                if (result === "duplicate") {
                    setEditError("已在暂存中，请修改内容后保存");
                    return false;
                }
                editingRef.current = null;
                setEditing(null);
                onEditingChange?.(false);
                return true;
            } catch (cause) {
                if (mounted.current) setEditError(cause instanceof Error ? cause.message : "保存失败，请重试");
                return false;
            }
        }).finally(() => {
            if (saveTask.current === task) saveTask.current = null;
            if (mounted.current) setSaving(false);
        });
        saveTask.current = task;
        return task;
    }, [busy, onEditingChange, onUpdate]);
    const leave = useCallback((action: () => void | Promise<void>): Promise<boolean> => {
        if (leaveTask.current) return leaveTask.current;
        if (pendingRef.current || dragging.current || !mounted.current || (busy && !saveTask.current)) return Promise.resolve(false);
        setLeaving(true);
        const task = Promise.resolve().then(async () => {
            if (!await finishEditing() || !mounted.current) return false;
            await action();
            return true;
        }).finally(() => {
            if (leaveTask.current === task) leaveTask.current = null;
            if (mounted.current) setLeaving(false);
        });
        leaveTask.current = task;
        return task;
    }, [busy, finishEditing]);
    useImperativeHandle(ref, () => ({ leave }), [leave]);
    useEffect(() => {
        if (editError && !saving && editing) inputRef.current?.focus();
    }, [editError, editing, saving]);
    const disabled = busy || pending || saving || leaving || draggingId !== null;
    // 失焦保存期间保留离开入口，让紧随其后的点击能够等待同一个保存任务。
    const actionsDisabled = pending || leaving || draggingId !== null || (busy && !saving);
    return <>
        {items.length === 0 ? <Text style={{ fontSize: 14, color: semanticColors.textSecondary }}>暂存区还没有内容</Text> : <View className="overflow-hidden rounded-hyper-card bg-hyper-list" style={{ flexShrink: 1 }}>
        <ScrollView style={{ maxHeight: 320 }} keyboardShouldPersistTaps="handled" scrollEnabled={!disabled} nestedScrollEnabled>
            {ordered.map((item, index) => <StashRow
                key={item.clientId}
                item={item}
                index={index}
                canDrag={!busy && !pending && !saving && !leaving && !editing && ordered.length > 1}
                disabled={actionsDisabled}
                editor={editing?.id === item.clientId ? <>
                    <Input
                        ref={inputRef}
                        containerClassName="w-full"
                        size="body"
                        multiline
                        autoFocus
                        accessibilityLabel={`编辑第 ${index + 1} 条暂存内容`}
                        value={editing.text}
                        readOnly={saving}
                        invalid={!!editError}
                        onChangeText={(text) => {
                            if (editingRef.current?.id !== item.clientId || saveTask.current) return;
                            const next = { ...editingRef.current, text };
                            editingRef.current = next;
                            setEditing(next);
                            setEditError("");
                        }}
                        onBlur={() => {
                            if (editingRef.current?.id === item.clientId) void finishEditing();
                        }}
                    />
                    {!!editError && <Text accessibilityRole="alert" className="mt-1 text-sm text-hyper-error">{editError}</Text>}
                </> : undefined}
                centers={centers}
                onHeight={(id, height) => {
                    if (heights.current.get(id) === height) return;
                    heights.current.set(id, height);
                    updateCenters(orderedRef.current);
                }}
                onBegin={begin}
                onTarget={target}
                onDrop={drop}
                onEdit={(entry) => { void leave(() => {
                    const latest = orderedRef.current.find((value) => value.clientId === entry.clientId);
                    if (!latest) return;
                    const next = { id: latest.clientId, text: latest.content, original: latest.content };
                    editingRef.current = next;
                    setEditError(""); setEditing(next); onEditingChange?.(true);
                }); }}
                onRemove={(id) => { void leave(() => onRemove(id)); }}
            />)}
        </ScrollView>
        </View>}
        <AppButton className="mt-3" variant="secondary" label="粘贴到暂存区" disabled={actionsDisabled} onPress={() => { void leave(onPaste); }} />
        <View className="mt-3 flex-row gap-2.5">
            <AppButton className="flex-1" variant="secondary" label="清空" disabled={actionsDisabled || items.length === 0} onPress={() => { void leave(onClear); }} />
            <AppButton className="flex-1" label="合并保存" disabled={actionsDisabled || items.length === 0} onPress={() => { void leave(onMerge); }} />
        </View>
    </>;
}

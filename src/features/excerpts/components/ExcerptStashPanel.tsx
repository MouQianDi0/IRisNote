import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Check, Trash2, X } from "lucide-react-native";
import { Keyboard, Pressable, ScrollView, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { semanticColors } from "@/shared/theme";
import { AppButton, IconButton, Input } from "@/shared/ui";
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
        {editor ? <View className="flex-1 px-4 py-3">{editor}</View> : <><GestureDetector gesture={gesture}>
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
export function ExcerptStashPanel({ items, busy, onReorder, onUpdate, onRemove, onClear, onMerge, onPaste }: {
    items: readonly ExcerptStashItem[];
    busy: boolean;
    onReorder: (orderedClientIds: readonly string[]) => Promise<boolean>;
    onUpdate: (id: string, text: string) => Promise<"saved" | "duplicate">;
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
    const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
    const [editError, setEditError] = useState("");
    const [saving, setSaving] = useState(false);
    const savingRef = useRef(false);
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
    const disabled = busy || pending || saving || draggingId !== null;
    const actionsDisabled = disabled || editing !== null;
    const cancelEdit = () => {
        if (savingRef.current) return;
        setEditing(null);
        setEditError("");
        Keyboard.dismiss();
    };
    const saveEdit = async () => {
        if (!editing || disabled || savingRef.current) return;
        savingRef.current = true;
        setSaving(true);
        setEditError("");
        try {
            const result = await onUpdate(editing.id, editing.text);
            if (!mounted.current) return;
            if (result === "duplicate") setEditError("已在暂存中，请修改内容后保存");
            else {
                setEditing(null);
                Keyboard.dismiss();
            }
        } catch (cause) {
            if (mounted.current) setEditError(cause instanceof Error ? cause.message : "保存失败，请重试");
        } finally {
            savingRef.current = false;
            if (mounted.current) setSaving(false);
        }
    };
    return <>
        {items.length === 0 ? <Text style={{ fontSize: 14, color: semanticColors.textSecondary }}>暂存区还没有内容</Text> : <View className="overflow-hidden rounded-hyper-card bg-hyper-list" style={{ flexShrink: 1 }}>
        <ScrollView style={{ maxHeight: 320 }} keyboardShouldPersistTaps="handled" scrollEnabled={!disabled} nestedScrollEnabled>
            {ordered.map((item, index) => <StashRow
                key={item.clientId}
                item={item}
                index={index}
                canDrag={!busy && !pending && !saving && !editing && ordered.length > 1}
                disabled={actionsDisabled}
                editor={editing?.id === item.clientId ? <>
                    <Input
                        size="body"
                        multiline
                        autoFocus
                        accessibilityLabel={`编辑第 ${index + 1} 条暂存内容`}
                        value={editing.text}
                        disabled={disabled}
                        invalid={!!editError}
                        onChangeText={(text) => { setEditing({ id: item.clientId, text }); setEditError(""); }}
                        trailing={<View>
                            <IconButton icon={Check} iconSize={20} accessibilityLabel="保存暂存内容" loading={saving} disabled={disabled} onPress={() => void saveEdit()} />
                            <IconButton icon={X} iconSize={20} accessibilityLabel="取消编辑暂存内容" disabled={disabled} onPress={cancelEdit} />
                        </View>}
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
                onEdit={(entry) => { if (actionsDisabled) return; setEditError(""); setEditing({ id: entry.clientId, text: entry.content }); }}
                onRemove={onRemove}
            />)}
        </ScrollView>
        </View>}
        <AppButton className="mt-3" variant="secondary" label="粘贴到暂存区" disabled={actionsDisabled} onPress={onPaste} />
        <View className="mt-3 flex-row gap-2.5">
            <AppButton className="flex-1" variant="secondary" label="清空" disabled={actionsDisabled || items.length === 0} onPress={onClear} />
            <AppButton className="flex-1" label="合并保存" disabled={actionsDisabled || items.length === 0} onPress={onMerge} />
        </View>
    </>;
}

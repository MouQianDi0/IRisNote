import { AppModal as Modal } from "@/shared/ui/Overlay/app-modal";
import { InputSave, StatusToggle } from "@/shared/ui";
import {
    MoveHorizontal,
    Pin,
    SquarePen,
    Star,
    Trash2,
} from "lucide-react-native";
import { createElement, useRef, useState } from "react";
import {
    Pressable,
    Text,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    View,
} from "react-native";
import {
    Gesture,
    GestureDetector,

} from "react-native-gesture-handler";
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withSpring,

} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { colors } from "@/shared/theme";
import { DialogButton } from "../../components/editor/draft-dialog";
import { getCategoryIcon } from "../category-icons";
import CategoryDeleteConfirmModal from "./CategoryDeleteConfirmModal";
import CategoryIconPicker from "./CategoryIconPicker";

type CategoryActionModalProps = {
    visible: boolean;
    onClose: () => void;
    onDelete: () => void;
    onStar: () => void;
    onPin: () => void;
    onRename: (name: string) => void;
    onChangeIcon: (icon: string) => void;
    categoryName: string;
    categoryIcon: string;
    isPinned: boolean;
    isStarred: boolean;
};

const SWIPE_THRESHOLD = 50;
const MAX_SWIPE = 100;

export default function CategoryActionModal(props: CategoryActionModalProps) {
    if (!props.visible) return null;
    return <CategoryActionContent key={JSON.stringify([props.categoryName, props.categoryIcon])} {...props} />;
}

function CategoryActionContent({
    visible,
    onClose,
    onDelete,
    onStar,
    onPin,
    onRename,
    onChangeIcon,
    categoryName,
    categoryIcon,
    isPinned,
    isStarred,
}: CategoryActionModalProps) {
    const [editing, setEditing] = useState(false);
    const [editName, setEditName] = useState(categoryName);
    const [selectedIcon, setSelectedIcon] = useState(categoryIcon);
    const [iconPickerOpen, setIconPickerOpen] = useState(false);
    const [deleteMode, setDeleteMode] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [isOverTrash, setIsOverTrash] = useState(false);
    const isOverTrashBackground = useSharedValue(false);
    const translateX = useSharedValue(0);
    const iconScale = useSharedValue(1);
    const trashScale = useSharedValue(1);


    // 一次性提交锁：Android 上点保存按钮会先触发 blur 再触发 press，防止重命名被调用两次
    const renameLockRef = useRef(false);

    const handleRename = () => {
        if (renameLockRef.current) return;
        renameLockRef.current = true;
        const nextName = editName.trim();
        if (nextName && nextName !== categoryName) onRename(nextName);
        setEditing(false);
    };

    const handleIconChange = (icon: string) => {
        setSelectedIcon(icon);
        onChangeIcon(icon);
    };

    const panGesture = Gesture.Pan()
        .onStart(() => {
            iconScale.value = withSpring(1.5);
        })
        .onUpdate((event) => {
            if (event.translationX > 0) {
                translateX.value = Math.min(event.translationX, MAX_SWIPE);
            }

            const nextIsOverTrash = event.translationX > SWIPE_THRESHOLD;
            if (nextIsOverTrash !== isOverTrashBackground.value) {
                scheduleOnRN(setIsOverTrash, nextIsOverTrash);
                isOverTrashBackground.value = nextIsOverTrash;
                trashScale.value = withSpring(nextIsOverTrash ? 2 : 1);
            }
        })
        .onEnd(() => {
            if (isOverTrashBackground.value) {
                scheduleOnRN(setShowDeleteConfirm, true);
            }
            translateX.value = withSpring(0);
            iconScale.value = withSpring(1);
            trashScale.value = withSpring(1);
            scheduleOnRN(setIsOverTrash, false);
            isOverTrashBackground.value = false;
        });

    const iconAnimatedStyle = useAnimatedStyle(() => ({
        transform: [
            { translateX: translateX.value },
            { scale: iconScale.value },
        ],
    }));
    const trashAnimatedStyle = useAnimatedStyle(() => ({
        transform: [{ scale: trashScale.value }],
    }));
    const handleDeleteConfirm = () => {
        onDelete();
        onClose();
        setShowDeleteConfirm(false);
    };

    const SelectedIcon = getCategoryIcon(selectedIcon);

    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
            <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
                <View className="flex-1 items-center justify-center bg-hyper-scrim p-6">
                    <Pressable accessibilityRole="button" accessibilityLabel="关闭分类操作" onPress={onClose}
                        style={{ position: "absolute", top: 0, bottom: 0, left: 0, right: 0 }} />
                    <View accessibilityViewIsModal className="w-full max-w-[440px] rounded-hyper-modal bg-white p-6"
                        style={{ maxHeight: "85%" }}>
                        <View className="mb-3">
                            {editing ? <InputSave
                                accessibilityLabel="分类名称" value={editName} onChangeText={setEditName}
                                placeholder="输入新名称" containerClassName="w-full"
                                inputClassName="web:outline-none"
                                maxLength={10} autoFocus onBlur={handleRename} onSubmitEditing={handleRename}
                                onSave={handleRename}
                            /> : <View className="flex-row items-center justify-between gap-3">
                                <Pressable accessibilityRole="button" accessibilityLabel="更改图标"
                                    accessibilityState={{ expanded: iconPickerOpen }}
                                    onPress={() => setIconPickerOpen((open) => !open)}
                                    style={{ width: 48, height: 48, alignItems: "center", justifyContent: "center" }}>
                                    {createElement(SelectedIcon, { size: 24, color: colors.textPrimary })}
                                </Pressable>
                                <Text accessibilityRole="header" numberOfLines={2} className="flex-1 text-2xl leading-8 text-black">
                                    {categoryName}
                                </Text>
                                <Pressable accessibilityRole="button" accessibilityLabel="重命名分类"
                                    onPress={() => {
                                        renameLockRef.current = false;
                                        setEditing(true);
                                    }} style={{ width: 48, height: 48, alignItems: "center", justifyContent: "center" }}>
                                    <SquarePen size={24} color={colors.hyperTextSecondary} />
                                </Pressable>
                            </View>}
                        </View>
                        <ScrollView style={{ flexShrink: 1 }} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                            {iconPickerOpen && <View className="mb-2">
                                <CategoryIconPicker variant="hyper" selectedIcon={selectedIcon} onChange={handleIconChange} />
                            </View>}
                            <View style={{ flexDirection: "row", gap: 10 }}>
                                <StatusToggle
                                    label={isPinned ? "已置顶" : "未置顶"}
                                    icon={Pin}
                                    selected={isPinned}
                                    onPress={onPin}
                                    className="flex-1"
                                />
                                <StatusToggle
                                    label={isStarred ? "已标星" : "未标星"}
                                    icon={Star}
                                    selected={isStarred}
                                    onPress={onStar}
                                    className="flex-1"
                                />
                            </View>
                        </ScrollView>
                        <View className="mt-4">
                            {!deleteMode ? <DialogButton label="删除分类" variant="secondary" onPress={() => setDeleteMode(true)} /> : <View>
                                <View className="rounded-hyper-card bg-hyper-card p-4">
                                    <Text className="text-sm text-hyper-text-secondary text-center mb-1">此操作不可撤销</Text>
                                    <Text className="text-[13px] text-hyper-text-secondary text-center mb-3">按住图标右滑到垃圾桶确认删除</Text>
                                    <View className="flex-row items-center justify-center gap-4" style={{ minHeight: 56 }}>
                                        <GestureDetector gesture={panGesture}>
                                            <Animated.View style={iconAnimatedStyle}
                                                accessibilityLabel="按住分类图标向右滑动以请求删除确认"
                                                className="w-[44px] h-[44px] items-center justify-center">
                                                {createElement(SelectedIcon, { size: 28, color: colors.textSecondary })}
                                            </Animated.View>
                                        </GestureDetector>
                                        <MoveHorizontal size={20} color={colors.hyperTextSecondary} />
                                        <Animated.View style={trashAnimatedStyle}>
                                            <Trash2 size={28} color={isOverTrash ? colors.primary : colors.textSecondary} />
                                        </Animated.View>
                                    </View>
                                </View>
                                <DialogButton label="取消" variant="secondary" className="mt-3" onPress={() => setDeleteMode(false)} />
                            </View>}
                        </View>
                    </View>
                </View>
            </KeyboardAvoidingView>
            <CategoryDeleteConfirmModal visible={showDeleteConfirm} categoryName={categoryName}
                onClose={() => setShowDeleteConfirm(false)} onConfirm={handleDeleteConfirm} />
        </Modal>
    );
}

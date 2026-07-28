import {
    ChevronRight,
    MoveHorizontal,
    Pin,
    SquarePen,
    Star,
    Trash2,
} from "lucide-react-native";
import { useEffect, useState } from "react";
import {
    Modal,
    Pressable,
    Text,
    TextInput,
    TouchableWithoutFeedback,
    View,
} from "react-native";
import {
    Gesture,
    GestureDetector,
    GestureHandlerRootView,
} from "react-native-gesture-handler";
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withSpring,
    withTiming,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { colors } from "@/shared/theme";
import { ModalPanel } from "@/shared/ui";
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

export default function CategoryActionModal({
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
    const iconRotation = useSharedValue(0);

    useEffect(() => {
        if (!visible) return;

        setEditing(false);
        setEditName(categoryName);
        setSelectedIcon(categoryIcon);
        setIconPickerOpen(false);
        setDeleteMode(false);
        setShowDeleteConfirm(false);
        setIsOverTrash(false);
        isOverTrashBackground.value = false;
        translateX.value = 0;
        iconScale.value = 1;
        trashScale.value = 1;
        iconRotation.value = 0;
    }, [categoryIcon, categoryName, iconRotation, iconScale, isOverTrashBackground, trashScale, translateX, visible]);

    const handleRename = () => {
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
    const rotationAnimatedStyle = useAnimatedStyle(() => ({
        transform: [{ rotate: `${iconRotation.value}deg` }],
        backgroundColor: colors.transparent,
    }));

    const toggleIconPicker = () => {
        iconRotation.value = withTiming(iconPickerOpen ? 0 : 90, {
            duration: 200,
        });
        setIconPickerOpen((current) => !current);
    };

    const handleDeleteConfirm = () => {
        onDelete();
        onClose();
        setShowDeleteConfirm(false);
    };

    const SelectedIcon = getCategoryIcon(selectedIcon);

    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
            <GestureHandlerRootView style={{ flex: 1 }}>
                <TouchableWithoutFeedback onPress={onClose}>
                    <View className="flex-1 items-center justify-center bg-overlay-strong">
                        <TouchableWithoutFeedback>
                            <ModalPanel variant="actions">
                                {editing ? (
                                    <TextInput
                                        value={editName}
                                        onChangeText={setEditName}
                                        placeholder="输入新名称"
                                        maxLength={10}
                                        autoFocus
                                        onBlur={handleRename}
                                        onSubmitEditing={handleRename}
                                    />
                                ) : (
                                    <View className="mb-2 flex-row items-center justify-between">
                                        <Text className="text-[18px] font-bold text-gray-800">
                                            “{categoryName}”
                                        </Text>
                                        <Pressable onPress={() => setEditing(true)} className="p-1">
                                            <SquarePen size={18} color={colors.textSecondary} />
                                        </Pressable>
                                    </View>
                                )}

                                <View className="flex-row gap-3 mb-4 mt-3">
                                    <Pressable
                                        onPress={onPin}
                                        className={`flex-1 flex-row items-center justify-center gap-1 rounded-control py-2 ${isPinned ? "bg-warning-surface" : "bg-surface-muted"}`}
                                    >
                                        <Pin
                                            size={24}
                                            color={isPinned ? colors.warning : colors.textSecondary}
                                            fill={isPinned ? colors.warning : colors.transparent}
                                        />
                                        <Text className="text-[14px] text-gray-500">
                                            {isPinned ? "已置顶" : "未置顶"}
                                        </Text>
                                    </Pressable>
                                    <Pressable
                                        onPress={onStar}
                                        className={`flex-1 flex-row items-center justify-center gap-1 rounded-control py-2 ${isStarred ? "bg-warning-surface" : "bg-surface-muted"}`}
                                    >
                                        <Star
                                            size={24}
                                            color={isStarred ? colors.warning : colors.textSecondary}
                                            fill={isStarred ? colors.warning : colors.transparent}
                                        />
                                        <Text className="text-[14px] text-gray-500">
                                            {isStarred ? "已标星" : "未标星"}
                                        </Text>
                                    </Pressable>
                                </View>

                                <Pressable
                                    className="flex-row items-center justify-between py-3 px-2 bg-surface-muted rounded-control mb-3"
                                    onPress={toggleIconPicker}
                                >
                                    <Text className="text-[14px] text-gray-600">更改图标</Text>
                                    <Animated.View style={rotationAnimatedStyle}>
                                        <ChevronRight size={20} color={colors.textSecondary} />
                                    </Animated.View>
                                </Pressable>
                                {iconPickerOpen && (
                                    <CategoryIconPicker
                                        selectedIcon={selectedIcon}
                                        onChange={handleIconChange}
                                        showLabels={false}
                                    />
                                )}

                                {!deleteMode ? (
                                    <Pressable
                                        onPress={() => setDeleteMode(true)}
                                        className="mt-2 py-2 bg-red-50 rounded-control"
                                    >
                                        <Text className="text-center text-[14px] font-bold text-red-500">
                                            删除分类
                                        </Text>
                                    </Pressable>
                                ) : (
                                    <View className="mt-2">
                                        <View className="bg-red-50 rounded-control p-4">
                                            <Text className="text-[12px] text-red-500 text-center font-bold mb-1">
                                                此操作不可撤销
                                            </Text>
                                            <Text className="text-[12px] text-red-400 text-center mb-3">
                                                按住图标右滑到垃圾桶确认删除
                                            </Text>
                                            <View className="flex-row items-center justify-center gap-4">
                                                <GestureDetector gesture={panGesture}>
                                                    <Animated.View
                                                        style={iconAnimatedStyle}
                                                        className="w-[30px] h-[30px] items-center justify-center rounded-indicator"
                                                    >
                                                        <SelectedIcon size={28} color={colors.textSecondary} />
                                                    </Animated.View>
                                                </GestureDetector>
                                                <MoveHorizontal size={20} color={colors.textSubtle} />
                                                <Animated.View style={trashAnimatedStyle}>
                                                    <Trash2
                                                        size={28}
                                                        color={isOverTrash ? colors.dangerBright : colors.textSecondary}
                                                    />
                                                </Animated.View>
                                            </View>
                                        </View>
                                        <Pressable
                                            onPress={() => setDeleteMode(false)}
                                            className="mt-3 py-3 bg-gray-100 rounded-control"
                                        >
                                            <Text className="text-center text-[14px] text-gray-500">取消</Text>
                                        </Pressable>
                                    </View>
                                )}
                            </ModalPanel>
                        </TouchableWithoutFeedback>
                    </View>
                </TouchableWithoutFeedback>
            </GestureHandlerRootView>
            <CategoryDeleteConfirmModal
                visible={showDeleteConfirm}
                categoryName={categoryName}
                onClose={() => setShowDeleteConfirm(false)}
                onConfirm={handleDeleteConfirm}
            />
        </Modal>
    );
}

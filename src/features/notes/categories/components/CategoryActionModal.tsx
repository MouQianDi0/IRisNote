import {
    ChevronRight,
    MoveHorizontal,
    Pencil,
    Pin,
    Star,
    Trash2,
} from "lucide-react-native";
import { useEffect, useState } from "react";
import {
    Modal,
    Pressable,
    ScrollView,
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
import { getCategoryIcon } from "../category-icons";
import { colors } from "@/shared/theme";
import { Button, ModalPanel } from "@/shared/ui";

type Props = {
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

// 图标选项列表
// 图标分组：文件/组织
const iconsGroup1 = [
    "Folder",
    "FolderOpen",
    "FolderPlus",
    "FolderHeart",
    "FileText",
    "File",
    "FileCheck",
    "Archive",
    "Inbox",
    "ClipboardList",
    "Lightbulb",
    "LightbulbOff",
    "Sparkles",
    "Zap",
    "Flame",
    "Rocket",
    "Gem",
    "Tag",
    "Tags",
    "Bookmark",
    "BookmarkCheck",
];
// 图标分组：标签/任务/学习
const iconsGroup2 = [
    "Flag",
    "Star",
    "Heart",
    "CheckCircle",
    "ListTodo",
    "Briefcase",
    "Target",
    "Calendar",
    "Clock",
    "Timer",
    "BookOpen",
    "Book",
    "GraduationCap",
    "Brain",
    "Library",
    "Notebook",
    "PenTool",
    "Coffee",
    "Music",
    "Camera",
    "Gamepad2",
];
// 图标分组：生活/工具/其他
const iconsGroup3 = [
    "Palette",
    "Utensils",
    "Plane",
    "Code",
    "Terminal",
    "Database",
    "Wrench",
    "Settings",
    "Cpu",
    "Wifi",
    "Home",
    "Map",
    "Compass",
    "Globe",
    "Bell",
    "Gift",
    "Smile",
    "Eye",
];

// 图标行渲染（提取到组件外部避免每次渲染重建）
const renderIconRow = (
    icons: string[],
    selectedIcon: string,
    onIconPress: (icon: string) => void,
) => (
    <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{
            gap: 8,
            paddingHorizontal: 4,
            paddingVertical: 8,
        }}
        style={{ maxWidth: 300 }}
    >
        {icons.map((iconName) => {
            const IconComp = getCategoryIcon(iconName);
            const isSelected = iconName === selectedIcon;
            return (
                <Pressable
                    key={iconName}
                    onPress={() => onIconPress(iconName)}
                    className={`w-[48px] h-[48px] items-center justify-center rounded-control ${isSelected ? "bg-primary" : "bg-surface-muted"}`}
                >
                    <IconComp
                        size={24}
                        color={
                            isSelected ? colors.surface : colors.textSecondary
                        }
                    />
                </Pressable>
            );
        })}
    </ScrollView>
);

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
}: Props) {
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
        if (visible) {
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
            iconRotation.value = 0;
        }
    }, [visible, categoryName, categoryIcon]);

    const handleRename = () => {
        const trimmed = editName.trim();
        if (trimmed && trimmed !== categoryName) {
            onRename(trimmed);
        }
        setEditing(false);
    };
    const handleIconChange = (icon: string) => {
        setSelectedIcon(icon);
        onChangeIcon(icon);
    };
    const SWIPE_THRESHOLD = 50;
    const MAX_SWIPE = 100;
    const panGesture = Gesture.Pan()
        .onStart((event) => {
            iconScale.value = withSpring(1.5);
        })
        .onUpdate((event) => {
            if (event.translationX > 0) {
                translateX.value = Math.min(event.translationX, MAX_SWIPE);
            }
            const distance = event.translationX;
            const isOver = distance > SWIPE_THRESHOLD;
            if (isOver !== isOverTrashBackground.value) {
                scheduleOnRN(setIsOverTrash, isOver);
                isOverTrashBackground.value = isOver;
                trashScale.value = withSpring(isOver ? 2 : 1);
            }
        })
        .onEnd(() => {
            console.log(
                "拖拽结束, isOverTrashBackground:",
                isOverTrashBackground.value,
            );
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
    const handleIconToggle = () => {
        iconRotation.value = withTiming(iconPickerOpen ? 0 : 90, {
            duration: 200,
        });
        setIconPickerOpen(!iconPickerOpen);
    };
    return (
        <Modal
            visible={visible}
            transparent={true}
            animationType="fade"
            onRequestClose={onClose}
        >
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
                                    <Text className="text-[18px] font-bold text-gray-800">
                                        "{categoryName}"
                                    </Text>
                                )}
                                <Pressable
                                    onPress={() => setEditing(true)}
                                    className="p-1"
                                >
                                    <Pencil
                                        size={24}
                                        color={colors.textSecondary}
                                    />
                                </Pressable>

                                <View className="flex-row gap-3 mb-4 mt-3">
                                    <Pressable
                                        onPress={onPin}
                                        className={`flex-1 flex-row items-center justify-center gap-1 rounded-control py-2 ${isPinned ? "bg-warning-surface" : "bg-surface-muted"}`}
                                    >
                                        <Pin
                                            size={24}
                                            color={
                                                isPinned
                                                    ? colors.warning
                                                    : colors.textSecondary
                                            }
                                            fill={
                                                isPinned
                                                    ? colors.warning
                                                    : colors.transparent
                                            }
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
                                            color={
                                                isStarred
                                                    ? colors.warning
                                                    : colors.textSecondary
                                            }
                                            fill={
                                                isStarred
                                                    ? colors.warning
                                                    : colors.transparent
                                            }
                                        />
                                        <Text className="text-[14px] text-gray-500">
                                            {isStarred ? "已标星" : "未标星"}
                                        </Text>
                                    </Pressable>
                                </View>
                                <Pressable
                                    className="flex-row items-center justify-between py-3 px-2 bg-surface-muted rounded-control mb-3"
                                    onPress={handleIconToggle}
                                >
                                    <Text className="text-[14px] text-gray-600">
                                        更改图标
                                    </Text>
                                    <Animated.View
                                        style={rotationAnimatedStyle}
                                    >
                                        <ChevronRight
                                            size={20}
                                            color={colors.textSecondary}
                                        />
                                    </Animated.View>
                                </Pressable>
                                {iconPickerOpen && (
                                    <View>
                                        <View className="-mb-3">
                                            {renderIconRow(
                                                iconsGroup1,
                                                selectedIcon,
                                                handleIconChange,
                                            )}
                                        </View>
                                        <View className="-mb-3">
                                            {renderIconRow(
                                                iconsGroup2,
                                                selectedIcon,
                                                handleIconChange,
                                            )}
                                        </View>
                                        <View className="mb-1">
                                            {renderIconRow(
                                                iconsGroup3,
                                                selectedIcon,
                                                handleIconChange,
                                            )}
                                        </View>
                                    </View>
                                )}
                                {categoryName !== "全部" &&
                                    (!deleteMode ? (
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
                                                    该操作不可撤回
                                                </Text>
                                                <Text className="text-[12px] text-red-400 text-center mb-3">
                                                    按住图标右滑到垃圾桶确认删除
                                                </Text>
                                                <View className="flex-row items-center justify-center gap-4">
                                                    <GestureDetector
                                                        gesture={panGesture}
                                                    >
                                                        <Animated.View
                                                            style={
                                                                iconAnimatedStyle
                                                            }
                                                            className="w-[30px] h-[30px] items-center justify-center rounded-indicator"
                                                        >
                                                            {(() => {
                                                                const IconComp =
                                                                    getCategoryIcon(
                                                                        selectedIcon,
                                                                    );
                                                                return (
                                                                    <IconComp
                                                                        size={
                                                                            28
                                                                        }
                                                                        color={
                                                                            colors.textSecondary
                                                                        }
                                                                    />
                                                                );
                                                            })()}
                                                        </Animated.View>
                                                    </GestureDetector>
                                                    <MoveHorizontal
                                                        size={20}
                                                        color={
                                                            colors.textSubtle
                                                        }
                                                    />
                                                    <Animated.View
                                                        style={
                                                            trashAnimatedStyle
                                                        }
                                                    >
                                                        <Trash2
                                                            size={28}
                                                            color={
                                                                isOverTrash
                                                                    ? colors.dangerBright
                                                                    : colors.textSecondary
                                                            }
                                                        />
                                                    </Animated.View>
                                                </View>
                                            </View>
                                            <Pressable
                                                onPress={() =>
                                                    setDeleteMode(false)
                                                }
                                                className="mt-3 py-3 bg-gray-100 rounded-control"
                                            >
                                                <Text className="text-center text-[14px] text-gray-500">
                                                    取消
                                                </Text>
                                            </Pressable>
                                        </View>
                                    ))}
                            </ModalPanel>
                        </TouchableWithoutFeedback>
                    </View>
                </TouchableWithoutFeedback>
            </GestureHandlerRootView>
            <Modal
                visible={showDeleteConfirm}
                transparent={true}
                animationType="fade"
                onRequestClose={() => setShowDeleteConfirm(false)}
            >
                <GestureHandlerRootView style={{ flex: 1 }}>
                    <TouchableWithoutFeedback
                        onPress={() => setShowDeleteConfirm(false)}
                    >
                        <View className="flex-1 items-center justify-center bg-overlay-strong">
                            <TouchableWithoutFeedback>
                                <ModalPanel variant="confirm">
                                    <Text className="text-[16px] font-bold text-gray-800 text-center mb-2">
                                        确认删除？
                                    </Text>
                                    <Text className="text-[14px] text-gray-500 text-center mb-4">
                                        删除后无法找回{"\n"}分类 "{categoryName}
                                        " 下的笔记将被永久删除
                                    </Text>
                                    <View className="flex-row gap-3">
                                        <Button
                                            onPress={() =>
                                                setShowDeleteConfirm(false)
                                            }
                                            className="flex-1 py-3 rounded-control"
                                            variant="secondary"
                                        >
                                            <Text className="text-center text-[14px] text-gray-600">
                                                取消
                                            </Text>
                                        </Button>
                                        <Button
                                            onPress={() => {
                                                onDelete();
                                                onClose();
                                                setShowDeleteConfirm(false);
                                            }}
                                            className="flex-1 py-3 rounded-control"
                                            variant="danger"
                                        >
                                            <Text className="text-center text-[14px] font-bold text-white">
                                                确认删除
                                            </Text>
                                        </Button>
                                    </View>
                                </ModalPanel>
                            </TouchableWithoutFeedback>
                        </View>
                    </TouchableWithoutFeedback>
                </GestureHandlerRootView>
            </Modal>
        </Modal>
    );
}

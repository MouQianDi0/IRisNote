import { getCategories } from "../api/categories.api";
import { useApplicationDatabase } from "@/core/database";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { applyQueuedCategoryChanges } from "@/features/sync";
import { useDebouncedNavigation } from "@/core/navigation/hooks/useDebouncedNavigation";
import { useLongPressNavigation } from "@/core/navigation/hooks/useLongPressNavigation";
import { colors, radius } from "@/shared/theme";
import { UserIcon } from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import { Image, Pressable, ScrollView, View } from "react-native";
import { GestureDetector } from "react-native-gesture-handler";
import Animated from "react-native-reanimated";
import { ALL_CATEGORY } from "../categories.constants";
import {
    getCurrentCategoryId,
    setCurrentCategory,
} from "../category-selection";
import { onCategoriesChanged } from "../categories.events";
import type { Category } from "@/features/notes/categories/categories.types";
import { useCategoryChangeIcon } from "../hooks/useCategoryChangeIcon";
import { useCategoryDelete } from "../hooks/useCategoryDelete";
import { useCategoryPin } from "../hooks/useCategoryPin";
import { useCategoryRename } from "../hooks/useCategoryRename";
import { useCategoryStar } from "../hooks/useCategoryStar";
import { useAvatar } from "@/features/profile/hooks/useAvatar";
import CategoryActionModal from "./CategoryActionModal";
import CategoryButton from "./CategoryButton";
import AddCategoryButton from "./AddCategoryButton";

type FloatingBarProps = {
    onCategoryPress: (category: string) => void;
    onAddCategory: () => void;
};
export default function FloatingBar({ onCategoryPress, onAddCategory }: FloatingBarProps) {
    const database = useApplicationDatabase();
    const { user } = useAuth();
    const [selectedId, setSelectedId] = useState(getCurrentCategoryId());
    const categoriesRequestRef = useRef<Promise<void> | null>(null);
    const { gesture: longPress, animatedStyle } = useLongPressNavigation("/user");
    const handlePress = (id: number) => {
        if (id === selectedId) return;
        setSelectedId(id);
        const cat =
            id === ALL_CATEGORY.id
                ? ALL_CATEGORY
                : (categories.find((c) => c.id === id) ?? ALL_CATEGORY);
        setCurrentCategory(id, cat.name);
        onCategoryPress(String(id));
    };
    const onNavigate = useDebouncedNavigation();
    const [categories, setCategories] = useState<Category[]>([]);

    const fetchCategories = useCallback(function fetchCategoriesRequest() {
        if (categoriesRequestRef.current) return categoriesRequestRef.current;

        const request = getCategories()
            .then(async (data) => {
                setCategories(user
                    ? await applyQueuedCategoryChanges(database, user.id, data)
                    : data);
            })
            .catch((err: any) => {
                console.error(
                    "获取分类列表失败:",
                    err.response?.status,
                    err.response?.data || err.message,
                );
            })
            .finally(() => {
                categoriesRequestRef.current = null;
            });

        categoriesRequestRef.current = request;
        return request;
    }, [database, user]);

    useEffect(() => {
        fetchCategories();
    }, [fetchCategories]);

    // 订阅分类变更通知，外部创建分类后自动刷新列表
    useEffect(() => {
        const unsub = onCategoriesChanged(() => {
            fetchCategories();
        });
        return unsub;
    }, [fetchCategories]);

    const [longPressVisible, setLongPressVisible] = useState<Category | null>(
        null,
    );
    const [categoryModelVisible, setCategoryModelVisible] = useState(false);
    const handleCategoryDeleted = useCallback(
        (category: Category) => {
            if (selectedId !== category.id) return;
            setSelectedId(ALL_CATEGORY.id);
            setCurrentCategory(ALL_CATEGORY.id, ALL_CATEGORY.name);
            onCategoryPress(String(ALL_CATEGORY.id));
        },
        [onCategoryPress, selectedId],
    );
    const { deleteCategory } = useCategoryDelete(
        database,
        user?.id ?? null,
        setCategories,
        setLongPressVisible,
        setCategoryModelVisible,
        handleCategoryDeleted,
    );
    const { togglePin } = useCategoryPin(database, user?.id ?? null, setCategories, setLongPressVisible);
    const { toggleStar } = useCategoryStar(database, user?.id ?? null, setCategories, setLongPressVisible);
    const { renameCategory } = useCategoryRename(
        database,
        user?.id ?? null,
        setCategories,
        setLongPressVisible,
    );
    const { changeIcon } = useCategoryChangeIcon(
        database,
        user?.id ?? null,
        setCategories,
        setLongPressVisible,
    );
    const pinnedCategories = categories.filter((item) => item.is_pinned);
    const normalCategories = categories.filter((item) => !item.is_pinned);

    const { avatarSource, avatarKey } = useAvatar();

    return (
        <View className="flex-col justify-center items-center">
            <View className="w-[50px]">
                <Animated.View style={animatedStyle}>
                    <GestureDetector gesture={longPress}>
                        <Pressable
                            className="w-[50px] h-[50px] mb-[10px]"
                            onPress={() => onNavigate("/user")}
                        >
                            {avatarSource ? (
                                <Image
                                    style={{
                                        width: "100%",
                                        height: "100%",
                                        borderRadius: radius.control,
                                    }}
                                    key={avatarKey}
                                    className="border-[2px] border-floating-accent"
                                    source={avatarSource}
                                />
                            ) : (
                                <View
                                    style={{
                                        width: "100%",
                                        height: "100%",
                                        borderRadius: radius.control,
                                    }}
                                    className="border-[2px] border-floating-accent flex justify-center items-center"
                                >
                                    <UserIcon
                                        size={36}
                                        color={colors.surface}
                                    />
                                </View>
                            )}
                        </Pressable>
                    </GestureDetector>
                </Animated.View>
                <View className="h-[2px] w-[28px] my-[8px] mx-auto rounded-full bg-divider opacity-80" />
                <ScrollView
                    style={{ maxHeight: 560 }}
                    showsVerticalScrollIndicator={false}
                >
                    <CategoryButton
                        category={ALL_CATEGORY}
                        isActive={selectedId === ALL_CATEGORY.id}
                        onPress={() => handlePress(ALL_CATEGORY.id)}
                    />

                    {pinnedCategories.length > 0 && (
                        <>
                            {pinnedCategories.map((category) => (
                                <CategoryButton
                                    key={category.id}
                                    category={category}
                                    isActive={selectedId === category.id}
                                    onPress={() => handlePress(category.id)}
                                    onLongPress={() => {
                                        setLongPressVisible(category);
                                        setCategoryModelVisible(true);
                                    }}
                                />
                            ))}
                        </>
                    )}
                    {normalCategories.map((category) => (
                        <CategoryButton
                            key={category.id}
                            category={category}
                            isActive={selectedId === category.id}
                            onPress={() => handlePress(category.id)}
                            onLongPress={() => {
                                setLongPressVisible(category);
                                setCategoryModelVisible(true);
                            }}
                        />
                    ))}
                    <AddCategoryButton onPress={onAddCategory} />
                </ScrollView>
                <View className="h-[2px] w-[28px] my-[8px] mx-auto rounded-full bg-divider opacity-80" />

                {longPressVisible && (
                    <CategoryActionModal
                        visible={categoryModelVisible}
                        onClose={() => {
                            setCategoryModelVisible(false);
                            setLongPressVisible(null);
                        }}
                        onDelete={() => {
                            if (longPressVisible)
                                deleteCategory(longPressVisible);
                        }}
                        onPin={() => {
                            if (longPressVisible) togglePin(longPressVisible);
                        }}
                        onStar={() => {
                            if (longPressVisible) toggleStar(longPressVisible);
                        }}
                        onRename={(name) => {
                            if (longPressVisible)
                                renameCategory(longPressVisible, name);
                        }}
                        onChangeIcon={(icon) => {
                            if (longPressVisible)
                                changeIcon(longPressVisible, icon);
                        }}
                        categoryName={longPressVisible.name}
                        categoryIcon={longPressVisible.icon}
                        isPinned={longPressVisible.is_pinned}
                        isStarred={longPressVisible.is_starred}
                    />
                )}
            </View>
        </View>
    );
}

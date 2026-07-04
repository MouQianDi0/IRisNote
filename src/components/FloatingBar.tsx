import api from "@/api/client";
import { UserIcon } from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Image, Pressable, ScrollView, Text, View } from "react-native";
import { GestureDetector } from "react-native-gesture-handler";
import Animated from "react-native-reanimated";
import {
    ALL_CATEGORY,
    Category,
    getCurrentCategoryId,
    getIcon,
    onCategoriesChanged,
    setCurrentCategory,
} from "../data/categories";
import { pulse } from "../hooks/animations";
import { useCategoryChangeIcon } from "../hooks/FloatingBar/useCategoryChangeIcon";
import { useCategoryDelete } from "../hooks/FloatingBar/useCategoryDelete";
import { useCategoryPin } from "../hooks/FloatingBar/useCategoryPin";
import { useCategoryRename } from "../hooks/FloatingBar/useCategoryRename";
import { useCategoryStar } from "../hooks/FloatingBar/useCategoryStar";
import { useAvatar } from "../hooks/useAvatar";
import { useDebounceNavigation } from "../hooks/useDebounceNavigation";
import { useLongPressButton } from "../hooks/useLongPressButton";
import CategoryActionModel from "./CategoryActionModel";

type FloatingBarProps = {
    onCategoryPress: (category: string) => void;
};
export default function FloatingBar({ onCategoryPress }: FloatingBarProps) {
    const [selectedId, setSelectedId] = useState(getCurrentCategoryId());
    const categoriesRequestRef = useRef<Promise<void> | null>(null);
    const { gesture: longPress, animatedStyle } = useLongPressButton("/user");
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
    const onNavigate = useDebounceNavigation();
    const [categories, setCategories] = useState<Category[]>([]);

    const fetchCategories = useCallback(() => {
        if (categoriesRequestRef.current) return categoriesRequestRef.current;

        const request = api
            .get<Category[]>("/categories")
            .then(({ data }) => {
                setCategories(data);
            })
            .catch((err: any) => {
                console.error(
                    "获取分类列表失败:",
                    err.response?.status,
                    err.response?.data || err.message,
                );
                Alert.alert("加载失败", "获取分类列表失败，请检查网络后重试", [
                    { text: "取消", style: "cancel" },
                    { text: "重试", onPress: () => fetchCategories() },
                ]);
            })
            .finally(() => {
                categoriesRequestRef.current = null;
            });

        categoriesRequestRef.current = request;
        return request;
    }, []);

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
        setCategories,
        setLongPressVisible,
        setCategoryModelVisible,
        handleCategoryDeleted,
    );
    const { togglePin } = useCategoryPin(setCategories, setLongPressVisible);
    const { toggleStar } = useCategoryStar(setCategories, setLongPressVisible);
    const { renameCategory } = useCategoryRename(
        setCategories,
        setLongPressVisible,
    );
    const { changeIcon } = useCategoryChangeIcon(
        setCategories,
        setLongPressVisible,
    );
    const sortedCategories = [ALL_CATEGORY, ...categories].sort((a, b) => {
        if (a.id === ALL_CATEGORY.id) return -1;
        if (b.id === ALL_CATEGORY.id) return 1;
        if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
        return 0;
    });

    const { avatarSource, avatarKey } = useAvatar();

    return (
        <View className="flex-col justify-center">
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
                                        borderRadius: 12,
                                    }}
                                    key={avatarKey}
                                    className="border-[2px] border-[#36A5FF] "
                                    source={avatarSource}
                                />
                            ) : (
                                <UserIcon size={36} color="#fff" />
                            )}
                        </Pressable>
                    </GestureDetector>
                </Animated.View>
                <View className="h-[2px] bg-gray-300 my-[7px] w-[40px] mx-[auto]"></View>
                <ScrollView
                    style={{ maxHeight: 560 }}
                    showsVerticalScrollIndicator={false}
                >
                    {sortedCategories.map((item) => {
                        const isActive = selectedId === item.id;
                        const IconComponent = getIcon(item.icon);
                        return (
                            <Pressable
                                key={item.id}
                                onLongPress={() => {
                                    setLongPressVisible(item);
                                    setCategoryModelVisible(true);
                                }}
                                delayLongPress={400}
                                className={`
                        w-[50px] h-[60px]
                        rounded-[12px]
                        justify-center
                        items-center
                        pl-[6px] pr-[4px] py-[4px]
                        ${isActive ? ` bg-[#f2f2f2]` : `bg-[#f2f2f2]`}`}
                                onPress={() => handlePress(item.id)}
                            >
                                {isActive ? (
                                    <Animated.View
                                        style={{
                                            animationName: pulse,
                                            animationDuration: "0.5s",
                                            animationTimingFunction: "ease-out",
                                        }}
                                    >
                                        <IconComponent
                                            size={30}
                                            color="#37a5ffff"
                                        />
                                    </Animated.View>
                                ) : (
                                    <IconComponent size={30} color="#666" />
                                )}
                                <Text
                                    className={`text-[10px] ${isActive ? "text-blue-500 font-semibold" : "text-gray-400"}`}
                                >
                                    {item.name}
                                </Text>
                            </Pressable>
                        );
                    })}
                </ScrollView>
                <View className="h-[2px] bg-gray-300 my-[7px] w-[40px] mx-[auto]"></View>

                {longPressVisible && (
                    <CategoryActionModel
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

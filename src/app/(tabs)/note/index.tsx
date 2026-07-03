import api from "@/api/client";
import AddCategoryButton from "@/components/AddCategoryButton";
import AddNoteClass from "@/components/addNoteClass";
import FloatingBar from "@/components/FloatingBar";
import {
    ALL_CATEGORY,
    notifyCategoriesChanged,
    onCategoriesChanged,
    type Category,
} from "@/data/categories";
import { useFocusEffect } from "expo-router";
import { ChevronUp } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, FlatList, Pressable, Text, View } from "react-native";
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withRepeat,
    withTiming,
} from "react-native-reanimated";

type Note = {
    id: number;
    title: string;
    content: string | null;
    category_id: number | null;
    created_at: string;
};

export default function Index() {
    const [notes, setNotes] = useState<Note[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [currentCategory, setCurrentCategory] = useState(
        String(ALL_CATEGORY.id),
    );
    const [showScrollTop, setShowScrollTop] = useState(false);
    const [NoteClassMenu, setNoteClassMenu] = useState(false);
    const flatListRef = useRef<FlatList<Note>>(null);

    const fetchNotes = useCallback(async () => {
        try {
            const { data } = await api.get<Note[]>("/notes");
            setNotes(data);
        } catch (err: any) {
            console.error(
                "获取笔记失败:",
                err.response?.status,
                err.response?.data || err.message,
            );
        }
    }, []);

    const fetchCategories = useCallback(async () => {
        try {
            const { data } = await api.get<Category[]>("/categories");
            setCategories(data);
        } catch (err: any) {
            console.error("获取分类失败:", err.message);
        }
    }, []);

    useEffect(() => {
        Promise.all([fetchNotes(), fetchCategories()]).finally(() =>
            setLoading(false),
        );
    }, [fetchNotes, fetchCategories]);

    // 订阅分类变更通知（FloatingBar 修改分类后自动刷新标签）
    useEffect(() => {
        const unsub = onCategoriesChanged(() => {
            fetchCategories();
            fetchNotes();
        });
        return unsub;
    }, [fetchCategories, fetchNotes]);

    // 创建笔记返回后刷新
    useFocusEffect(
        useCallback(() => {
            fetchNotes();
            fetchCategories();
        }, [fetchNotes, fetchCategories]),
    );

    const handleRefresh = async () => {
        setRefreshing(true);
        await fetchNotes();
        setRefreshing(false);
    };

    const handleDelete = (item: Note) => {
        Alert.alert("删除笔记", `确定要删除「${item.title}」吗？`, [
            { text: "取消", style: "cancel" },
            {
                text: "删除",
                style: "destructive",
                onPress: async () => {
                    try {
                        await api.delete(`/notes/${item.id}`);
                        setNotes((prev) =>
                            prev.filter((n) => n.id !== item.id),
                        );
                    } catch (err: any) {
                        Alert.alert(
                            "提示",
                            err.response?.data?.error || "删除失败",
                        );
                    }
                },
            },
        ]);
    };

    const handleAddCategory = async (name: string, icon: string) => {
        try {
            await api.post("/categories", { name, icon });
            notifyCategoriesChanged();
            fetchCategories();
            setNoteClassMenu(false);
        } catch (err: any) {
            console.error("创建分类失败:", err.message);
        }
    };

    const handleScrollToTop = () => {
        flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
    };

    const handleScroll = useCallback((event: any) => {
        const offsetY = event.nativeEvent.contentOffset.y;
        setShowScrollTop(offsetY > 300);
    }, []);

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
    }, [categories]);

    const filteredNotes =
        currentCategory === String(ALL_CATEGORY.id)
            ? notes
            : notes.filter(
                  (note) => String(note.category_id) === currentCategory,
              );

    return (
        <View className="mt-10 bp-[#ecedefff] h-full">
            <View className="flex-row h-full ">
                <View
                    className="     relative
                                    w-[75px]
                                    bg-[rgb(242, 242, 242)]
                                    h-auto                           
                                    rounded-[18px]
                                    items-center gap-[6px]"
                >
                    <FloatingBar onCategoryPress={setCurrentCategory} />
                    <View className="absolute bottom-20">
                        <AddCategoryButton
                            onPress={() => setNoteClassMenu(true)}
                        />
                    </View>
                </View>
                <View className="relative flex-1">
                    <View className="bg-white rounded-tl-[30px] p-4 h-[100%] border-[1px] border-[#d7d7d7]">
                        <FlatList
                            ref={flatListRef}
                            className="rounded-[14px]"
                            data={filteredNotes}
                            keyExtractor={(item) => String(item.id)}
                            showsVerticalScrollIndicator={false}
                            contentContainerStyle={{ paddingBottom: 10 }}
                            onScroll={handleScroll}
                            scrollEventThrottle={16}
                            ListHeaderComponent={
                                <View
                                    className="bg-blue-50 h-[200px] rounded-[14px] mb-6 "
                                    style={{ width: "100%", maxWidth: 400 }}
                                ></View>
                            }
                            refreshing={refreshing}
                            onRefresh={handleRefresh}
                            renderItem={({ item }) => (
                                <Pressable
                                    onLongPress={() => handleDelete(item)}
                                    className="bg-[#f4e2f4] rounded-[14px] p-5 mb-4 "
                                    style={{ width: "100%", maxWidth: 400 }}
                                >
                                    <Text className="text-base font-semibold text-gray-800">
                                        {item.title}
                                    </Text>
                                    <Text className="text-sm text-gray-500 mt-1">
                                        {item.content}
                                    </Text>
                                    <View className="flex-row items-center mt-2">
                                        <View className="bg-blue-50 rounded-full px-2 py-0.5">
                                            <Text className="text-xs text-blue-500">
                                                {item.category_id != null
                                                    ? (categoryNameMap.get(
                                                          item.category_id,
                                                      ) ?? "未知")
                                                    : "默认"}
                                            </Text>
                                        </View>
                                    </View>
                                </Pressable>
                            )}
                            ListEmptyComponent={
                                <View className="items-center py-8">
                                    <Text className="text-gray-400 text-base">
                                        暂无笔记
                                    </Text>
                                </View>
                            }
                        />
                    </View>
                    {showScrollTop && (
                        <Animated.View
                            style={bounceStyle}
                            className="absolute bottom-15 left-1/2 -translate-x-1/2"
                        >
                            <Pressable
                                onPress={handleScrollToTop}
                                className="right-1/2 -translate-x-1/2 w-11 h-11 bg-transparent rounded-full items-center justify-center relative"
                            >
                                <ChevronUp size={50} color="#7c7c7ccb" />
                            </Pressable>
                        </Animated.View>
                    )}
                </View>
            </View>
            <AddNoteClass
                visible={NoteClassMenu}
                onClose={() => setNoteClassMenu(false)}
                onAdd={handleAddCategory}
            />
        </View>
    );
}

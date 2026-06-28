import api from "@/api/client";
import FloatingBar from "@/components/FloatingBar";
import { useFocusEffect } from "expo-router";
import { ChevronUp } from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, FlatList, Pressable, Text, View } from "react-native";

type Note = {
    id: number;
    title: string;
    content: string | null;
    category: string | null;
    created_at: string;
};

export default function Index() {
    const [notes, setNotes] = useState<Note[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [currentCategory, setCurrentCategory] = useState("all");
    const [showScrollTop, setShowScrollTop] = useState(false);
    const flatListRef = useRef<FlatList<Note>>(null);

    const fetchNotes = useCallback(async () => {
        try {
            const { data } = await api.get<Note[]>("/notes");
            setNotes(data);
        } catch (err: any) {
            console.error("获取笔记失败:", err.message);
        }
    }, []);

    useEffect(() => {
        fetchNotes().finally(() => setLoading(false));
    }, [fetchNotes]);

    // 创建笔记返回后刷新
    useFocusEffect(
        useCallback(() => {
            fetchNotes();
        }, [fetchNotes]),
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
    const handleScrollToTop = () => {
        flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
    };

    const handleScroll = useCallback((event: any) => {
        const offsetY = event.nativeEvent.contentOffset.y;
        setShowScrollTop(offsetY > 300);
    }, []);

    const filteredNotes =
        currentCategory === "all"
            ? notes
            : notes.filter((note) => note.category === currentCategory); // 过滤分类为当前分类的笔记

    return (
        <View className="mt-10 bp-[#ecedefff] ">
            <View className="flex-row ">
                <View
                    className="
                                    w-[75px]
                                    bg-[rgb(242, 242, 242)]
                                    h-auto                           
                                    rounded-[18px]
                                    items-center gap-[6px]"
                >
                    <FloatingBar onCategoryPress={setCurrentCategory} />
                </View>
                <View className="relative flex-1">
                    <View className="bg-white rounded-tl-[30px] p-4 h-[100%]  ">
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
                                                {item.category ?? "默认"}
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
                        <Pressable
                            onPress={handleScrollToTop}
                            className="absolute bottom-15 left-1/2 -translate-x-1/2 w-11 h-11 bg-transparent rounded-full items-center justify-center "
                        >
                            <ChevronUp size={50} color="#cbcbcbff" />
                        </Pressable>
                    )}
                </View>
            </View>
        </View>
    );
}

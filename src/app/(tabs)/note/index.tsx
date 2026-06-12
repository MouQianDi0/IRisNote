import api from "@/api/client";
import FloatingBar from "@/components/FloatingBar";
import FloatingMenu from "@/components/FloatingMenu";
import { useEffect, useState } from "react";
import { FlatList, Text, View } from "react-native";

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
    const [currentCategory, setCurrentCategory] = useState("all");

    useEffect(() => {
        api.get<Note[]>("/notes")
            .then(({ data }) => {
                console.log("笔记数据:", JSON.stringify(data));
                setNotes(data);
            })
            .catch((err) => console.error("获取笔记失败:", err.message))
            .finally(() => setLoading(false));
    }, []);
    const filteredNotes =
        currentCategory === "all"
            ? notes
            : notes.filter((note) => note.category === currentCategory); // 过滤分类为当前分类的笔记

    return (
        <View className="flex-1 bp-[rgb(236,237,239) ">
            <View className="mt-[10px] flex-row ">
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
                            className="rounded-[14px]"
                            data={filteredNotes}
                            keyExtractor={(item) => String(item.id)}
                            showsVerticalScrollIndicator={false}
                            contentContainerStyle={{ paddingBottom: 10 }}
                            ListHeaderComponent={
                                <View
                                    className="bg-blue-50 h-[200px] rounded-[14px] mb-6 "
                                    style={{ width: "100%", maxWidth: 400 }}
                                ></View>
                            }
                            renderItem={({ item }) => (
                                <View
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
                                </View>
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
                </View>
            </View>

            <FloatingMenu />
        </View>
    );
}

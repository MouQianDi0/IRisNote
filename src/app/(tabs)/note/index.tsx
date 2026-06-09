import FloatingBar from "@/components/FloatingBar";
import FloatingMenu from "@/components/FloatingMenu";
import { useState } from "react";
import { FlatList, Text, View } from "react-native";

const allNotes = [
    {
        id: "1",
        title: "会议记录",
        category: "work",
        content: "讨论了项目进度...",
    },
    {
        id: "2",
        title: "React 学习笔记",
        category: "study",
        content: "学习了 Hook 用法...",
    },
    { id: "3", title: "周末计划", category: "life", content: "去公园跑步..." },
    {
        id: "4",
        title: "产品想法",
        category: "idea",
        content: "做一个笔记App...",
    },
    { id: "5", title: "周报", category: "work", content: "本周完成了..." },
    {
        id: "6",
        title: "TypeScript 笔记",
        category: "study",
        content: "泛型的用法...",
    },
    {
        id: "7",
        title: "读书清单",
        category: "life",
        content: "《原子习惯》...",
    },
    { id: "8", title: "设计灵感", category: "idea", content: "渐变色背景..." },
];
export default function Index() {
    const [currentCategory, setCurrentCategory] = useState("all");
    const filteredNotes =
        currentCategory === "all"
            ? allNotes
            : allNotes.filter((note) => note.category === currentCategory);

    return (
        <View className="flex-1 bp-[rgb(236,237,239) ">
            <View
                className="bg-[rgb(242, 242, 242)]
                        w-[60px]
                        h-auto
                        absolute
                        top-[0px] left-[0px]
                        rounded-[18px]
                        py-[20px]  gap-[6px]
                        items-center
                        "
            >
                <FloatingBar onCategoryPress={setCurrentCategory} />
            </View>

            <View className=" ml-[60px] mr-[0px] mt-[20px] mb-[0px]">
                <View className=" bg-white  rounded-tl-[30px] p-4   ">
                    <FlatList
                        className="rounded-[14px]"
                        data={filteredNotes}
                        keyExtractor={(item) => item.id}
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
                                            {item.category}
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

            <FloatingMenu />
        </View>
    );
}

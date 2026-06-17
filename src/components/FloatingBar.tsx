import { Folder, NotebookPen } from "lucide-react-native";
import { useState } from "react";
import { Image, Pressable, ScrollView, Text, View } from "react-native";
import { GestureDetector } from "react-native-gesture-handler";
import Animated from "react-native-reanimated";
import { Category, iconMap, noteCategories } from "../data/categories";
import { pulse } from "../hooks/animations";
import { useDebounceNavigation } from "../hooks/useDebounceNavigation"; // 引入防抖导航函数
import { useLongPressButton } from "../hooks/useLongPressButton";
import AddNoteClass from "./addNoteClass";


type FloatingBarProps = {
    onCategoryPress: (category: string) => void;
};
export default function FloatingBar({ onCategoryPress }: FloatingBarProps) {
    const [selectedId, setSelectedId] = useState("all");
    const [NoteClassMenu, setNoteClassMenu] = useState(false);
    const { gesture: longPress, animatedStyle } = useLongPressButton("/user");
    const handlePress = (id: string) => {
        if (id === selectedId) return;
        setSelectedId(id);
        onCategoryPress(id);
    };
    const onNavigate = useDebounceNavigation(); // 引入防抖导航函数
    const [categories, setCategories] = useState(noteCategories);
    const handleAddCategory = (newCategory: Category) => {
        console.log("收到新分类:", newCategory);
        setCategories((prev) => {
            console.log("更新前数量:", prev.length);
            return [...prev, newCategory];
        });
    };
    const [longPressVisible, setLongPressVisible] = useState<Category | null>(null);
    const [categoryModalVisible, setCategoryModalVisible] = useState(false);

    return (
        <View className="flex-col justify-center">
            <View className="w-[50px]">
                <Animated.View style={animatedStyle}>
                    <GestureDetector gesture={longPress}>
                        <Pressable
                            className="w-[50px] h-[50px] mb-[10px]"
                            onPress={() => onNavigate("/user")}
                        >
                            <Image
                                style={{
                                    width: "100%",
                                    height: "100%",
                                    borderRadius: 12,
                                }}
                                className="border-[2px] border-[#36A5FF] "
                                source={require("../data/profilephoto.png")}
                            />
                        </Pressable>
                    </GestureDetector>
                </Animated.View>
                <View className="h-[2px] bg-gray-300 my-[7px] w-[40px] mx-[auto]"></View>
                <ScrollView
                    style={{ maxHeight: 560 }}
                    showsVerticalScrollIndicator={true}
                >
                    {categories.map((item) => {
                        const isActive = selectedId === item.id;
                        const IconComponent = iconMap[item.icon as keyof typeof iconMap] || Folder;
                        return (
                            <Pressable
                                key={item.id}
                                onLongPress={() => {
                                    setLongPressVisible(item);
                                    setCategoryModalVisible(true);
                                }}
                                delayLongPress={400}
                                className={`
                        w-[50px] h-[60px]
                        rounded-[12px]
                        justify-center
                        items-center
                        padding-[4px]
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
                                        <IconComponent size={30} color="#37a5ffff" />
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

                <Pressable
                    className="w-[48px] h-[48px] justify-center items-center bg-[rgb(220,220,220)] rounded-full m-[2px]"
                    onPress={() => setNoteClassMenu(true)}
                >
                    <NotebookPen size={22} color="#0000006e" />
                </Pressable>

                <AddNoteClass
                    visible={NoteClassMenu}
                    onClose={() => setNoteClassMenu(false)}
                    onAdd={handleAddCategory}
                />
                <View className="h-[2px] bg-gray-300  w-[40px] mx-[auto]"></View>
            </View>
        </View>
    );
}

import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { noteCategories } from "../data/categories";

type FloatingBarProps = {
    onCategoryPress: (category: string) => void;
};
export default function FloatingBar({ onCategoryPress }: FloatingBarProps) {
    const [selectedId, setSelectedId] = useState("all");
    const handlePress = (id: string) => {
        if (id === selectedId) return;
        setSelectedId(id);
        onCategoryPress(id);
    };
    return (
        <View
            className="
                        bg-[rgb(236,237,239)]
                        h-[100%]
                        absolute 
                        top-[0px] left-[0px] 
                        rounded-[18px] 
                        items-center py-[20px] px-[5px] gap-[6px]"
        >
            {noteCategories.map((item) => {
                const isActive = selectedId === item.id;
                const Icon = item.icon;
                return (
                    <Pressable
                        key={item.id}
                        className={`
                        w-[50px] h-[50px] 
                        rounded-[12px] 
                        justify-center 
                        items-center 
                        padding-[4px]
                        ${isActive ? ` bg-[#b9daf4]` : `bg-[rgb(236,237,239)]`}`}
                        onPress={() => handlePress(item.id)}
                    >
                        <Icon
                            size={24}
                            color={isActive ? `#37a5ffff` : `#666`}
                        />
                        <Text
                            className={`text-[10px] ${isActive ? "text-blue-500 font-semibold" : "text-gray-400"}`}
                        >
                            {item.name}
                        </Text>
                    </Pressable>
                );
            })}
        </View>
    );
}

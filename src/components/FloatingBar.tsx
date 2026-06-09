import { router } from 'expo-router';
import { NotebookPen } from 'lucide-react-native';
import { useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { noteCategories } from '../data/categories';
import AddNoteClass from './addNoteClass';

type FloatingBarProps = {
    onCategoryPress: (category: string) => void;
};
export default function FloatingBar({ onCategoryPress }: FloatingBarProps) {
    const [selectedId, setSelectedId] = useState("all");
    const [NoteClassMenu, setNoteClassMenu] = useState(false);
    const handlePress = (id: string) => {
        if (id === selectedId) return;
        setSelectedId(id);
        onCategoryPress(id);
    };
    return (
        <>
        <View className="
                        bg-[rgb(242, 242, 242)]
                        h-auto
                        absolute
                        top-[0px] left-[0px]
                        rounded-[18px]
                        items-center py-[20px] px-[5px] gap-[6px]"
        >
            <Pressable
                className="w-[50px] h-[50px] mb-[10px]"
                onPress={() => router.push("/user")}
            >
                <Image source={require('../data/profilephoto.png')}
                    className="w-[50px] h-[50px] rounded-[12px]  border-[2px] border-[#36A5FF] "
                />
                <View className="h-[2px] bg-gray-300 my-[7px] w-[40px] mx-[auto]"></View>
            </Pressable>
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
                        ${isActive ? ` bg-[#f2f2f2]` : `bg-[#f2f2f2]`}`}
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

                )
            },
            )};
            <Pressable
                className="w-[48px] h-[48px] justify-center items-center bg-[rgb(220,220,220)] rounded-full"
                onPress={() => setNoteClassMenu(true)}
            >
                <NotebookPen size={22} color="#0000006e" />
            </Pressable>
            <View className="h-[2px] bg-gray-300 my-[2px] w-[40px] mx-[auto]"></View>
        </View>

        <AddNoteClass
            visible={NoteClassMenu}
            onClose={() => setNoteClassMenu(false)}
        />
        </>
    );
}

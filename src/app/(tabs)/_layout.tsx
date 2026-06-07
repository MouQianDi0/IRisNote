import { Tabs } from "expo-router";
import {
    ClipboardPenLine,
    Notebook,
    SquareCheckBig,
    Sticker,
} from "lucide-react-native";

export default function DrawerLayout() {
    return (
        <Tabs tabBar={() => null} screenOptions={{ headerShown: false }}>
            <Tabs.Screen
                name="note"
                options={{
                    title: "笔记",
                    tabBarIcon: () => (
                        <>
                            <Notebook size={24} color="#000000ff" />
                        </>
                    ),
                }}
            />
            <Tabs.Screen
                name="todo"
                options={{
                    title: "待办",
                    tabBarIcon: () => (
                        <>
                            <SquareCheckBig size={24} color="#000000ff" />
                        </>
                    ),
                }}
            />
            <Tabs.Screen
                name="user"
                options={{
                    title: "我的",
                    tabBarIcon: () => (
                        <>
                            <Sticker size={24} color="#000000ff" />
                        </>
                    ),
                }}
            />
            <Tabs.Screen
                name="excerpt"
                options={{
                    title: "剪贴板摘录",
                    tabBarIcon: () => (
                        <>
                            <ClipboardPenLine size={24} color="#000000ff" />
                        </>
                    ),
                }}
            />
        </Tabs>
    );
}

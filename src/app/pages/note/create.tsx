// ============================================
// 导入 React
// ============================================
import { useEffect, useState } from "react";

// ============================================
// 导入 React Native 组件
// ============================================
import {
    ActivityIndicator,
    Alert,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";

// ============================================
// 导入导航方法
// ============================================
import { router } from "expo-router";

// ============================================
// 导入 API
// ============================================
import { getApiErrorMessage } from "@/api/errors";
import { createNote, type CreateNotePayload } from "@/api/notes";
import {
    ALL_CATEGORY,
    getCurrentCategoryId,
    getCurrentCategoryName,
    onCategoriesChanged,
} from "@/data/categories";
import { notifyNotesChanged } from "@/data/notes";
import { colors } from "@/theme";

// ============================================
// 导入图标库
// ============================================
import { ArrowLeft, Check } from "lucide-react-native";

// ============================================
// 定义创建笔记页面组件
// ============================================
export default function CreateNote() {
    const [title, setTitle] = useState("");
    const [content, setContent] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [categoryName, setCategoryName] = useState(getCurrentCategoryName);
    const [categoryId, setCategoryId] = useState(getCurrentCategoryId);

    useEffect(() => {
        const unsub = onCategoriesChanged(() => {
            setCategoryName(getCurrentCategoryName());
            setCategoryId(getCurrentCategoryId());
        });
        return unsub;
    }, []); // 监听分类变化

    const handleSave = async () => {
        if (!title.trim()) {
            Alert.alert("提示", "请输入笔记标题");
            return;
        }
        if (!content.trim()) {
            Alert.alert("提示", "请输入笔记内容");
            return;
        }

        setSubmitting(true);
        try {
            const categoryIdCurrent = getCurrentCategoryId();
            const body: CreateNotePayload = {
                title: title.trim(),
                content: content.trim(),
            };
            if (categoryIdCurrent !== ALL_CATEGORY.id) {
                body.category_id = categoryIdCurrent;
            }
            await createNote(body);
            notifyNotesChanged();
            router.back();
        } catch (err: unknown) {
            Alert.alert(
                "提示",
                getApiErrorMessage(err, "保存失败，请稍后再试"),
            );
        } finally {
            setSubmitting(false);
        }
    };

    // 返回 JSX 结构
    return (
        // 最外层容器
        <View className="flex-1 bg-white">
            {/* 顶部导航栏 */}
            <View className="flex-row items-center justify-between border-b border-border-soft px-[15px] pb-[15px]">
                {/* 返回按钮 */}
                <TouchableOpacity
                    onPress={() => router.back()} // 点击返回上一页
                    className="p-[10px]"
                >
                    {/* 返回图标 */}
                    <ArrowLeft size={24} color={colors.textPrimary} />
                </TouchableOpacity>

                {/* 页面标题 */}
                <Text className="text-lg font-bold">新建笔记</Text>

                {/* 保存按钮 */}
                <TouchableOpacity
                    onPress={handleSave}
                    disabled={submitting}
                    className="p-[10px]"
                >
                    {submitting ? (
                        <ActivityIndicator
                            size="small"
                            color={colors.primary}
                        />
                    ) : (
                        <Check size={24} color={colors.primary} />
                    )}
                </TouchableOpacity>
            </View>
            {/* 当前分类提示 */}
            {categoryId !== ALL_CATEGORY.id && (
                <View className="px-5 pb-2">
                    <Text className="text-sm text-primary">
                        分类：{categoryName}
                    </Text>
                </View>
            )}

            {/* 笔记标题输入框 */}
            <TextInput
                className="border-b border-border-soft px-5 py-[15px] text-2xl font-bold"
                placeholder="输入标题..." // 提示文字
                value={title} // 绑定 title 状态
                onChangeText={setTitle} // 输入变化时更新 title
            />
            {/* 笔记内容输入框 */}
            <TextInput
                className="flex-1 px-5 py-[15px] text-base"
                placeholder="输入笔记内容..." // 提示文字
                value={content} // 绑定 content 状态
                onChangeText={setContent} // 输入变化时更新 content
                multiline={true} // 允许多行输入
                textAlignVertical="top" // 文字从顶部开始
            />
        </View>
    );
}

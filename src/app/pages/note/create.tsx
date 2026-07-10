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
    StyleSheet,
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

    console.log(categoryName);
    useEffect(() => {
        const unsub = onCategoriesChanged(() => {
            setCategoryName(getCurrentCategoryName());
            setCategoryId(getCurrentCategoryId());
        });
        return unsub;
    }, []);

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
            Alert.alert("提示", getApiErrorMessage(err, "保存失败，请稍后再试"));
        } finally {
            setSubmitting(false);
        }
    };

    // 返回 JSX 结构
    return (
        // 最外层容器
        <View style={styles.container}>
            {/* 顶部导航栏 */}
            <View style={styles.header}>
                {/* 返回按钮 */}
                <TouchableOpacity
                    onPress={() => router.back()} // 点击返回上一页
                    style={styles.headerButton}
                >
                    {/* 返回图标 */}
                    <ArrowLeft size={24} color="#000" />
                </TouchableOpacity>

                {/* 页面标题 */}
                <Text style={styles.headerTitle}>新建笔记</Text>

                {/* 保存按钮 */}
                <TouchableOpacity
                    onPress={handleSave}
                    disabled={submitting}
                    style={styles.headerButton}
                >
                    {submitting ? (
                        <ActivityIndicator size="small" color="#007AFF" />
                    ) : (
                        <Check size={24} color="#007AFF" />
                    )}
                </TouchableOpacity>
            </View>
            {/* 当前分类提示 */}
            {categoryId !== ALL_CATEGORY.id && (
                <View className="px-5 pb-2">
                    <Text className="text-sm text-[#007AFF]">
                        分类：{categoryName}
                    </Text>
                </View>
            )}

            {/* 笔记标题输入框 */}
            <TextInput
                style={styles.titleInput} // 标题输入框样式
                placeholder="输入标题..." // 提示文字
                value={title} // 绑定 title 状态
                onChangeText={setTitle} // 输入变化时更新 title
            />
            {/* 笔记内容输入框 */}
            <TextInput
                style={styles.contentInput} // 内容输入框样式
                placeholder="输入笔记内容..." // 提示文字
                value={content} // 绑定 content 状态
                onChangeText={setContent} // 输入变化时更新 content
                multiline={true} // 允许多行输入
                textAlignVertical="top" // 文字从顶部开始
            />
        </View>
    );
}

// ============================================
// 定义样式
// ============================================
const styles = StyleSheet.create({
    // 最外层容器
    container: {
        flex: 1, // 占满整个屏幕
        backgroundColor: "#fff", // 白色背景
    },

    // 顶部导航栏
    header: {
        flexDirection: "row", // 水平排列
        justifyContent: "space-between", // 两端对齐
        alignItems: "center", // 垂直居中
        paddingHorizontal: 15, // 水平内边距  // 上边距（避开状态栏）
        paddingBottom: 15, // 下边距
        borderBottomWidth: 1, // 底部边框
        borderBottomColor: "#eee", // 边框颜色
    },

    // 头部按钮
    headerButton: {
        padding: 10, // 内边距
    },

    // 头部标题
    headerTitle: {
        fontSize: 18, // 字体大小
        fontWeight: "bold", // 加粗
    },

    // 标题输入框
    titleInput: {
        fontSize: 24, // 字体大小
        fontWeight: "bold", // 加粗
        paddingHorizontal: 20, // 水平内边距
        paddingVertical: 15, // 垂直内边距
        borderBottomWidth: 1, // 底部边框
        borderBottomColor: "#eee", // 边框颜色
    },

    // 内容输入框
    contentInput: {
        flex: 1, // 占满剩余空间
        fontSize: 16, // 字体大小
        paddingHorizontal: 20, // 水平内边距
        paddingVertical: 15, // 垂直内边距
    },
});

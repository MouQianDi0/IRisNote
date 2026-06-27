// ============================================
// 导入 React 注意 这只是演示 并非实际功能
// ============================================

// ============================================
// 导入 React Native 组件
// ============================================
import { StyleSheet, Text, View } from "react-native";
import Animated, { useSharedValue } from "react-native-reanimated";

// ============================================
// 定义待办页面组件
// ============================================
export default function copyExcerpt() {
    const isMenuOpen = useSharedValue(false);
    // 返回 JSX 结构
    return (
        <View style={{ flex: 1 }}>
            {/*  最外层容器（居中显示） */}
            <Animated.View style={styles.container}>
                {/* 标题 */}
                <Text style={styles.title}>剪贴板摘录</Text>

                {/* 提示文字 */}
                <Text style={styles.subtitle}>这里是你的剪贴板摘录</Text>

                {/* 提示用户可以添加待办 */}
                <Text style={styles.hint}>点击 + 按钮添加新摘录内容</Text>
            </Animated.View>
        </View>
    );
}

// ============================================
// 定义样式
// ============================================
const styles = StyleSheet.create({
    // 容器样式
    container: {
        flex: 1, // 占满整个屏幕
        justifyContent: "center", // 垂直居中
        alignItems: "center", // 水平居中
        backgroundColor: "#f5f5f5", // 浅灰色背景
    },

    // 标题样式
    title: {
        fontSize: 24, // 字体大小
        fontWeight: "bold", // 加粗
        marginBottom: 10, // 下边距
    },

    // 副标题样式
    subtitle: {
        fontSize: 16, // 字体大小
        color: "#666", // 灰色文字
        marginBottom: 20, // 下边距
    },

    // 提示文字样式
    hint: {
        fontSize: 14, // 字体大小
        color: "#999", // 浅灰色文字
    },
});

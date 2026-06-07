// ============================================
// 导入 React
// ============================================

// ============================================
// 导入 React Native 组件
// ============================================
import { StyleSheet, Text, View } from "react-native";

// ============================================
// 导入悬浮菜单组件
// ============================================
import FloatingMenu from "../FloatingMenu";

// ============================================
// 定义用户页面组件
// ============================================
export default function User() {
    // 返回 JSX 结构
    return (
        // 最外层容器（居中显示）
        <View style={styles.container}>
            {/* 标题 */}
            <Text style={styles.title}>我的</Text>

            {/* 提示文字 */}
            <Text style={styles.subtitle}>这里是你的个人中心</Text>

            {/* 用户头像占位 */}
            <View style={styles.avatar}>
                <Text style={styles.avatarText}>👤</Text>
            </View>

            {/* 用户信息占位 */}
            <Text style={styles.username}>用户名</Text>
            <Text style={styles.email}>user@example.com</Text>

            {/* 悬浮菜单 */}
            <FloatingMenu />
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
        marginBottom: 30, // 下边距
    },

    // 头像样式
    avatar: {
        width: 100, // 宽度
        height: 100, // 高度
        borderRadius: 50, // 圆形
        backgroundColor: "#E3F2FD", // 浅蓝色背景
        justifyContent: "center", // 垂直居中
        alignItems: "center", // 水平居中
        marginBottom: 20, // 下边距
    },

    // 头像文字
    avatarText: {
        fontSize: 50, // 字体大小
    },

    // 用户名样式
    username: {
        fontSize: 20, // 字体大小
        fontWeight: "bold", // 加粗
        marginBottom: 5, // 下边距
    },

    // 邮箱样式
    email: {
        fontSize: 14, // 字体大小
        color: "#666", // 灰色文字
    },
});

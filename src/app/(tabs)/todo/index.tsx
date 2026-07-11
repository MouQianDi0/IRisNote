// ============================================
// 导入 React
// ============================================

// ============================================
// 导入 React Native 组件
// ============================================
import { Screen } from "@/shared/ui";
import { Text } from "react-native";

// ============================================
// 定义待办页面组件
// ============================================
export default function Todo() {
    // 返回 JSX 结构
    return (
        // 最外层容器（居中显示）
        <Screen variant="centeredMuted">
            {/* 标题 */}
            <Text className="mb-[10px] text-2xl font-bold">待办事项</Text>

            {/* 提示文字 */}
            <Text className="mb-5 text-base text-text-secondary">
                这里是你的待办清单
            </Text>

            {/* 提示用户可以添加待办 */}
            <Text className="text-sm text-text-muted">
                点击 + 按钮添加新待办
            </Text>
        </Screen>
    );
}

// ============================================
// 导入 React 注意 这只是演示 并非实际功能
// ============================================

// ============================================
// 导入 React Native 组件
// ============================================
import { Text, View } from "react-native";
import Animated, { useSharedValue } from "react-native-reanimated";

// ============================================
// 定义待办页面组件
// ============================================
export default function copyExcerpt() {
    const isMenuOpen = useSharedValue(false);
    // 返回 JSX 结构
    return (
        <View className="flex-1">
            {/*  最外层容器（居中显示） */}
            <Animated.View className="flex-1 items-center justify-center bg-surface-muted">
                {/* 标题 */}
                <Text className="mb-[10px] text-2xl font-bold">剪贴板摘录</Text>

                {/* 提示文字 */}
                <Text className="mb-5 text-base text-text-secondary">
                    这里是你的剪贴板摘录
                </Text>

                {/* 提示用户可以添加待办 */}
                <Text className="text-sm text-text-muted">
                    点击 + 按钮添加新摘录内容
                </Text>
            </Animated.View>
        </View>
    );
}

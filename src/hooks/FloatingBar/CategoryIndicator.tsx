import { useEffect } from "react";
import { View } from "react-native";
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming, } from "react-native-reanimated";

type Props = {
    isActive: boolean;
    isPinned: boolean;
    isStarred: boolean;
};

export default function CategoryIndicator({ isActive, isPinned, isStarred, }: Props) {
    const breathingGlow = useSharedValue(0.7);
    useEffect(() => {
        if (isActive) {
            breathingGlow.value = withRepeat(
                withSequence(
                    withTiming(1.0, { duration: 750 }),
                    withTiming(0.5, { duration: 750 })
                ), -1, true);
        }
        return () => {
            cancelAnimation(breathingGlow);
        };
    }, [isActive]);
    const glowStyle = useAnimatedStyle(() => ({
        shadowOpacity: breathingGlow.value,
    }));
    return (
        <View className="w-[3px]">
            {isActive && (<Animated.View
                className="absolute w-[2px] h-[10px] bg-[#4CAF50] rounded-full"
                style={[
                    glowStyle,
                    {
                        shadowColor: "#4CAF50",
                        shadowOffset: { width: 0, height: 0 },
                        shadowRadius: 4,
                        elevation: 4
                    }
                ]}
            />)}
            {isPinned && isStarred && !isActive && (<Animated.View
                className="absolute w-[2px] h-[10px] rounded-full overflow-hidden"
                style={{
                    shadowColor: "#37A5FF",
                }}
            />)}{ }{ }
        </View>
    );
}
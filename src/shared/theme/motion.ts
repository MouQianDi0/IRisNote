import { CSSAnimationKeyframes, Easing } from "react-native-reanimated";

/** Shared motion tokens for React Native Reanimated styles. */

export const buttonEasing = Easing.bezier(0.31, 0.04, 0.03, 1.04);

export const pulse: CSSAnimationKeyframes = {
    from: {
        opacity: 0.5,
        transform: [{ scale: 0.6 }],
    },
    to: {
        opacity: 1,
        transform: [{ scale: 1 }],
    },
};

export const shake: CSSAnimationKeyframes = {
    "0%": { transform: [{ rotate: "0deg" }] },
    "85%": { transform: [{ rotate: "0deg" }] },
    "87%": { transform: [{ rotate: "-9deg" }] },
    "91%": { transform: [{ rotate: "9deg" }] },
    "95%": { transform: [{ rotate: "-5deg" }] },
    "98%": { transform: [{ rotate: "5deg" }] },
    "100%": { transform: [{ rotate: "0deg" }] },
};

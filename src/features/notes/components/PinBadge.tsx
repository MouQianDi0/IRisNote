import type { StyleProp, ViewStyle } from "react-native";
import Svg, { Path } from "react-native-svg";
import { colors } from "@/shared/theme";

type PinBadgeProps = {
  size?: number;
  color?: string;
  style?: StyleProp<ViewStyle>;
};

const shadowPath =
  "M14.24 2.34C14.88 1.7 15.92 1.7 16.56 2.34L23.66 9.44C24.3 10.08 24.3 11.12 23.66 11.76L21.42 14C20.88 14.54 20.05 14.63 19.41 14.25L17.26 16.4C17.75 17.76 17.45 19.34 16.34 20.45L15.24 21.55C14.6 22.19 13.56 22.19 12.92 21.55L9.96 18.59L5.56 23C5.12 23.44 4.39 23.44 3.95 23C3.51 22.56 3.51 21.84 3.95 21.39L8.35 16.99L5.45 14.09C4.81 13.45 4.81 12.41 5.45 11.77L6.55 10.67C7.66 9.56 9.24 9.26 10.6 9.75L12.75 7.6C12.37 6.96 12.46 6.12 13 5.59L14.24 2.34Z";
const outlinePath =
  "M13.4 1.4C14.04 0.76 15.08 0.76 15.72 1.4L22.6 8.28C23.24 8.92 23.24 9.96 22.6 10.6L20.42 12.78C19.88 13.32 19.05 13.41 18.41 13.03L16.3 15.14C16.78 16.48 16.48 18.03 15.39 19.12L14.32 20.19C13.68 20.83 12.64 20.83 12 20.19L9.14 17.33L4.72 21.75C4.28 22.19 3.56 22.19 3.11 21.75C2.67 21.31 2.67 20.59 3.11 20.14L7.53 15.72L4.74 12.93C4.1 12.29 4.1 11.25 4.74 10.61L5.81 9.54C6.9 8.45 8.45 8.15 9.79 8.63L11.9 6.52C11.52 5.88 11.61 5.04 12.15 4.5L13.4 1.4Z";
const mainPath =
  "M14.85 3.15C15.12 2.88 15.55 2.88 15.82 3.15L20.85 8.18C21.12 8.45 21.12 8.88 20.85 9.15L19.5 10.5C19.27 10.73 18.92 10.77 18.65 10.61L15.12 14.14C15.56 15.09 15.39 16.25 14.61 17.03L13.5 18.14L6.86 11.5L7.97 10.39C8.75 9.61 9.91 9.44 10.86 9.88L14.39 6.35C14.23 6.08 14.27 5.73 14.5 5.5L14.85 3.15Z";

export default function PinBadge({
  size = 18,
  color = colors.pin,
  style,
}: PinBadgeProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 26 26" style={style}>
      <Path
        d={shadowPath}
        fill={colors.shadow}
        transform="translate(1.3 1.3)"
      />
      <Path d={outlinePath} fill={colors.surfaceFull} />
      <Path d={mainPath} fill={color} />
    </Svg>
  );
}

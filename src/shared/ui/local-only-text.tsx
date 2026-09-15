import { Text } from "react-native";

/** 保留纯文本通知接口，只在展示层强调存储范围。 */
export function LocalOnlyText({ children }: { children: string }) {
    return <>{children.split(/(仅本机)/).map((part, index) => part === "仅本机"
        ? <Text key={index} style={{ fontWeight: "700" }}>{part}</Text> : part)}</>;
}

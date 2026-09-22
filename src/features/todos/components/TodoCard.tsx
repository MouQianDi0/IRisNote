import { Bell, Check, Clock, Star } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";
import { colors, semanticColors } from "@/shared/theme";
import type { TodoEntity } from "../todos.types";
import {
    todoDisplayState,
    todoTitle,
    todoTimeLabel,
} from "../domain/todo-state";
import { todoColors } from "../todo-colors";

function CheckCircle({ checked, color }: { checked: boolean; color: string }) {
    return (
        <View
            style={{
                width: 24,
                height: 24,
                borderRadius: 12,
                borderWidth: 2,
                borderColor: color,
                backgroundColor: checked ? color : "transparent",
                alignItems: "center",
                justifyContent: "center",
            }}
        >
            {checked && (
                <Check size={14} color={semanticColors.onBrandPrimary} />
            )}
        </View>
    );
}

export function TodoCard({
    todo,
    now,
    batch,
    selected,
    onPress,
    onLongPress,
    onComplete,
}: {
    todo: TodoEntity;
    now: Date;
    batch: boolean;
    selected: boolean;
    onPress: () => void;
    onLongPress: () => void;
    onComplete: () => void;
}) {
    const state = todoDisplayState(todo, now);
    const pair = todoColors[state];
    const titleColor =
        state === "ended" ? colors.textMuted : semanticColors.textPrimary;
    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${todoTitle(todo)}，${todoTimeLabel(todo)}${todo.isCompleted ? "，已完成" : ""}${todo.isStarred ? "，已标星" : ""}${todo.isPinned ? "，已置顶" : ""}`}
            accessibilityState={{ selected: batch && selected }}
            onPress={onPress}
            onLongPress={onLongPress}
            delayLongPress={450}
            style={({ pressed }) => ({
                width: "100%",
                maxWidth: 400,
                alignSelf: "center",
                borderRadius: 16,
                borderCurve: "continuous",
                overflow: "hidden",
                backgroundColor: pair.surface,
                paddingLeft: 22,
                paddingRight: 10,
                paddingVertical: 8,
                opacity: pressed ? 0.85 : 1,
            })}
        >
            <View
                pointerEvents="none"
                style={{
                    position: "absolute",
                    left: 6,
                    top: 2,
                    bottom: 2,
                    width: 4,
                    borderRadius: 2,
                    backgroundColor: pair.accent,
                }}
            />
            <View
                style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
            >
                {batch && (
                    <CheckCircle
                        checked={selected}
                        color={
                            selected
                                ? semanticColors.brandPrimary
                                : semanticColors.borderDefault
                        }
                    />
                )}
                <View style={{ flex: 1, minWidth: 0 }}>
                    <View
                        style={{
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 4,
                        }}
                    >
                        {todo.isStarred && (
                            <Star
                                size={12}
                                color={colors.starBadge}
                                fill={colors.starBadge}
                            />
                        )}
                        <Text
                            numberOfLines={1}
                            style={{
                                fontSize: 17,
                                color: titleColor,
                                textDecorationLine:
                                    state === "ended" ? "line-through" : "none",
                                flexShrink: 1,
                            }}
                        >
                            {todoTitle(todo)}
                        </Text>
                    </View>
                    <View
                        style={{
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 4,
                            marginTop: 4,
                            opacity: 0.55,
                        }}
                    >
                        <Clock size={14} color={titleColor} />
                        <Text
                            numberOfLines={1}
                            style={{
                                fontSize: 13,
                                color: titleColor,
                                flexShrink: 1,
                            }}
                        >
                            {todoTimeLabel(todo)}
                        </Text>
                    </View>
                </View>
                {todo.startTime !== null && (
                    <Bell size={18} color={titleColor} opacity={0.55} />
                )}
                <Pressable
                    accessibilityRole="checkbox"
                    accessibilityLabel={`完成待办，${todoTitle(todo)}`}
                    accessibilityState={{
                        checked: todo.isCompleted,
                        disabled: batch,
                    }}
                    disabled={batch}
                    onPress={(event) => {
                        event.stopPropagation();
                        onComplete();
                    }}
                    hitSlop={10}
                    style={{ width: 24, height: 24 }}
                >
                    <CheckCircle
                        checked={todo.isCompleted}
                        color={pair.accent}
                    />
                </Pressable>
            </View>
        </Pressable>
    );
}

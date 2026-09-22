import { useCallback, useState } from "react";
import { AppState } from "react-native";
import { useFocusEffect } from "expo-router";
import { nextTodoRefresh } from "../domain/todo-state";
import type { TodoEntity } from "../todos.types";

export function useTodoClock(todos: readonly TodoEntity[]): Date {
    const [now, setNow] = useState(() => new Date());
    useFocusEffect(
        useCallback(() => {
            let active = true;
            let timer: ReturnType<typeof setTimeout> | undefined;
            const refresh = () => {
                if (timer) clearTimeout(timer);
                if (!active || AppState.currentState !== "active") return;
                const instant = new Date();
                setNow(instant);
                timer = setTimeout(refresh, nextTodoRefresh(todos, instant));
            };
            refresh();
            const subscription = AppState.addEventListener(
                "change",
                (state) => {
                    if (timer) clearTimeout(timer);
                    if (state === "active") refresh();
                },
            );
            return () => {
                active = false;
                if (timer) clearTimeout(timer);
                subscription.remove();
            };
        }, [todos]),
    );
    return now;
}

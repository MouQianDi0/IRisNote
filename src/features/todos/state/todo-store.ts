import { create } from "zustand";
import type { ApplicationDatabase } from "@/core/database/database.types";
import { banner } from "@/core/notifications";
import { TodoLocalRepository } from "../data/todo-local.repository";
import { seedTodoPreview } from "../testing/todo-seeds";
import type { TodoEntity } from "../todos.types";

export const todoRepository = new TodoLocalRepository();
type TodoStore = {
  ready: boolean;
  ownerKey: string | null;
  generation: number;
  entities: readonly TodoEntity[];
  selectedDateId: string | null;
};
export const useTodoStore = create<TodoStore>(() => ({
  ready: false,
  ownerKey: null,
  generation: 0,
  entities: [],
  selectedDateId: null,
}));
todoRepository.subscribe(() => {
  const ownerKey = todoRepository.ownerKey;
  const switched = useTodoStore.getState().ownerKey !== ownerKey;
  useTodoStore.setState({
    ready: todoRepository.ready,
    ownerKey,
    generation: todoRepository.generation,
    entities: ownerKey ? todoRepository.list(ownerKey) : [],
    ...(switched ? { selectedDateId: null } : {}),
  });
});

export function selectTodoDate(ownerKey: string, dateId: string) {
  if (todoRepository.ownerKey === ownerKey)
    useTodoStore.setState({ selectedDateId: dateId });
}

let activation: {
  ownerKey: string;
  database: ApplicationDatabase;
  pending: Promise<void>;
} | null = null;

export function activateTodoOwner(
  ownerKey: string,
  database: ApplicationDatabase,
): Promise<void> {
  if (activation?.ownerKey === ownerKey && activation.database === database)
    return activation.pending;
  const loading = todoRepository.activate(ownerKey, database);
  const generation = todoRepository.generation;
  const pending = loading
    .then(async () => {
      if (
        __DEV__ &&
        process.env.EXPO_PUBLIC_TODO_PREVIEW === "1" &&
        ownerKey.startsWith("preview:")
      )
        await seedTodoPreview(todoRepository, ownerKey, new Date());
    })
    .catch((cause: unknown) => {
      if (
        todoRepository.ownerKey !== ownerKey ||
        todoRepository.generation !== generation
      )
        return;
      banner.show({
        title: "待办加载失败",
        message: cause instanceof Error ? cause.message : "请重试",
        type: "important",
        action: {
          label: "重试",
          onPress: () => {
            if (
              todoRepository.ownerKey === ownerKey &&
              todoRepository.generation === generation
            )
              return activateTodoOwner(ownerKey, database);
          },
        },
      });
    })
    .finally(() => {
      if (activation?.pending === pending) activation = null;
    });
  activation = { ownerKey, database, pending };
  return pending;
}

export function deactivateTodoOwner() {
  activation = null;
  todoRepository.deactivate();
}

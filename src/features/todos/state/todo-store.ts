import { create } from "zustand";
import { TodoMemoryRepository } from "../data/todo-memory.repository";
import { seedTodoPreview } from "../testing/todo-seeds";
import type { TodoEntity } from "../todos.types";

export const todoRepository = new TodoMemoryRepository();
type TodoStore = {
  ownerKey: string | null;
  generation: number;
  entities: readonly TodoEntity[];
  selectedDateId: string | null;
};
export const useTodoStore = create<TodoStore>(() => ({
  ownerKey: null,
  generation: 0,
  entities: [],
  selectedDateId: null,
}));
todoRepository.subscribe(() => {
  const ownerKey = todoRepository.ownerKey;
  const switched = useTodoStore.getState().ownerKey !== ownerKey;
  useTodoStore.setState({
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

export function activateTodoOwner(ownerKey: string) {
  if (todoRepository.ownerKey === ownerKey) return;
  todoRepository.activate(ownerKey);
  if (
    __DEV__ &&
    process.env.EXPO_PUBLIC_TODO_PREVIEW === "1" &&
    ownerKey.startsWith("preview:")
  )
    seedTodoPreview(todoRepository, ownerKey, new Date());
}

import { useEffect, useRef, useState } from "react";
import { banner } from "@/core/notifications";
import { useSystemNotifications } from "@/core/system-notifications/system-notification-provider";
import { todoRepository } from "../state/todo-store";
import {
  emptyTodoFields,
  newTodoId,
  saveTodoForm,
  todoFields,
  assertTodoSession,
  prepareTodoExit,
  deviceTimeZone,
  formPatch,
} from "../services/todo-service";
import {
  TodoError,
  type TodoEntity,
  type TodoFields,
  type TodoFieldErrors,
} from "../todos.types";

export function useTodoForm(
  ownerKey: string,
  generation: number,
  base: TodoEntity | null,
  dateId: string,
  onClose: () => void,
) {
  const { afterSave } = useSystemNotifications();
  const [fields, setFields] = useState(() =>
    base ? todoFields(base) : emptyTodoFields(dateId),
  );
  const [errors, setErrors] = useState<TodoFieldErrors>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const clientId = useRef(base?.clientId ?? newTodoId());
  const saving = useRef(false);
  const createdAt = useRef<Date | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  function change<K extends keyof TodoFields>(key: K, value: TodoFields[K]) {
    if (saving.current) return;
    setFields((previous) => ({
      ...previous,
      [key]: value,
      ...(key === "startTime" && value === null ? { endTime: null } : {}),
    }));
    setErrors({});
    setError("");
  }

  async function save(reason: "confirm" | "dismiss") {
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    setErrors({});
    setError("");
    try {
      // Yield once so controls lock before executing the command; scope is checked after it.
      await Promise.resolve();
      if (!mounted.current) return;
      assertTodoSession(todoRepository, ownerKey, generation);
      const prepared = prepareTodoExit(base, fields, reason);
      if (!prepared) {
        onClose();
        return;
      }
      const candidate =
        base && Object.keys(formPatch(base, prepared)).length === 0
          ? prepared
          : { ...prepared, timeZone: deviceTimeZone() };
      const instant = new Date();
      createdAt.current ??= instant;
      await saveTodoForm(
        todoRepository,
        ownerKey,
        generation,
        clientId.current,
        base,
        candidate,
        base ? instant : createdAt.current,
      );
      assertTodoSession(todoRepository, ownerKey, generation);
      if (mounted.current) onClose();
      // This side effect cannot turn a committed save into a form failure.
      void afterSave(todoRepository.get(ownerKey, clientId.current), reason);
    } catch (cause) {
      if (!mounted.current) return;
      const message =
        cause instanceof Error ? cause.message : "保存失败，请重试";
      if (cause instanceof TodoError && cause.code === "validation")
        setErrors(cause.fields);
      else {
        setError(message);
        if (!(cause instanceof TodoError) || cause.code !== "owner")
          banner.show({ title: "待办保存失败", message, type: "important" });
      }
    } finally {
      saving.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  return {
    fields,
    errors,
    error,
    busy,
    change,
    save,
    reportError: (cause: unknown) =>
      setError(cause instanceof Error ? cause.message : "操作失败，请重试"),
    cancel: () => {
      if (!saving.current) onClose();
    },
  };
}

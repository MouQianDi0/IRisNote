import { useLayoutEffect } from "react";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { newTodoId } from "../services/todo-service";
import { activateTodoOwner, useTodoStore } from "../state/todo-store";

const guestOwnerKey = `guest:${newTodoId()}`;
export function useTodoScope() {
  const { user, isLoggedIn, loading } = useAuth();
  const account = isLoggedIn && user ? `user:${user.id}` : guestOwnerKey;
  const ownerKey =
    __DEV__ && process.env.EXPO_PUBLIC_TODO_PREVIEW === "1"
      ? `preview:${account}`
      : account;
  const snapshot = useTodoStore();
  useLayoutEffect(() => {
    if (!loading) activateTodoOwner(ownerKey);
  }, [loading, ownerKey]);
  return {
    ...snapshot,
    ownerKey,
    ready: !loading && snapshot.ownerKey === ownerKey,
  };
}

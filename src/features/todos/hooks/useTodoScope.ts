import { useLayoutEffect } from "react";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { useApplicationDatabase } from "@/core/database";
import { LOCAL_GUEST_OWNER_KEY } from "../data/todo-local.repository";
import {
  activateTodoOwner,
  deactivateTodoOwner,
  useTodoStore,
} from "../state/todo-store";

export function useTodoScope() {
  const database = useApplicationDatabase();
  const { user, isLoggedIn, loading } = useAuth();
  const account =
    isLoggedIn && user ? `user:${user.id}` : LOCAL_GUEST_OWNER_KEY;
  const ownerKey =
    __DEV__ && process.env.EXPO_PUBLIC_TODO_PREVIEW === "1"
      ? `preview:${account}`
      : account;
  const snapshot = useTodoStore();
  useLayoutEffect(() => {
    if (loading) deactivateTodoOwner();
    else void activateTodoOwner(ownerKey, database);
  }, [loading, ownerKey, database]);
  return {
    ...snapshot,
    ownerKey,
    ready: !loading && snapshot.ready && snapshot.ownerKey === ownerKey,
  };
}

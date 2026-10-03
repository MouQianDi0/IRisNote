import {
    useEffect,
    useLayoutEffect,
    useRef,
    useSyncExternalStore,
    type PropsWithChildren,
} from "react";
import { useApplicationDatabase } from "@/core/database";
import { useCloudStorage } from "@/core/cloud-storage/cloud-storage-provider";
import {
    createLoginRestoreAccess,
    getCloudStorageSnapshot,
} from "@/core/cloud-storage/cloud-storage-policy";
import { banner, captureNotificationSession } from "@/core/notifications";
import { createNotesSyncTransport } from "@/features/notes/api/notes-sync.api";
import { loadCategories } from "@/features/notes/categories/data/category-cache";
import { notifyCategoriesChanged } from "@/features/notes/categories/categories.events";
import { syncNotes } from "@/features/notes/services/note-sync-coordinator";
import { createTodoTransport } from "@/features/todos/api/todos.api";
import { useTodoScope } from "@/features/todos/hooks/useTodoScope";
import { syncTodos } from "@/features/todos/services/todo-sync.service";
import { todoRepository } from "@/features/todos/state/todo-store";
import { onSessionEnded } from "@/shared/http/session-events";
import { useAuth } from "../hooks/useAuth";
import { loginDataRestore } from "../services/login-data-restore";

const bannerId = "login-data-restore";

export function LoginDataRestoreProvider({ children }: PropsWithChildren) {
    const database = useApplicationDatabase();
    const { user, token, loading } = useAuth();
    const cloud = useCloudStorage();
    const scope = useTodoScope();
    const request = useSyncExternalStore(
        loginDataRestore.subscribe,
        loginDataRestore.getState,
        loginDataRestore.getState,
    );
    const auth = useRef({ owner: user?.id, token });
    useLayoutEffect(() => {
        auth.current = { owner: user?.id, token };
    }, [user?.id, token]);
    useEffect(() => {
        const unsubscribe = onSessionEnded(() => {
            loginDataRestore.cancel();
            banner.dismiss(bannerId);
        });
        return () => {
            unsubscribe();
            loginDataRestore.cancel();
            banner.dismiss(bannerId);
        };
    }, []);

    useEffect(() => {
        if (
            !request ||
            request.phase !== "pending" ||
            loading ||
            !cloud.ready ||
            !cloud.available ||
            !scope.ready ||
            request.owner !== user?.id ||
            request.token !== token ||
            scope.ownerKey !== `user:${request.owner}`
        )
            return;
        const { id, owner, token: loginToken } = request;
        const notificationSession = captureNotificationSession();
        const valid = () =>
            loginDataRestore.getState()?.id === id &&
            auth.current.owner === owner &&
            auth.current.token === loginToken &&
            notificationSession();
        let access: ReturnType<typeof createLoginRestoreAccess>;
        try {
            access = createLoginRestoreAccess(owner);
        } catch {
            return;
        }
        const config = {
            loginRestoreId: access.id,
            headers: { Authorization: `Bearer ${loginToken}` },
            signal: access.signal,
        };
        let taskSignal: AbortSignal | undefined;
        const guard = (signal: AbortSignal) => {
            if (!taskSignal) {
                taskSignal = signal;
                signal.addEventListener("abort", access.release);
            }
            access.assertCurrent();
            if (!valid() || signal.aborted)
                throw new Error("登录数据读取会话已结束");
        };
        banner.dismiss(bannerId);
        banner.show({
            id: bannerId,
            type: "neutral",
            title: "登录成功，正在读取云端数据…",
            progress: { mode: "indeterminate" },
            lifetime: { mode: "until-resolved" },
        });
        const job = loginDataRestore.start(id, {
            categories: async (signal) => {
                const check = () => guard(signal);
                check();
                await loadCategories(database, owner, { config, check });
                check();
                notifyCategoriesChanged();
            },
            notes: async (signal) => {
                const check = () => guard(signal);
                check();
                await syncNotes(database, owner, {
                    transport: createNotesSyncTransport(config),
                    signal: access.signal,
                    check,
                });
            },
            todos: async (signal) => {
                const generation = todoRepository.generation;
                guard(signal);
                await syncTodos({
                    repository: todoRepository,
                    ownerKey: `user:${owner}`,
                    transport: createTodoTransport(
                        owner,
                        loginToken,
                        access.signal,
                        access.id,
                    ),
                    downloadOnly: true,
                    isCurrent: () => {
                        try {
                            guard(signal);
                            return (
                                todoRepository.generation === generation &&
                                todoRepository.ownerKey === `user:${owner}`
                            );
                        } catch {
                            return false;
                        }
                    },
                });
            },
        });
        void job
            .finally(() => {
                taskSignal?.removeEventListener("abort", access.release);
                access.release();
            })
            .then(() => {
                if (!valid()) {
                    // Token replacement may cancel recovery without a full logout event.
                    if (loginDataRestore.getState()?.id === id)
                        banner.dismiss(bannerId);
                    return;
                }
                const done = loginDataRestore.getState()?.phase === "done";
                banner.dismiss(bannerId);
                banner.show(
                    done
                        ? {
                              id: bannerId,
                              type: "success",
                              title: getCloudStorageSnapshot().enabled
                                  ? "云端数据已读取"
                                  : "云端数据已读取，云同步仍未开启",
                          }
                        : {
                              id: bannerId,
                              type: "important",
                              title: "部分云端数据未能读取，本机数据已保留",
                              lifetime: { mode: "persistent" },
                              action: {
                                  label: "重试",
                                  onPress: () => {
                                      if (valid()) loginDataRestore.retry(id);
                                  },
                              },
                          },
                );
            });
    }, [
        request,
        loading,
        cloud.ready,
        cloud.available,
        cloud.generation,
        scope.ready,
        scope.ownerKey,
        user?.id,
        token,
        database,
    ]);

    return children;
}

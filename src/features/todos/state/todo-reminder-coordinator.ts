import {
  TODO_NOTIFICATION_PREFIX,
  type SystemNotificationPort,
} from "@/core/system-notifications/system-notification.types";
import {
  diagnosticErrorCategory,
  opaqueDiagnosticId,
  recordDiagnostic,
} from "@/core/diagnostics";
import type {
  TodoReminderBinding,
  TodoReminderRepository,
} from "../data/todo-reminder.repository";
import {
  desiredTodoReminder,
  reminderSummary,
  todoNotificationIdentifier,
} from "../services/todo-reminder.service";
import type { TodoEntity } from "../todos.types";

export type ReminderSnapshot = {
  ownerKey: string | null;
  ready: boolean;
  generation: number;
  entities: readonly TodoEntity[];
};

/** One serial drain also serializes all (owner, todo) keys. Reads fresh facts after every await. */
export class TodoReminderCoordinator {
  private pending: Promise<void> | null = null;
  private dirty = false;
  private forceReschedule = false;
  constructor(
    private readonly bindings: Pick<
      TodoReminderRepository,
      "list" | "put" | "remove"
    >,
    private readonly notifications: SystemNotificationPort,
    private readonly snapshot: () => ReminderSnapshot,
    private readonly report: (message: string) => void,
    private readonly now = () => Date.now(),
  ) {}

  reconcile(options?: { forceReschedule?: boolean }): Promise<void> {
    this.dirty = true;
    this.forceReschedule ||= options?.forceReschedule === true;
    void recordDiagnostic("todo_reminder", "reconcile_requested", {
      alreadyRunning: !!this.pending,
      forceReschedule: options?.forceReschedule === true,
    });
    if (this.pending) return this.pending;
    const pending = (async () => {
      while (this.dirty) {
        this.dirty = false;
        const forceReschedule = this.forceReschedule;
        this.forceReschedule = false;
        try {
          await this.run(forceReschedule);
        } catch (cause) {
          void recordDiagnostic(
            "todo_reminder",
            "reconcile_failed",
            {
              error: diagnosticErrorCategory(cause),
            },
            "error",
          );
          this.report("系统提醒核对失败，将在下次进入前台时重试");
        }
      }
    })();
    this.pending = pending;
    void pending.then(() => {
      this.pending = null;
    });
    return pending;
  }

  private current(binding: TodoReminderBinding) {
    const current = this.snapshot();
    return current.ready && current.ownerKey === binding.owner_key
      ? current.entities.find((todo) => todo.clientId === binding.todo_id)
      : undefined;
  }

  private async cancel(binding: TodoReminderBinding) {
    const todo = opaqueDiagnosticId(`${binding.owner_key}:${binding.todo_id}`);
    const pending = {
      ...binding,
      state: "cancel" as const,
      updated_at: new Date(this.now()).toISOString(),
    };
    await this.bindings.put(pending);
    try {
      await this.notifications.cancel(binding.notification_id);
      await this.bindings.remove(binding);
      void recordDiagnostic("todo_reminder", "binding_cancelled", { todo });
      return true;
    } catch (cause) {
      await this.bindings.put({ ...pending, last_error: "取消失败，等待重试" });
      this.report("旧提醒取消失败，将在下次进入前台时重试");
      void recordDiagnostic(
        "todo_reminder",
        "binding_cancel_failed",
        {
          todo,
          error: diagnosticErrorCategory(cause),
        },
        "error",
      );
      return false;
    }
  }

  private async run(forceReschedule: boolean) {
    const scheduled = new Set(
      (await this.notifications.scheduled()).map((item) => item.identifier),
    );
    const saved = await this.bindings.list();
    void recordDiagnostic("todo_reminder", "reconcile_snapshot", {
      scheduledCount: scheduled.size,
      bindingCount: saved.length,
    });
    // Recover requests created before a database receipt or left by an older process.
    const bound = new Set(saved.map((item) => item.notification_id));
    for (const identifier of scheduled) {
      if (
        identifier.startsWith(TODO_NOTIFICATION_PREFIX) &&
        !bound.has(identifier)
      ) {
        await this.notifications.cancel(identifier);
        scheduled.delete(identifier);
        void recordDiagnostic("todo_reminder", "orphan_cancelled", {
          notification: opaqueDiagnosticId(identifier),
        });
      }
    }
    const permission = await this.notifications.permission();
    void recordDiagnostic("todo_reminder", "reconcile_permission", {
      granted: permission.granted,
      canAskAgain: permission.canAskAgain,
    });
    const blocked = new Set<string>();
    const retained = new Set<string>();
    const key = (owner: string, id: string) => JSON.stringify([owner, id]);
    for (const binding of saved) {
      const todo = this.current(binding);
      let at: number | null = null;
      try {
        at = todo ? desiredTodoReminder(todo, this.now()) : null;
      } catch {
        /* Recorded below. */
      }
      if (
        !forceReschedule &&
        permission.granted &&
        todo &&
        at !== null &&
        binding.state === "scheduled" &&
        binding.todo_version === todo.localVersion &&
        binding.trigger_at === at &&
        scheduled.has(binding.notification_id)
      ) {
        retained.add(key(binding.owner_key, binding.todo_id));
        void recordDiagnostic("todo_reminder", "binding_retained", {
          todo: opaqueDiagnosticId(`${binding.owner_key}:${binding.todo_id}`),
        });
      } else if (!(await this.cancel(binding)))
        blocked.add(key(binding.owner_key, binding.todo_id));
    }
    const snapshot = this.snapshot();
    if (!snapshot.ready || !snapshot.ownerKey) return;
    for (const todo of snapshot.entities) {
      const identifier = todoNotificationIdentifier(
        todo.ownerKey,
        todo.clientId,
      );
      const todoKey = key(todo.ownerKey, todo.clientId);
      if (blocked.has(todoKey) || retained.has(todoKey)) continue;
      const binding: TodoReminderBinding = {
        owner_key: todo.ownerKey,
        todo_id: todo.clientId,
        notification_id: identifier,
        todo_version: todo.localVersion,
        trigger_at: null,
        state: "schedule",
        last_error: null,
        updated_at: new Date(this.now()).toISOString(),
      };
      if (this.current(binding) !== todo) {
        this.dirty = true;
        continue;
      }
      try {
        const at = desiredTodoReminder(todo, this.now());
        if (at === null) {
          void recordDiagnostic("todo_reminder", "schedule_skipped", {
            todo: opaqueDiagnosticId(`${todo.ownerKey}:${todo.clientId}`),
            reminderEnabled: todo.reminderEnabled,
            completed: todo.isCompleted,
            hasStartTime: !!todo.startTime,
          });
          continue;
        }
        binding.trigger_at = at;
        if (!permission.granted) {
          await this.bindings.put({
            ...binding,
            state: "error",
            last_error: "系统提醒尚未开启",
          });
          void recordDiagnostic(
            "todo_reminder",
            "schedule_blocked",
            {
              todo: opaqueDiagnosticId(`${todo.ownerKey}:${todo.clientId}`),
              reason: "permission",
            },
            "warning",
          );
          continue;
        }
        // Persist an ID before the OS side effect so crashes cannot orphan it.
        await this.bindings.put(binding);
        if (this.current(binding) !== todo || at <= this.now()) {
          this.dirty = true;
          continue;
        }
        const returnedId = await this.notifications.schedule(
          identifier,
          at,
          reminderSummary(todo.body),
          {
            kind: "todo-start",
            ownerKey: todo.ownerKey,
            todoId: todo.clientId,
          },
        );
        binding.notification_id = returnedId;
        await this.bindings.put({ ...binding, state: "scheduled" });
        void recordDiagnostic("todo_reminder", "binding_scheduled", {
          todo: opaqueDiagnosticId(`${todo.ownerKey}:${todo.clientId}`),
          triggerAt: new Date(at).toISOString(),
        });
        if (this.current(binding) !== todo) {
          await this.cancel(binding);
          this.dirty = true;
        }
      } catch (cause) {
        await this.bindings.put({
          ...binding,
          state: "error",
          last_error: "调度失败，等待重试",
        });
        this.report(
          cause instanceof Error && cause.message.includes("时区")
            ? cause.message
            : "待办已保存，系统提醒安排失败，将稍后重试",
        );
        void recordDiagnostic(
          "todo_reminder",
          "binding_schedule_failed",
          {
            todo: opaqueDiagnosticId(`${todo.ownerKey}:${todo.clientId}`),
            error: diagnosticErrorCategory(cause),
          },
          "error",
        );
      }
    }
  }
}

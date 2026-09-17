export type TodoPriority = "low" | "normal" | "high";
export type TodoStatus = "pending" | "inProgress" | "expired" | "completed";
export type TodoDisplayState = TodoPriority | "done" | "ended";
export type TodoFilter = "all" | Exclude<TodoStatus, "completed">;
export type TodoSort = "timeAsc" | "timeDesc" | "priority";

export type TodoFields = {
  body: string;
  priority: TodoPriority;
  dateId: string;
  startTime: string | null;
  endTime: string | null;
  isStarred: boolean;
  isPinned: boolean;
  reminderEnabled: boolean;
  timeZone: string | null;
};

export type TodoEntity = Readonly<
  TodoFields & {
    clientId: string;
    ownerKey: string;
    isCompleted: boolean;
    completedAt: string | null;
    createdAt: string;
    updatedAt: string;
    localVersion: number;
  }
>;

export const todoFormKeys = [
  "body",
  "priority",
  "dateId",
  "startTime",
  "endTime",
  "isStarred",
  "isPinned",
  "reminderEnabled",
  "timeZone",
] as const satisfies readonly (keyof TodoFields)[];

export type TodoFieldErrors = Partial<Record<keyof TodoFields, string>>;
export type TodoQuery = {
  dateId: string;
  filter: TodoFilter;
  keyword: string;
  sort: TodoSort;
};
export type TodoVersionTarget = { clientId: string; localVersion: number };

export class TodoError extends Error {
  constructor(
    public readonly code:
      "validation" | "owner" | "missing" | "conflict" | "duplicate",
    message: string,
    public readonly fields: TodoFieldErrors = {},
  ) {
    super(message);
    this.name = "TodoError";
  }
}

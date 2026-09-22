import {
    TodoError,
    type TodoFields,
    type TodoFieldErrors,
} from "../todos.types";

export const TODO_BODY_LIMIT = 4000;

export function normalizeTodoFields(fields: TodoFields): TodoFields {
    return {
        ...fields,
        body:
            typeof fields.body === "string"
                ? fields.body.replace(/\r\n?/g, "\n")
                : fields.body,
    };
}

export function isValidDateId(value: string): boolean {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [year, month, day] = value.split("-").map(Number);
    if (year < 1 || month < 1 || month > 12 || day < 1) return false;
    const date = new Date(0);
    date.setFullYear(year, month - 1, day);
    date.setHours(0, 0, 0, 0);
    return (
        date.getFullYear() === year &&
        date.getMonth() === month - 1 &&
        date.getDate() === day
    );
}

export function isValidTime(value: string): boolean {
    return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function validateTodo(fields: TodoFields): TodoFieldErrors {
    const errors: TodoFieldErrors = {};
    if (typeof fields.body !== "string" || !fields.body.trim())
        errors.body = "请输入待办内容";
    else if (Array.from(fields.body).length > TODO_BODY_LIMIT)
        errors.body = `内容不能超过 ${TODO_BODY_LIMIT} 字`;
    if (!isValidDateId(fields.dateId)) errors.dateId = "请选择有效日期";
    if (fields.startTime !== null && !isValidTime(fields.startTime))
        errors.startTime = "请选择有效开始时间";
    if (fields.endTime !== null && !isValidTime(fields.endTime))
        errors.endTime = "请选择有效结束时间";
    if (fields.endTime !== null && fields.startTime === null)
        errors.endTime = "请先设置开始时间";
    else if (
        fields.startTime !== null &&
        fields.endTime !== null &&
        fields.endTime < fields.startTime
    )
        errors.endTime = "结束时间不能早于开始时间";
    if (!["low", "normal", "high"].includes(fields.priority))
        errors.priority = "请选择有效优先级";
    for (const key of ["isStarred", "isPinned", "reminderEnabled"] as const) {
        if (typeof fields[key] !== "boolean") errors[key] = "无效设置";
    }
    if (fields.timeZone !== null && typeof fields.timeZone !== "string")
        errors.timeZone = "无效时区信息";
    return errors;
}

export function assertValidTodo(fields: TodoFields): void {
    const errors = validateTodo(fields);
    if (Object.keys(errors).length)
        throw new TodoError("validation", "请检查待办内容和日期时间", errors);
}

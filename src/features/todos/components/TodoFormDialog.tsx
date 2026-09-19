import { useState } from "react";
import { banner } from "@/core/notifications";
import { ChevronRight, Pin, Star, Trash2 } from "lucide-react-native";
import {
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { semanticColors, radii } from "@/shared/theme";
import {
  AppButton,
  AppCalendar,
  BodyInput,
  TimePickerField,
} from "@/shared/ui";
import { FormDialog } from "@/shared/ui/Dialog/FormDialog";
import DeleteConfirmDialog from "@/shared/ui/Dialog/DeleteConfirmDialog";
import { todoRepository } from "../state/todo-store";
import { assertTodoSession } from "../services/todo-service";
import { TODO_BODY_LIMIT } from "../domain/todo-validation";
import { useTodoForm } from "../hooks/useTodoForm";
import type { TodoEntity, TodoPriority } from "../todos.types";
import { todoColors } from "../todo-colors";
import { TodoIconAction } from "./TodoIconAction";

function FieldError({ message }: { message?: string }) {
  return message ? (
    <Text
      selectable
      accessibilityRole="alert"
      style={{ color: semanticColors.destructive, fontSize: 14, marginTop: 6 }}
    >
      {message}
    </Text>
  ) : null;
}

function DatePicker({
  value,
  onChange,
  onClose,
}: {
  value: string;
  onChange: (value: string) => void;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState(value);
  return (
    <FormDialog
      onClose={onClose}
      title={
        <Text
          accessibilityRole="header"
          style={{ fontSize: 24, color: semanticColors.textPrimary }}
        >
          选择日期
        </Text>
      }
      actions={
        <View style={{ flexDirection: "row", gap: 10 }}>
          <AppButton
            className="flex-1"
            label="取消"
            variant="secondary"
            onPress={onClose}
          />
          <AppButton
            className="flex-1"
            label="确定"
            onPress={() => {
              onChange(selected);
              onClose();
            }}
          />
        </View>
      }
    >
      <ScrollView style={{ flexShrink: 1 }}>
        <AppCalendar
          value={selected}
          initialMonthId={selected}
          viewMode="month"
          onChange={(next) => {
            if (typeof next === "string") setSelected(next);
          }}
        />
      </ScrollView>
    </FormDialog>
  );
}

export function TodoFormDialog({
  ownerKey,
  generation,
  base = null,
  dateId,
  onClose,
}: {
  ownerKey: string;
  generation: number;
  base?: TodoEntity | null;
  dateId: string;
  onClose: () => void;
}) {
  const form = useTodoForm(ownerKey, generation, base, dateId, onClose);
  const [datePicker, setDatePicker] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<TodoEntity | null>(null);
  const { fontScale } = useWindowDimensions();
  const title = base ? "编辑待办" : "新增待办";
  const [year, month, day] = form.fields.dateId.split("-").map(Number);
  const priorities: { value: TodoPriority; label: string }[] = [
    { value: "low", label: "不重要" },
    { value: "normal", label: "正常" },
    { value: "high", label: "重要" },
  ];
  const requestDelete = () => {
    if (!base) {
      form.cancel();
      return;
    }
    try {
      assertTodoSession(todoRepository, ownerKey, generation);
      setDeleteTarget(todoRepository.get(ownerKey, base.clientId));
    } catch (cause) {
      form.reportError(cause);
    }
  };

  return (
    <>
      <FormDialog
        onClose={() => {
          if (!datePicker && !deleteTarget && !form.busy)
            void form.save("dismiss");
        }}
        title={
          <View
            style={{
              minHeight: 48,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: 4,
            }}
          >
            <Text
              accessibilityRole="header"
              style={{
                fontSize: 24,
                color: semanticColors.textPrimary,
                minWidth: 96 * fontScale,
                flexGrow: 1,
              }}
            >
              {title}
            </Text>
            <View style={{ flexDirection: "row", gap: 4 }}>
              <TodoIconAction
                icon={Star}
                label="标星待办"
                selected={form.fields.isStarred}
                disabled={form.busy}
                onPress={() => form.change("isStarred", !form.fields.isStarred)}
              />
              <TodoIconAction
                icon={Pin}
                label="置顶待办"
                selected={form.fields.isPinned}
                disabled={form.busy}
                onPress={() => form.change("isPinned", !form.fields.isPinned)}
              />
              <TodoIconAction
                icon={Trash2}
                label={base ? "删除待办" : "放弃创建待办"}
                disabled={form.busy}
                onPress={requestDelete}
              />
            </View>
          </View>
        }
        actions={
          <View style={{ flexDirection: "row", gap: 10 }}>
            <AppButton
              className="flex-1"
              variant="secondary"
              label={base ? "取消" : "取消创建"}
              disabled={form.busy}
              onPress={form.cancel}
            />
            <AppButton
              className="flex-1"
              label={base ? "保存" : "确认创建"}
              loading={form.busy}
              loadingLabel="保存中…"
              onPress={() => {
                void form.save("confirm");
              }}
            />
          </View>
        }
      >
        <ScrollView
          style={{ flexShrink: 1 }}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: 2 }}
        >
          <Text
            style={{
              fontSize: 14,
              color: semanticColors.textSecondary,
              marginBottom: 8,
            }}
          >
            正文
          </Text>
          <BodyInput
            value={form.fields.body}
            onChangeText={(value) => form.change("body", value)}
            placeholder="输入待办内容"
            invalid={!!form.errors.body}
            disabled={form.busy}
            maxLength={TODO_BODY_LIMIT}
            accessibilityLabel="待办正文"
          />
          <FieldError message={form.errors.body} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`待办日期，${year}年${month}月${day}日`}
            disabled={form.busy}
            onPress={() => setDatePicker(true)}
            style={{
              marginTop: 16,
              minHeight: 48,
              paddingHorizontal: 16,
              borderRadius: radii.control,
              borderCurve: "continuous",
              backgroundColor: semanticColors.surfaceControl,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <Text
              style={{
                fontSize: 14,
                color: semanticColors.textPrimary,
                flexShrink: 1,
              }}
            >
              日期：{year}年{month}月{day}日
            </Text>
            <ChevronRight size={18} color={semanticColors.textSecondary} />
          </Pressable>
          <FieldError message={form.errors.dateId} />
          <View style={{ marginTop: 12, flexDirection: "row", gap: 10 }}>
            <TimePickerField
              label="开始时间"
              value={form.fields.startTime}
              disabled={form.busy}
              onChange={(value) => form.change("startTime", value)}
            />
            <TimePickerField
              label="结束时间"
              value={form.fields.endTime}
              disabled={form.busy}
              onChange={(value) => form.change("endTime", value)}
            />
          </View>
          <FieldError message={form.errors.startTime ?? form.errors.endTime} />
          <View
            accessibilityRole="radiogroup"
            style={{
              marginTop: 12,
              minHeight: 48,
              flexDirection: "row",
              backgroundColor: semanticColors.surfaceControl,
              borderRadius: radii.control,
              overflow: "hidden",
            }}
          >
            {priorities.map(({ value, label }) => (
              <Pressable
                key={value}
                disabled={form.busy}
                accessibilityRole="radio"
                accessibilityLabel={`优先级，${label}`}
                accessibilityState={{
                  selected: form.fields.priority === value,
                  checked: form.fields.priority === value,
                  disabled: form.busy,
                }}
                onPress={() => form.change("priority", value)}
                style={{
                  flex: 1,
                  alignItems: "center",
                  justifyContent: "center",
                  minHeight: 48,
                  paddingVertical: 8,
                  borderRadius: radii.control,
                  backgroundColor:
                    form.fields.priority === value
                      ? todoColors[value].accent
                      : "transparent",
                }}
              >
                <Text
                  style={{
                    fontSize: 14,
                    color:
                      form.fields.priority === value
                        ? semanticColors.textPrimary
                        : semanticColors.textSecondary,
                  }}
                >
                  {label}
                </Text>
              </Pressable>
            ))}
          </View>
          <FieldError
            message={form.error || form.errors.priority || form.errors.timeZone}
          />
        </ScrollView>
      </FormDialog>
      {datePicker && (
        <DatePicker
          value={form.fields.dateId}
          onChange={(value) => form.change("dateId", value)}
          onClose={() => setDatePicker(false)}
        />
      )}
      {deleteTarget && (
        <DeleteConfirmDialog
          visible
          description="删除后无法找回\n该待办将被永久删除"
          onClose={() => setDeleteTarget(null)}
          onConfirm={async () => {
            assertTodoSession(todoRepository, ownerKey, generation);
            try {
              await todoRepository.delete(ownerKey, [deleteTarget]);
              assertTodoSession(todoRepository, ownerKey, generation);
            } catch (cause) {
              if (
                todoRepository.ownerKey === ownerKey &&
                todoRepository.generation === generation
              )
                banner.show({
                  title: "待办删除失败",
                  message: cause instanceof Error ? cause.message : "请重试",
                  type: "important",
                });
              throw cause;
            }
            onClose();
          }}
        />
      )}
    </>
  );
}

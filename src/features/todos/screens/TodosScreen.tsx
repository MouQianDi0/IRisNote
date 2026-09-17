import { useCallback, useEffect, useMemo, useState } from "react";
import { BackHandler, FlatList, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { banner } from "@/core/notifications";
import { semanticColors } from "@/shared/theme";
import { Input } from "@/shared/ui";
import DeleteConfirmDialog from "@/shared/ui/Dialog/DeleteConfirmDialog";
import { toDateId } from "@/shared/utils/date-id";
import { TodoCalendarRail } from "../components/TodoCalendarRail";
import { TodoCard } from "../components/TodoCard";
import { TodoFilterBar } from "../components/TodoFilterBar";
import { TodoBatchToolbar } from "../components/TodoBatchToolbar";
import { TodoFormDialog } from "../components/TodoFormDialog";
import { useTodoScope } from "../hooks/useTodoScope";
import { useTodoClock } from "../hooks/useTodoClock";
import { queryTodos } from "../domain/todo-query";
import { assertTodoSession } from "../services/todo-service";
import { todoRepository, selectTodoDate } from "../state/todo-store";
import type {
  TodoEntity,
  TodoFilter,
  TodoSort,
  TodoVersionTarget,
} from "../todos.types";

function TodoList({
  ownerKey,
  generation,
  entities,
  selectedDateId,
}: {
  ownerKey: string;
  generation: number;
  entities: readonly TodoEntity[];
  selectedDateId: string | null;
}) {
  const now = useTodoClock(entities);
  const [filter, setFilter] = useState<TodoFilter>("all");
  const [sort, setSort] = useState<TodoSort>("timeAsc");
  const [searchOpen, setSearchOpen] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(
    new Set(),
  );
  const [batch, setBatch] = useState(false);
  const [editing, setEditing] = useState<TodoEntity | null>(null);
  const [deleting, setDeleting] = useState<readonly TodoVersionTarget[] | null>(
    null,
  );
  const today = toDateId(now);
  const dateId = selectedDateId ?? today;
  const visible = useMemo(
    () => queryTodos(entities, { dateId, filter, sort, keyword }, now),
    [entities, dateId, filter, sort, keyword, now],
  );
  const visibleIds = useMemo(
    () => new Set(visible.map((todo) => todo.clientId)),
    [visible],
  );
  const selected = visible.filter((todo) => selectedIds.has(todo.clientId));
  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    setBatch(false);
  }, []);

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => {
      if (!active) return;
      const remaining = new Set(
        [...selectedIds].filter((id) => visibleIds.has(id)),
      );
      if (remaining.size !== selectedIds.size) {
        setSelectedIds(remaining);
        if (!remaining.size) setBatch(false);
      }
    });
    return () => {
      active = false;
    };
  }, [visibleIds, selectedIds]);

  useFocusEffect(
    useCallback(() => {
      if (!batch) return;
      const subscription = BackHandler.addEventListener(
        "hardwareBackPress",
        () => {
          clearSelection();
          return true;
        },
      );
      return () => subscription.remove();
    }, [batch, clearSelection]),
  );

  const run = (command: () => void) => {
    try {
      assertTodoSession(todoRepository, ownerKey, generation);
      command();
    } catch (cause) {
      banner.show({
        title: "待办操作失败",
        message: cause instanceof Error ? cause.message : "请重试",
        type: "important",
      });
    }
  };
  const toggleSelection = (id: string) =>
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const batchChange = (key: "isStarred" | "isPinned") => {
    const targets = selected.map(({ clientId, localVersion }) => ({
      clientId,
      localVersion,
    }));
    const value = !selected.every((todo) => todo[key]);
    run(() =>
      todoRepository.batch(ownerKey, targets, { [key]: value }, new Date()),
    );
  };

  return (
    <View className="mt-[15px] flex-1 bg-app-background">
      <View className="flex-1 flex-row">
        <View className="relative flex-1">
          <View
            className="mb-2 h-[100%] rounded-tr-content border-b border-r border-t border-note-page-border bg-white"
            style={{ padding: 16, paddingBottom: 24 }}
          >
            {batch ? (
              <TodoBatchToolbar
                count={selected.length}
                onClose={clearSelection}
                onAll={() =>
                  setSelectedIds(new Set(visible.map((todo) => todo.clientId)))
                }
                onStar={() => batchChange("isStarred")}
                onPin={() => batchChange("isPinned")}
                onDelete={() =>
                  setDeleting(
                    selected.map(({ clientId, localVersion }) => ({
                      clientId,
                      localVersion,
                    })),
                  )
                }
              />
            ) : (
              <TodoFilterBar
                filter={filter}
                sort={sort}
                searchOpen={searchOpen}
                onFilter={(value) => {
                  setFilter(value);
                  clearSelection();
                }}
                onSort={setSort}
                onSearch={() => {
                  setSearchOpen(!searchOpen);
                  setKeyword("");
                  clearSelection();
                }}
              />
            )}
            {searchOpen && (
              <View style={{ marginTop: 12 }}>
                <Input
                  size="compact"
                  placeholder="搜索待办"
                  accessibilityLabel="搜索待办"
                  value={keyword}
                  onChangeText={(value) => {
                    setKeyword(value);
                    clearSelection();
                  }}
                  clearable
                />
              </View>
            )}
            <FlatList
              style={{ marginTop: 12, flex: 1 }}
              data={visible}
              keyExtractor={(todo) => todo.clientId}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingBottom: 90, flexGrow: 1 }}
              ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
              ListEmptyComponent={
                <View
                  style={{
                    flex: 1,
                    alignItems: "center",
                    justifyContent: "center",
                    paddingVertical: 32,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 14,
                      color: semanticColors.textSecondary,
                    }}
                  >
                    {keyword.trim() ? "无匹配待办" : "该日期暂无待办"}
                  </Text>
                </View>
              }
              renderItem={({ item }) => (
                <TodoCard
                  todo={item}
                  now={now}
                  batch={batch}
                  selected={selectedIds.has(item.clientId)}
                  onPress={() =>
                    batch ? toggleSelection(item.clientId) : setEditing(item)
                  }
                  onLongPress={() => {
                    setBatch(true);
                    setSelectedIds(new Set([item.clientId]));
                  }}
                  onComplete={() =>
                    run(() =>
                      todoRepository.complete(
                        ownerKey,
                        item,
                        !item.isCompleted,
                        new Date(),
                      ),
                    )
                  }
                />
              )}
            />
          </View>
        </View>
        <View className="relative h-auto w-[75px] items-center rounded-floating bg-app-background">
          <TodoCalendarRail
            value={selectedDateId}
            todayId={today}
            onChange={(value) => {
              selectTodoDate(ownerKey, value);
              clearSelection();
            }}
          />
        </View>
      </View>
      {editing && (
        <TodoFormDialog
          key={editing.clientId}
          ownerKey={ownerKey}
          generation={generation}
          base={editing}
          dateId={editing.dateId}
          onClose={() => setEditing(null)}
        />
      )}
      {deleting && (
        <DeleteConfirmDialog
          visible
          description={`删除后无法找回\n所选 ${deleting.length} 项待办将被永久删除`}
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            assertTodoSession(todoRepository, ownerKey, generation);
            todoRepository.delete(ownerKey, deleting);
            clearSelection();
          }}
        />
      )}
    </View>
  );
}

export default function TodosScreen() {
  const scope = useTodoScope();
  return scope.ready ? (
    <TodoList
      key={`${scope.ownerKey}:${scope.generation}`}
      ownerKey={scope.ownerKey}
      generation={scope.generation}
      entities={scope.entities}
      selectedDateId={scope.selectedDateId}
    />
  ) : (
    <View className="flex-1 bg-app-background" />
  );
}

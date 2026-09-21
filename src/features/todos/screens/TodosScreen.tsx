import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { BackHandler, SectionList, Text, View } from "react-native";
import { useFocusEffect, useLocalSearchParams } from "expo-router";
import { banner } from "@/core/notifications";
import { semanticColors } from "@/shared/theme";
import { Input } from "@/shared/ui";
import DeleteConfirmDialog from "@/shared/ui/Dialog/DeleteConfirmDialog";
import { fromDateId, startOfWeekId, toDateId } from "@/shared/utils/date-id";
import { TodoCalendarRail } from "../components/TodoCalendarRail";
import { TodoCard } from "../components/TodoCard";
import { TodoFilterBar } from "../components/TodoFilterBar";
import { TodoBatchToolbar } from "../components/TodoBatchToolbar";
import { TodoFormDialog } from "../components/TodoFormDialog";
import { useTodoScope } from "../hooks/useTodoScope";
import { useTodoClock } from "../hooks/useTodoClock";
import { queryTodosByWeek } from "../domain/todo-query";
import { assertTodoSession } from "../services/todo-service";
import { todoRepository, selectTodoDate } from "../state/todo-store";
import type {
  TodoEntity,
  TodoFilter,
  TodoSort,
  TodoVersionTarget,
} from "../todos.types";

type TodoDaySection = {
  key: string;
  dateId: string;
  isFirst: boolean;
  data: TodoEntity[];
};

const WEEKDAY_CHARACTERS = "日一二三四五六";

const DAY_HEADER_LINE_HEIGHT = 18;
const DAY_HEADER_BOTTOM_GAP = 8;
const DAY_HEADER_TOP_MARGIN = 16;
const SCROLL_RETRY_LIMIT = 3;
const SCROLL_RETRY_DELAY_MS = 150;
const SCROLL_RETRY_WINDOW_MS = 2000;

/** 滚动定位的 viewOffset 补偿：把分组头留在可视区内。 */
function dayHeaderViewOffset(isFirst: boolean): number {
  return (
    DAY_HEADER_LINE_HEIGHT +
    DAY_HEADER_BOTTOM_GAP +
    (isFirst ? 0 : DAY_HEADER_TOP_MARGIN)
  );
}

function dayHeaderLabel(dateId: string): string {
  const date = fromDateId(dateId);
  return `${date.getMonth() + 1}月${date.getDate()}日 周${
    WEEKDAY_CHARACTERS[date.getDay()]
  }`;
}

function TodoDaySectionHeader({
  section,
  todayId,
}: {
  section: TodoDaySection;
  todayId: string;
}) {
  const isToday = section.dateId === todayId;
  return (
    <View
      accessibilityRole="header"
      style={{
        marginTop: section.isFirst ? 0 : DAY_HEADER_TOP_MARGIN,
        marginBottom: DAY_HEADER_BOTTOM_GAP,
      }}
    >
      <View style={{ alignItems: "center", flexDirection: "row", gap: 8 }}>
        <Text
          style={{
            fontSize: 13,
            lineHeight: DAY_HEADER_LINE_HEIGHT,
            color: isToday
              ? semanticColors.brandPrimary
              : semanticColors.textSecondary,
          }}
        >
          {dayHeaderLabel(section.dateId)}
        </Text>
        {isToday && (
          <Text
            style={{
              fontSize: 13,
              lineHeight: DAY_HEADER_LINE_HEIGHT,
              color: semanticColors.brandPrimary,
            }}
          >
            今天
          </Text>
        )}
        <View
          style={{
            flex: 1,
            height: 1,
            backgroundColor: semanticColors.divider,
          }}
        />
      </View>
    </View>
  );
}

function TodoList({
  ownerKey,
  generation,
  entities,
  selectedDateId,
  initialReminderDate,
}: {
  ownerKey: string;
  generation: number;
  entities: readonly TodoEntity[];
  selectedDateId: string | null;
  initialReminderDate: string | null;
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
  const running = useRef(false);
  const [editing, setEditing] = useState<TodoEntity | null>(null);
  const [deleting, setDeleting] = useState<readonly TodoVersionTarget[] | null>(
    null,
  );
  const today = toDateId(now);
  const derivedWeekId = startOfWeekId(selectedDateId ?? today, "monday");
  const [browsedWeekId, setBrowsedWeekId] = useState<string | null>(null);
  const weekId = browsedWeekId ?? derivedWeekId;
  const visible = useMemo(
    () => queryTodosByWeek(entities, { weekId, filter, sort, keyword }, now),
    [entities, weekId, filter, sort, keyword, now],
  );
  const visibleIds = useMemo(
    () => new Set(visible.map((todo) => todo.clientId)),
    [visible],
  );
  const sections = useMemo<TodoDaySection[]>(() => {
    const groups = new Map<string, TodoEntity[]>();
    for (const todo of visible) {
      const group = groups.get(todo.dateId);
      if (group) group.push(todo);
      else groups.set(todo.dateId, [todo]);
    }
    return [...groups.entries()]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([dateId, data], index) => ({
        key: dateId,
        dateId,
        isFirst: index === 0,
        data,
      }));
  }, [visible]);
  const listRef = useRef<SectionList<TodoEntity, TodoDaySection>>(null);
  const deferredScrollDateId = useRef<string | null>(initialReminderDate);
  const lastAutoWeekId = useRef(weekId);
  const scrollRetry = useRef({
    dateId: "",
    attempts: 0,
    issuedAt: 0,
    timer: null as ReturnType<typeof setTimeout> | null,
  });
  const selected = visible.filter((todo) => selectedIds.has(todo.clientId));
  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    setBatch(false);
  }, []);

  const issueScrollToDate = useCallback(
    (targetId: string, isRetry: boolean) => {
      const sectionIndex = sections.findIndex(
        (section) => section.dateId === targetId,
      );
      const section = sections[sectionIndex];
      if (sectionIndex < 0 || !section) return false;
      if (!isRetry)
        scrollRetry.current = {
          dateId: targetId,
          attempts: 0,
          issuedAt: Date.now(),
          timer: scrollRetry.current.timer,
        };
      listRef.current?.scrollToLocation({
        sectionIndex,
        itemIndex: 0,
        viewOffset: dayHeaderViewOffset(section.isFirst),
        viewPosition: 0,
        animated: true,
      });
      return true;
    },
    [sections],
  );

  // 目标分节不在当前渲染中（如跨周选日）时挂起，待新数据渲染后统一滚动：
  // 有挂起目标优先滚目标，否则换周后回到顶部；用户导航到其它周则丢弃陈旧意图。
  useLayoutEffect(() => {
    if (
      lastAutoWeekId.current === weekId &&
      deferredScrollDateId.current === null
    )
      return;
    lastAutoWeekId.current = weekId;
    const target = deferredScrollDateId.current;
    if (target !== null) {
      if (startOfWeekId(target, "monday") !== weekId) {
        deferredScrollDateId.current = null;
        return;
      }
      if (issueScrollToDate(target, false)) deferredScrollDateId.current = null;
      return;
    }
    const [first] = sections;
    if (first)
      listRef.current?.scrollToLocation({
        sectionIndex: 0,
        itemIndex: 0,
        viewOffset: dayHeaderViewOffset(first.isFirst),
        viewPosition: 0,
        animated: false,
      });
  }, [weekId, sections, issueScrollToDate]);

  const scrollToDate = useCallback(
    (targetId: string) => {
      if (!issueScrollToDate(targetId, false))
        deferredScrollDateId.current = targetId;
    },
    [issueScrollToDate],
  );

  useEffect(
    () => () => {
      if (scrollRetry.current.timer) clearTimeout(scrollRetry.current.timer);
    },
    [],
  );

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

  const run = async (command: () => unknown | Promise<unknown>) => {
    if (running.current) return;
    running.current = true;
    try {
      assertTodoSession(todoRepository, ownerKey, generation);
      await command();
    } catch (cause) {
      if (
        todoRepository.ownerKey !== ownerKey ||
        todoRepository.generation !== generation
      )
        return;
      banner.show({
        title: "待办操作失败",
        message: cause instanceof Error ? cause.message : "请重试",
        type: "important",
      });
    } finally {
      running.current = false;
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
            <SectionList
              ref={listRef}
              style={{ marginTop: 12, flex: 1 }}
              sections={sections}
              keyExtractor={(todo) => todo.clientId}
              keyboardShouldPersistTaps="handled"
              stickySectionHeadersEnabled={false}
              contentContainerStyle={{ paddingBottom: 90, flexGrow: 1 }}
              ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
              renderSectionHeader={({ section }) => (
                <TodoDaySectionHeader section={section} todayId={today} />
              )}
              onScrollToIndexFailed={() => {
                const retry = scrollRetry.current;
                if (
                  retry.timer ||
                  Date.now() - retry.issuedAt > SCROLL_RETRY_WINDOW_MS ||
                  retry.attempts >= SCROLL_RETRY_LIMIT
                )
                  return;
                retry.attempts += 1;
                retry.timer = setTimeout(
                  () => {
                    retry.timer = null;
                    issueScrollToDate(retry.dateId, true);
                  },
                  SCROLL_RETRY_DELAY_MS,
                );
              }}
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
                    {keyword.trim() ? "无匹配待办" : "本周暂无待办"}
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
            weekId={weekId}
            onWeekChange={(next) => {
              setBrowsedWeekId(next === derivedWeekId ? null : next);
            }}
            onChange={(value) => {
              selectTodoDate(ownerKey, value);
              clearSelection();
              scrollToDate(value);
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
            try {
              await todoRepository.delete(ownerKey, deleting);
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
            clearSelection();
          }}
        />
      )}
    </View>
  );
}

export default function TodosScreen() {
  const scope = useTodoScope();
  const { reminderVisit } = useLocalSearchParams<{ reminderVisit?: string }>();
  return scope.ready ? (
    <TodoList
      key={`${scope.ownerKey}:${scope.generation}:${reminderVisit ?? ""}`}
      ownerKey={scope.ownerKey}
      generation={scope.generation}
      entities={scope.entities}
      selectedDateId={scope.selectedDateId}
      initialReminderDate={reminderVisit ? scope.selectedDateId : null}
    />
  ) : (
    <View className="flex-1 bg-app-background" />
  );
}

import api from "@/api/client";
import AddCategoryButton from "@/components/AddCategoryButton";
import AddNoteClass from "@/components/addNoteClass";
import FloatingBar from "@/components/FloatingBarComponents/FloatingBar";
import {
  ALL_CATEGORY,
  notifyCategoriesChanged,
  onCategoriesChanged,
  type Category,
} from "@/data/categories";
import { setFloatingMenuHidden } from "@/data/floatingMenuVisibility";
import {
  onNotesChanged,
  onNotesRemovedByCategory,
  removeCachedNoteById,
  setCachedNotes,
} from "@/data/notes";
import { router } from "expo-router";
import { ChevronUp } from "lucide-react-native";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  FlatList,
  Pressable,
  Text,
  View,
  type ListRenderItem,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

type Note = {
  id: number;
  title: string;
  content: string | null;
  category_id: number | null;
  created_at: string;
};

type NoteListItemProps = {
  item: Note;
  categoryName: string;
  onDelete: (item: Note) => void;
  onOpen: (item: Note) => void;
};

const NoteListItem = memo(function NoteListItem({
  item,
  categoryName,
  onDelete,
  onOpen,
}: NoteListItemProps) {
  const lastLongPressAtRef = useRef(0);

  const handleLongPress = useCallback(() => {
    lastLongPressAtRef.current = Date.now();
    onDelete(item);
  }, [item, onDelete]);

  const handlePress = useCallback(() => {
    if (Date.now() - lastLongPressAtRef.current < 600) {
      return;
    }

    onOpen(item);
  }, [item, onOpen]);

  return (
    <Pressable
      onPress={handlePress}
      onLongPress={handleLongPress}
      className="bg-[#e0eaff] rounded-[14px] p-5 mb-4 overflow-hidden"
      style={{ width: "100%", maxWidth: 400, maxHeight: 175 }}
    >
      <Text
        className="text-base font-semibold text-gray-800"
        numberOfLines={2}
        ellipsizeMode="tail"
      >
        {item.title}
      </Text>
      <Text
        className="text-sm text-gray-500 mt-1"
        numberOfLines={4}
        ellipsizeMode="tail"
      >
        {item.content}
      </Text>
      <View className="flex-row items-center mt-2">
        <View className="bg-blue-50 rounded-full px-2 py-0.5">
          <Text className="text-xs text-blue-500">{categoryName}</Text>
        </View>
      </View>
    </Pressable>
  );
});

export default function Index() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [currentCategory, setCurrentCategory] = useState(
    String(ALL_CATEGORY.id),
  );
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [NoteClassMenu, setNoteClassMenu] = useState(false);
  const flatListRef = useRef<FlatList<Note>>(null);
  const notesRequestRef = useRef<Promise<void> | null>(null);
  const categoriesRequestRef = useRef<Promise<void> | null>(null);
  const showScrollTopRef = useRef(false);
  const floatingMenuRestoreTimerRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);

  const fetchNotes = useCallback(() => {
    if (notesRequestRef.current) return notesRequestRef.current;

    const request = (async () => {
      try {
        const { data } = await api.get<Note[]>("/notes");
        const nextNotes = Array.isArray(data) ? data : [];
        setNotes(nextNotes);
        setCachedNotes(nextNotes);
      } catch (err: any) {
        console.error(
          "获取笔记失败:",
          err.response?.status,
          err.response?.data || err.message,
        );
      } finally {
        notesRequestRef.current = null;
      }
    })();

    notesRequestRef.current = request;
    return request;
  }, []);

  const fetchCategories = useCallback(() => {
    if (categoriesRequestRef.current) return categoriesRequestRef.current;

    const request = (async () => {
      try {
        const { data } = await api.get<Category[]>("/categories");
        setCategories(Array.isArray(data) ? data : []);
      } catch (err: any) {
        console.error("获取分类失败:", err.message);
      } finally {
        categoriesRequestRef.current = null;
      }
    })();

    categoriesRequestRef.current = request;
    return request;
  }, []);

  useEffect(() => {
    Promise.all([fetchNotes(), fetchCategories()]).finally(() =>
      setLoading(false),
    );
  }, [fetchNotes, fetchCategories]);

  // 订阅分类变更通知（FloatingBar 修改分类后自动刷新标签）
  useEffect(() => {
    const unsub = onCategoriesChanged(() => {
      fetchCategories();
    });
    return unsub;
  }, [fetchCategories]);

  // 创建笔记返回后刷新
  useEffect(() => {
    const unsub = onNotesChanged(() => {
      fetchNotes();
    });
    return unsub;
  }, [fetchNotes]);

  // 删除分类成功后，本地增量移除该分类下的笔记，避免重新拉取全部笔记。
  useEffect(() => {
    const unsub = onNotesRemovedByCategory((categoryId) => {
      setNotes((prev) => {
        const nextNotes = prev.filter((note) => note.category_id !== categoryId);
        setCachedNotes(nextNotes);
        return nextNotes;
      });
    });
    return unsub;
  }, []);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchNotes();
    setRefreshing(false);
  }, [fetchNotes]);

  const handleDelete = useCallback((item: Note) => {
    Alert.alert("删除笔记", `确定要删除「${item.title}」吗？`, [
      { text: "取消", style: "cancel" },
      {
        text: "删除",
        style: "destructive",
        onPress: async () => {
          try {
            await api.delete(`/notes/${item.id}`);
            removeCachedNoteById(item.id);
            setNotes((prev) => {
              const nextNotes = prev.filter((n) => n.id !== item.id);
              setCachedNotes(nextNotes);
              return nextNotes;
            });
          } catch (err: any) {
            Alert.alert("提示", err.response?.data?.error || "删除失败");
          }
        },
      },
    ]);
  }, []);

  const handleOpenNote = useCallback((item: Note) => {
    router.push({
      pathname: "/note/[id]",
      params: { id: String(item.id) },
    });
  }, []);

  const handleAddCategory = useCallback(async (name: string, icon: string) => {
    try {
      await api.post("/categories", { name, icon });
      notifyCategoriesChanged();
      setNoteClassMenu(false);
    } catch (err: any) {
      console.error("创建分类失败:", err.message);
    }
  }, []);

  const handleScrollToTop = useCallback(() => {
    flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
  }, []);

  const scheduleFloatingMenuRestore = useCallback(() => {
    if (floatingMenuRestoreTimerRef.current) {
      clearTimeout(floatingMenuRestoreTimerRef.current);
    }

    setFloatingMenuHidden(true);
    floatingMenuRestoreTimerRef.current = setTimeout(() => {
      setFloatingMenuHidden(false);
      floatingMenuRestoreTimerRef.current = null;
    }, 180);
  }, []);

  useEffect(() => {
    return () => {
      if (floatingMenuRestoreTimerRef.current) {
        clearTimeout(floatingMenuRestoreTimerRef.current);
      }

      setFloatingMenuHidden(false);
    };
  }, []);

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      scheduleFloatingMenuRestore();

      const offsetY = event.nativeEvent.contentOffset.y;
      const shouldShowScrollTop = offsetY > 300;

      if (showScrollTopRef.current !== shouldShowScrollTop) {
        showScrollTopRef.current = shouldShowScrollTop;
        setShowScrollTop(shouldShowScrollTop);
      }
    },
    [scheduleFloatingMenuRestore],
  );

  // 滚动到顶部按钮的上下缓动动画
  const bounceY = useSharedValue(0);
  useEffect(() => {
    bounceY.value = withRepeat(withTiming(-10, { duration: 1000 }), -1, true);
  }, [bounceY]);
  const bounceStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: bounceY.value }],
  }));

  const categoryNameMap = useMemo(() => {
    const map = new Map<number, string>();
    categories.forEach((c) => map.set(c.id, c.name));
    return map;
  }, [categories]); // 缓存分类名称映射，避免每次渲染都重新计算

  const filteredNotes = useMemo(() => {
    if (currentCategory === String(ALL_CATEGORY.id)) {
      return notes;
    }

    return notes.filter((note) => String(note.category_id) === currentCategory);
  }, [currentCategory, notes]);

  const keyExtractor = useCallback((item: Note) => String(item.id), []);

  const renderNoteItem = useCallback<ListRenderItem<Note>>(
    ({ item }) => {
      const categoryName =
        item.category_id != null
          ? (categoryNameMap.get(item.category_id) ?? "未知")
          : "默认";

      return (
        <NoteListItem
          item={item}
          categoryName={categoryName}
          onDelete={handleDelete}
          onOpen={handleOpenNote}
        />
      );
    },
    [categoryNameMap, handleDelete, handleOpenNote],
  );

  const listContentContainerStyle = useMemo(() => ({ paddingBottom: 10 }), []);

  const listHeaderComponent = useMemo(
    () => (
      <View
        className="bg-blue-50 h-[200px] rounded-[14px] mb-6 overflow-hidden"
        style={{ width: "100%", maxWidth: 400 }}
      />
    ),
    [],
  );

  const listEmptyComponent = useMemo(
    () => (
      <View className="items-center py-5">
        <Text className="text-gray-400 text-base">暂无笔记</Text>
      </View>
    ),
    [],
  );

  return (
    <View className="mt-10 bg-[#ecedefff] h-full">
      <View className="flex-row h-full ">
        <View
          className="     relative
                                    w-[75px]
                                    bg-[rgb(242, 242, 242)]
                                    h-auto                           
                                    rounded-[18px]
                                    items-center gap-[6px]"
        >
          <FloatingBar onCategoryPress={setCurrentCategory} />
          <View className="absolute bottom-21">
            <AddCategoryButton onPress={() => setNoteClassMenu(true)} />
          </View>
        </View>
        <View className="relative flex-1">
          <View className="bg-white rounded-tl-[30px] p-4 h-[100%] border-[1px] border-[#d7d7d7]">
            <FlatList
              ref={flatListRef}
              className="rounded-[14px]"
              data={filteredNotes}
              extraData={categoryNameMap}
              keyExtractor={keyExtractor}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={listContentContainerStyle}
              onScroll={handleScroll}
              scrollEventThrottle={16}
              ListHeaderComponent={listHeaderComponent}
              refreshing={refreshing}
              onRefresh={handleRefresh}
              renderItem={renderNoteItem}
              ListEmptyComponent={listEmptyComponent}
              initialNumToRender={8}
              maxToRenderPerBatch={6}
              updateCellsBatchingPeriod={50}
              windowSize={7}
              removeClippedSubviews
            />
          </View>
          {showScrollTop && (
            <Animated.View
              style={bounceStyle}
              className="absolute bottom-15 left-1/2 -translate-x-1/2"
            >
              <Pressable
                onPress={handleScrollToTop}
                className="right-1/2 translate-x-1/2 w-11 h-11 bg-transparent rounded-full"
              >
                <ChevronUp size={50} color="#7c7c7ccb" />
              </Pressable>
            </Animated.View>
          )}
        </View>
      </View>
      <AddNoteClass
        visible={NoteClassMenu}
        onClose={() => setNoteClassMenu(false)}
        onAdd={handleAddCategory}
      />
    </View>
  );
}

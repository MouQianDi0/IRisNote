/* eslint-disable react-hooks/immutability, react-hooks/refs */
import PinBadge from "@/components/PinBadge";
import StarBadge from "@/components/StarBadge";
import { useDebouncedAction } from "@/hooks/useDebouncedAction";
import { Pin, Star, Trash2 } from "lucide-react-native";
import { useCallback, useEffect, useRef } from "react";
import { Pressable, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

export type SwipeableNote = {
  id: number;
  title: string;
  content: string | null;
  category_id: number | null;
  created_at: string;
  is_pinned?: boolean;
  is_starred?: boolean;
  local_order?: number;
  pinned_order?: number;
};

type SwipeableNoteItemProps = {
  item: SwipeableNote;
  categoryName: string;
  openedNoteId: number | null;
  onOpen: (item: SwipeableNote) => void;
  onDelete: (item: SwipeableNote) => void;
  onTogglePin: (item: SwipeableNote) => void;
  onToggleStar: (item: SwipeableNote) => void;
  onOpenActions: (noteId: number) => void;
  onCloseActions: () => void;
};

const RIGHT_ACTION_WIDTH = 138;
const LEFT_ACTION_WIDTH = 76;
const OPEN_THRESHOLD = 48;
const TAP_GUARD_DISTANCE = 8;

export default function SwipeableNoteItem({
  item,
  categoryName,
  openedNoteId,
  onOpen,
  onDelete,
  onTogglePin,
  onToggleStar,
  onOpenActions,
  onCloseActions,
}: SwipeableNoteItemProps) {
  const runDebouncedAction = useDebouncedAction();
  const translateX = useSharedValue(0);
  const startX = useSharedValue(0);
  const swipedRef = useRef(false);

  const markSwiped = useCallback(() => {
    swipedRef.current = true;
    setTimeout(() => {
      swipedRef.current = false;
    }, 120);
  }, []);

  const closeActions = useCallback(() => {
    translateX.value = withTiming(0, { duration: 180 });
    onCloseActions();
  }, [onCloseActions, translateX]);

  useEffect(() => {
    if (openedNoteId !== item.id) {
      translateX.value = withTiming(0, { duration: 180 });
    }
  }, [item.id, openedNoteId, translateX]);

  const panGesture = Gesture.Pan()
    .activeOffsetX([-12, 12])
    .failOffsetY([-10, 10])
    .onBegin(() => {
      startX.value = translateX.value;
    })
    .onUpdate((event) => {
      const nextX = startX.value + event.translationX;
      translateX.value = Math.max(
        -LEFT_ACTION_WIDTH,
        Math.min(RIGHT_ACTION_WIDTH, nextX),
      );
    })
    .onEnd(() => {
      if (translateX.value > OPEN_THRESHOLD) {
        translateX.value = withTiming(RIGHT_ACTION_WIDTH, { duration: 180 });
        runOnJS(onOpenActions)(item.id);
        return;
      }

      if (translateX.value < -OPEN_THRESHOLD) {
        translateX.value = withTiming(-LEFT_ACTION_WIDTH, { duration: 180 });
        runOnJS(onOpenActions)(item.id);
        return;
      }

      translateX.value = withTiming(0, { duration: 180 });
      runOnJS(onCloseActions)();
    })
    .onFinalize((event) => {
      if (Math.abs(event.translationX) > TAP_GUARD_DISTANCE) {
        runOnJS(markSwiped)();
      }
    });

  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const handlePress = useCallback(() => {
    if (swipedRef.current) return;

    if (openedNoteId === item.id) {
      closeActions();
      return;
    }

    onOpen(item);
  }, [closeActions, item, onOpen, openedNoteId]);

  const handlePinPress = useCallback(() => {
    runDebouncedAction(`note:${item.id}:pin`, () => {
      onTogglePin(item);
      closeActions();
    });
  }, [closeActions, item, onTogglePin, runDebouncedAction]);

  const handleStarPress = useCallback(() => {
    runDebouncedAction(`note:${item.id}:star`, () => {
      onToggleStar(item);
      closeActions();
    });
  }, [closeActions, item, onToggleStar, runDebouncedAction]);

  const handleDeletePress = useCallback(() => {
    runDebouncedAction(`note:${item.id}:delete`, () => {
      onDelete(item);
      closeActions();
    });
  }, [closeActions, item, onDelete, runDebouncedAction]);

  return (
    <View
      className="mb-4 overflow-hidden rounded-[14px]"
      style={{ width: "100%", maxWidth: 400, maxHeight: 175 }}
    >
      <View className="absolute inset-0 flex-row justify-between bg-transparent">
        <View className="flex-row overflow-hidden rounded-[14px] bg-[#e8f1ff]">
          <Pressable
            onPress={handlePinPress}
            className="h-full w-[69px] items-center justify-center gap-1 bg-[#d9e7ff]"
          >
            <Pin
              size={20}
              color={item.is_pinned ? "#2563eb" : "#4b5563"}
              fill={item.is_pinned ? "#2563eb" : "transparent"}
            />
            <Text className="text-xs font-semibold text-gray-700">
              {item.is_pinned ? "取消" : "置顶"}
            </Text>
          </Pressable>
          <Pressable
            onPress={handleStarPress}
            className="h-full w-[69px] items-center justify-center gap-1 bg-[#fff4cc]"
          >
            <Star
              size={20}
              color={item.is_starred ? "#f59e0b" : "#4b5563"}
              fill={item.is_starred ? "#f59e0b" : "transparent"}
            />
            <Text className="text-xs font-semibold text-gray-700">
              {item.is_starred ? "取消" : "标星"}
            </Text>
          </Pressable>
        </View>

        <Pressable
          onPress={handleDeletePress}
          className="h-full w-[76px] items-center justify-center gap-1 rounded-[14px] bg-[#ff4d4f]"
        >
          <Trash2 size={22} color="#fff" />
          <Text className="text-xs font-semibold text-white">删除</Text>
        </Pressable>
      </View>

      <GestureDetector gesture={panGesture}>
        <Animated.View style={cardStyle}>
          <Pressable
            onPress={handlePress}
            className="bg-[#e0eaff] rounded-[14px] p-5 overflow-hidden"
            style={{ width: "100%", maxWidth: 400, maxHeight: 175 }}
          >
            <View className="flex-row items-start justify-between gap-3">
              <Text
                className="flex-1 text-base font-semibold text-gray-800"
                numberOfLines={2}
                ellipsizeMode="tail"
              >
                {item.title}
              </Text>
              <View className="flex-row gap-1">
                {item.is_pinned && <PinBadge size={14} color="#2563eb" />}
                {item.is_starred && <StarBadge size={14} color="#f59e0b" />}
              </View>
            </View>
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
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

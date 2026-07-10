/* eslint-disable react-hooks/immutability, react-hooks/refs */
import NoteCard from "@/components/Note/Card/NoteCard";
import NoteSwipeActions from "@/components/Note/Card/NoteSwipeActions";
import { useDebouncedAction } from "@/hooks/useDebounced/useDebouncedAction";
import { useCallback, useEffect, useRef } from "react";
import { View } from "react-native";
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
  onSwipeStart?: () => void;
  onSwipeClose?: () => void;
  onLongPress: (item: SwipeableNote) => void;
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
  onSwipeStart,
  onSwipeClose,
  onLongPress,
}: SwipeableNoteItemProps) {
  const runDebouncedAction = useDebouncedAction();
  const translateX = useSharedValue(0);
  const startX = useSharedValue(0);
  const swipedRef = useRef(false);
  const longPressedRef = useRef(false);
  const isOpenRef = useRef(false);

  const markSwiped = useCallback(() => {
    swipedRef.current = true;
    setTimeout(() => {
      swipedRef.current = false;
    }, 120);
  }, []);

  const handleLongPress = useCallback(() => {
    longPressedRef.current = true;
    onLongPress(item);
  }, [item, onLongPress]);

  const releaseLongPressGuard = useCallback(() => {
    setTimeout(() => {
      longPressedRef.current = false;
    }, 120);
  }, []);

  const finishCloseActions = useCallback(() => {
    isOpenRef.current = false;
    onCloseActions();
    onSwipeClose?.();
  }, [onCloseActions, onSwipeClose]);

  const openActions = useCallback(
    (noteId: number) => {
      isOpenRef.current = true;
      onOpenActions(noteId);
    },
    [onOpenActions],
  );

  const closeActions = useCallback(() => {
    translateX.value = withTiming(0, { duration: 180 }, (finished) => {
      if (finished) {
        runOnJS(finishCloseActions)();
      }
    });
  }, [finishCloseActions, translateX]);

  useEffect(() => {
    if (openedNoteId === item.id) {
      isOpenRef.current = true;
      return;
    }

    if (openedNoteId === null && isOpenRef.current) {
      translateX.value = withTiming(0, { duration: 180 }, (finished) => {
        if (finished) {
          runOnJS(finishCloseActions)();
        }
      });
      return;
    }

    if (openedNoteId !== item.id) {
      isOpenRef.current = false;
      translateX.value = withTiming(0, { duration: 180 });
    }
  }, [finishCloseActions, item.id, openedNoteId, translateX]);

  const panGesture = Gesture.Pan()
    .activeOffsetX([-12, 12])
    .failOffsetY([-10, 10])
    .onBegin(() => {
      startX.value = translateX.value;
    })
    .onStart(() => {
      if (onSwipeStart) {
        runOnJS(onSwipeStart)();
      }
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
        runOnJS(openActions)(item.id);
        return;
      }

      if (translateX.value < -OPEN_THRESHOLD) {
        translateX.value = withTiming(-LEFT_ACTION_WIDTH, { duration: 180 });
        runOnJS(openActions)(item.id);
        return;
      }

      translateX.value = withTiming(0, { duration: 180 }, (finished) => {
        if (finished) {
          runOnJS(finishCloseActions)();
        }
      });
    })
    .onFinalize((event) => {
      if (Math.abs(event.translationX) > TAP_GUARD_DISTANCE) {
        runOnJS(markSwiped)();
      }
    });

  const longPressGesture = Gesture.LongPress()
    .minDuration(500)
    .maxDistance(10)
    .onStart(() => {
      runOnJS(handleLongPress)();
    })
    .onFinalize(() => {
      runOnJS(releaseLongPressGuard)();
    });

  const cardGesture = Gesture.Race(panGesture, longPressGesture);

  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const handlePress = useCallback(() => {
    if (swipedRef.current || longPressedRef.current) return;

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
      <NoteSwipeActions
        isPinned={item.is_pinned}
        isStarred={item.is_starred}
        onPinPress={handlePinPress}
        onStarPress={handleStarPress}
        onDeletePress={handleDeletePress}
      />

      <GestureDetector gesture={cardGesture}>
        <Animated.View style={cardStyle}>
          <NoteCard
            title={item.title}
            content={item.content}
            categoryName={categoryName}
            isPinned={item.is_pinned}
            isStarred={item.is_starred}
            onPress={handlePress}
          />
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

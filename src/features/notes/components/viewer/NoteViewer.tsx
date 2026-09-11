import NoteViewerContent from "./NoteViewerContent";
import NoteViewerHeader from "./NoteViewerHeader";
import NoteViewerMeta from "./NoteViewerMeta";
import NoteViewerTitle from "./NoteViewerTitle";
import type { Note } from "@/features/notes/notes.types";
import { Platform, ScrollView, View } from "react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";
import Animated, {
  useAnimatedReaction,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useFrameCallback,
  useSharedValue,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import EditorBottomToolbar, {
  FLOATING_BOTTOM,
  FLOATING_TOUCH_HEIGHT,
} from "@/core/editor/components/editor-bottom-toolbar";
import {
  advanceToolbarScroll,
  resetToolbarScroll,
} from "@/core/editor/toolbar-interaction";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { useReadingProgress } from "../../hooks/useReadingProgress";
import {
  clamp,
  readingPercent,
  readingRange,
  textVersion,
  type ReadingGeometry,
  type ReadingPosition,
  type TextRow,
} from "../../reading/reading-position";
import {
  currentNavigation,
  orderNavigation,
  type ReadingNavigationEntry,
} from "../../reading/reading-navigation";
import ProgressBubble from "@/shared/ui/ProgressBubble/ProgressBubble";
import ReadingScrollbar from "./ReadingScrollbar";
import ReadingNavigationPanel from "./ReadingNavigationPanel";
import {
  BAR_HIDE_MS,
  BUBBLE_HIDE_MS,
  shouldHideReadingControls,
} from "../../reading/reading-interaction";

type NoteViewerProps = {
  note: Note;
  onBack: () => void;
  onEdit: () => void;
  navigationEntries?: readonly ReadingNavigationEntry[];
};

const EMPTY_ENTRIES: readonly ReadingNavigationEntry[] = [];
export default function NoteViewer(props: NoteViewerProps) {
  const { user } = useAuth();
  if (!user || (props.note.user_id != null && props.note.user_id !== user.id))
    return null;
  return (
    <NoteViewerSession
      key={`${user.id}:${props.note.id}:${textVersion(props.note.content ?? "")}`}
      {...props}
      ownerId={user.id}
    />
  );
}

function NoteViewerSession({
  note,
  onBack,
  onEdit,
  ownerId,
  navigationEntries = EMPTY_ENTRIES,
}: NoteViewerProps & { ownerId: number }) {
  const scroll = useRef(resetToolbarScroll());
  const visible = useSharedValue(true);
  const scrollRef = useAnimatedRef<ScrollView>();
  const container = useRef<View>(null);
  const offset = useSharedValue(0);
  const percent = useSharedValue(0);
  const programTarget = useSharedValue(-1);
  const finger = useSharedValue({ x: 0, y: 0 });
  const dragging = useSharedValue(false);
  const held = useSharedValue(false);
  const bar = useSharedValue(false);
  const bubble = useSharedValue(false);
  const activity = useSharedValue(0);
  const bubbleActivity = useSharedValue(0);
  const userStarted = useSharedValue(false);
  const lastReport = useSharedValue(0);
  const [shown, setShown] = useState({ bar: false, bubble: false });
  const [panel, setPanel] = useState(false);
  const [origin, setOrigin] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const [geometry, setGeometry] = useState<ReadingGeometry>({
    bodyTop: 0,
    bodyHeight: 0,
    viewport: 0,
    contentHeight: 0,
    rows: [],
  });
  const entries = useMemo(
    () => orderNavigation(navigationEntries),
    [navigationEntries],
  );
  const [navigation, setNavigation] = useState<{
    heading?: string;
    bookmarks: string[];
    ids: string[];
  }>({ bookmarks: [], ids: [] });
  const position = useCallback(
    (p: ReadingPosition) => {
      const current = currentNavigation(entries, p);
      const ids = [
        ...(current.heading ? [current.heading.id] : []),
        ...current.bookmarks.map((b) => b.id),
      ];
      setNavigation((previous) =>
        previous.ids.join("\0") === ids.join("\0")
          ? previous
          : {
              heading: current.heading?.title,
              bookmarks: current.bookmarks.map((b) => b.title),
              ids,
            },
      );
    },
    [entries],
  );
  const restore = useCallback(
    (target: number) => {
      programTarget.set(target);
      offset.set(target);
      scroll.current = resetToolbarScroll(target);
      scrollRef.current?.scrollTo({ y: target, animated: false });
    },
    [programTarget, offset, scrollRef],
  );
  const getOffset = useCallback(() => offset.get(), [offset]);
  const session = useReadingProgress({
    ownerId,
    noteId: note.id,
    serverId: note.server_id ?? (note.id > 0 ? note.id : null),
    content: note.content,
    restore,
    position,
    getOffset,
  });
  useEffect(() => {
    session.setGeometry(geometry);
  }, [session, geometry]);
  const range = readingRange(geometry);
  // Keep only numeric geometry in worklet closures; thousands of text rows remain on JS.
  const visualGeometry = useMemo(
    () => ({
      bodyTop: geometry.bodyTop,
      bodyHeight: geometry.bodyHeight,
      viewport: geometry.viewport,
      contentHeight: geometry.contentHeight,
    }),
    [
      geometry.bodyTop,
      geometry.bodyHeight,
      geometry.viewport,
      geometry.contentHeight,
    ],
  );
  useAnimatedReaction(
    () => readingPercent(offset.get(), visualGeometry),
    (value) => {
      percent.set(value);
    },
  );
  useAnimatedReaction(
    () => ({ bar: bar.get(), bubble: bubble.get() }),
    (value, previous) => {
      if (
        !previous ||
        value.bar !== previous.bar ||
        value.bubble !== previous.bubble
      )
        scheduleOnRN(setShown, value);
    },
  );
  useFrameCallback(() => {
    const now = Date.now();
    if (
      bar.get() &&
      shouldHideReadingControls(
        now,
        activity.get(),
        dragging.get(),
        held.get(),
        BAR_HIDE_MS,
      )
    )
      bar.set(false);
    // The bubble counts from the scrollbar release; scrolling the body never extends it.
    if (
      bubble.get() &&
      shouldHideReadingControls(
        now,
        bubbleActivity.get(),
        dragging.get(),
        held.get(),
        BUBBLE_HIDE_MS,
      )
    )
      bubble.set(false);
  });
  const begin = useCallback(() => {
    session.interact();
    programTarget.set(-1);
    userStarted.set(true);
    activity.set(Date.now());
    bar.set(true);
    container.current?.measureInWindow((x, y, width, height) =>
      setOrigin((previous) =>
        previous.x === x &&
        previous.y === y &&
        previous.width === width &&
        previous.height === height
          ? previous
          : { x, y, width, height },
      ),
    );
  }, [session, programTarget, userStarted, activity, bar]);
  const report = useCallback(
    (value: number) => {
      session.sample(value);
      const next = advanceToolbarScroll(scroll.current, value, false);
      if (next.visible !== scroll.current.visible) visible.set(next.visible);
      scroll.current = next;
    },
    [session, visible],
  );
  const end = useCallback(
    (value: number) => {
      report(value);
      void session.flush();
    },
    [report, session],
  );
  const scrollHandler = useAnimatedScrollHandler({
    onBeginDrag: () => {
      held.set(true);
      programTarget.set(-1);
      userStarted.set(true);
      bar.set(true);
      activity.set(Date.now());
      scheduleOnRN(begin);
    },
    onScroll: (event) => {
      const next = clamp(
        event.contentOffset.y,
        0,
        Math.max(0, event.contentSize.height - event.layoutMeasurement.height),
      );
      if (programTarget.get() >= 0) {
        if (Math.abs(next - programTarget.get()) > 2) return;
        programTarget.set(-1);
      }
      offset.set(next);
      if (!userStarted.get()) return;
      bar.set(true);
      activity.set(Date.now());
      if (Date.now() - lastReport.get() >= 100) {
        lastReport.set(Date.now());
        scheduleOnRN(report, next);
      }
    },
    onEndDrag: () => {
      held.set(false);
      activity.set(Date.now());
      scheduleOnRN(end, offset.get());
    },
    onMomentumBegin: () => {
      held.set(true);
    },
    onMomentumEnd: () => {
      held.set(false);
      activity.set(Date.now());
      scheduleOnRN(end, offset.get());
    },
  });
  const onBodyLayout = useCallback(
    (bodyTop: number, bodyHeight: number) =>
      setGeometry((g) =>
        g.bodyTop === bodyTop && g.bodyHeight === bodyHeight
          ? g
          : { ...g, bodyTop, bodyHeight },
      ),
    [],
  );
  const onRows = useCallback(
    (rows: TextRow[]) =>
      setGeometry((g) =>
        g.rows.length === rows.length &&
        g.rows.every(
          (r, i) =>
            r.start === rows[i].start &&
            r.end === rows[i].end &&
            r.y === rows[i].y &&
            r.height === rows[i].height,
        )
          ? g
          : { ...g, rows },
      ),
    [],
  );
  const closePanel = useCallback(() => setPanel(false), []);
  const openPanel = () => {
    end(offset.get());
    dragging.set(false);
    held.set(false);
    bubble.set(false);
    bar.set(false);
    setPanel(true);
  };
  useFocusEffect(
    useCallback(() => {
      scroll.current = resetToolbarScroll(scroll.current.offset);
      visible.set(true);
      return () => {
        bar.set(false);
        bubble.set(false);
        dragging.set(false);
        held.set(false);
      };
    }, [visible, bar, bubble, dragging, held]),
  );
  const toolbarStyle = useAnimatedStyle(() => ({
    display: visible.get() ? "flex" : "none",
  }));
  return (
    <View className="flex-1 bg-white">
      <NoteViewerHeader onBack={onBack} onEdit={onEdit} />

      <View
        ref={container}
        style={{ flex: 1 }}
        onLayout={(e) => {
          const { height } = e.nativeEvent.layout;
          setGeometry((g) =>
            g.viewport === height ? g : { ...g, viewport: height },
          );
          container.current?.measureInWindow((x, y, width, measuredHeight) =>
            setOrigin({ x, y, width, height: measuredHeight }),
          );
        }}
      >
        <Animated.ScrollView
          ref={scrollRef}
          className="flex-1"
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingTop: 18,
            paddingBottom: FLOATING_TOUCH_HEIGHT + FLOATING_BOTTOM + 12,
          }}
          showsVerticalScrollIndicator={false}
          scrollEventThrottle={16}
          onContentSizeChange={(_, contentHeight) =>
            setGeometry((g) =>
              g.contentHeight === contentHeight ? g : { ...g, contentHeight },
            )
          }
          onScroll={scrollHandler}
          onTouchStart={begin}
          {...(Platform.OS === "web"
            ? { onWheel: begin, onKeyDown: begin }
            : {})}
        >
          <NoteViewerTitle
            title={note.title}
            renderMeta={(titleControls) => (
              <NoteViewerMeta
                noteId={note.id}
                content={note.content}
                categoryId={note.category_id}
                createdAt={note.created_at}
                isTitleExpandable={titleControls.isTitleExpandable}
                chevronAnimatedStyle={titleControls.chevronAnimatedStyle}
                onToggleTitleExpanded={titleControls.onToggleTitleExpanded}
              />
            )}
          />
          <NoteViewerContent
            content={note.content}
            onBodyLayout={onBodyLayout}
            onRows={onRows}
          />
        </Animated.ScrollView>
        {!panel && shown.bar && (
          <ReadingScrollbar
            scrollRef={scrollRef}
            offset={offset}
            percent={percent}
            finger={finger}
            dragging={dragging}
            bubble={bubble}
            activity={activity}
            bubbleActivity={bubbleActivity}
            viewport={geometry.viewport}
            start={range.start}
            end={range.end}
            disabled={range.short || !geometry.rows.length}
            onBegin={begin}
            onEnd={end}
          />
        )}
        {!panel && shown.bubble && (
          <ProgressBubble
            finger={finger}
            percent={percent}
            origin={origin}
            heading={navigation.heading}
            bookmarks={navigation.bookmarks}
            onPress={openPanel}
            onHold={(value) => {
              held.set(value);
              activity.set(Date.now());
              bubbleActivity.set(Date.now());
            }}
          />
        )}
      </View>
      <Animated.View
        pointerEvents="box-none"
        style={[
          {
            position: "absolute",
            bottom: FLOATING_BOTTOM,
            alignSelf: "center",
          },
          toolbarStyle,
        ]}
      >
        <EditorBottomToolbar docked={false} disabled={false} onEdit={onEdit} />
      </Animated.View>
      <ReadingNavigationPanel
        visible={panel}
        entries={entries}
        currentIds={navigation.ids}
        onClose={closePanel}
        onJump={(entry) => {
          closePanel();
          session.jump(entry.line, entry.character ?? 0);
        }}
      />
    </View>
  );
}

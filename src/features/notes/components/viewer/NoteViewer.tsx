import NoteViewerContent from "./NoteViewerContent";
import NoteViewerHeader from "./NoteViewerHeader";
import NoteViewerMeta from "./NoteViewerMeta";
import NoteViewerTitle from "./NoteViewerTitle";
import type { Note } from "@/features/notes/notes.types";
import {
  AccessibilityInfo,
  ActivityIndicator,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
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
  TOOLBAR_RESTORE_DELAY_MS,
} from "@/core/editor/toolbar-interaction";
import {
  resolveInlineEditPress,
  type InlineEditField,
  type InlineEditPress,
} from "@/core/editor";
import { useKeyboardOverlap } from "@/core/editor/use-keyboard-overlap";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { useApplicationDatabase } from "@/core/database";
import { useReadingProgress } from "../../hooks/useReadingProgress";
import {
  useNoteDraft,
  type NoteDraftSaveSnapshot,
} from "../../hooks/useNoteDraft";
import { noteDraftValue, type NoteDraftValue } from "../../data/note-draft.repository";
import { stageEditedNoteForSync } from "../../services/note-save.service";
import { enqueueNoteExitSync } from "../../services/note-exit-sync-coordinator";
import {
  clamp,
  readingPercent,
  readingRange,
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
import { CircleAlert, RefreshCw } from "lucide-react-native";
import { colors } from "@/shared/theme";

type NoteViewerProps = {
  note: Note;
  onBack: () => void;
  initialEdit?: boolean;
  navigationEntries?: readonly ReadingNavigationEntry[];
};

const EMPTY_ENTRIES: readonly ReadingNavigationEntry[] = [];
export default function NoteViewer(props: NoteViewerProps) {
  const { user } = useAuth();
  if (!user || (props.note.user_id != null && props.note.user_id !== user.id))
    return null;
  return (
    <NoteViewerEditor
      key={`${user.id}:${props.note.id}`}
      {...props}
      ownerId={user.id}
    />
  );
}

function NoteViewerEditor(props: NoteViewerProps & { ownerId: number }) {
  const { note, ownerId } = props;
  const database = useApplicationDatabase();
  const [initialEditPending, setInitialEditPending] = useState(props.initialEdit ?? false);
  const beforeLeave = useCallback(async (snapshot: NoteDraftSaveSnapshot) => {
    if (!snapshot.target) throw new Error("原笔记已不存在，草稿已保留");
    if (!snapshot.value.title.trim()) throw new Error("请输入笔记标题");
    const staged = await stageEditedNoteForSync(
      database,
      ownerId,
      snapshot.target,
      {
        title: snapshot.value.title.trim(),
        content: snapshot.value.content.trim(),
        category_id: snapshot.value.categoryId,
      },
      snapshot.commit,
    );
    return staged.shouldUpload
      ? {
          afterLeave: () =>
            enqueueNoteExitSync(
              database,
              ownerId,
              staged.note.id,
              snapshot.commit,
            ),
        }
      : undefined;
  }, [database, ownerId]);
  const draft = useNoteDraft(
    ownerId,
    `note:${note.id}`,
    note,
    noteDraftValue(note),
    { beforeLeave },
  );

  if (!draft.resource) {
    return (
      <View className="flex-1 bg-white">
        <NoteViewerHeader onBack={props.onBack} />
        <View className="flex-1 items-center justify-center gap-3 px-5">
          {draft.error ? (
            <>
              <Text accessibilityRole="alert" className="text-center text-hyper-error">
                {draft.error}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="重试读取草稿"
                onPress={draft.retry}
                className="h-12 flex-row items-center justify-center gap-2 rounded-2xl bg-hyper-card px-4"
              >
                <RefreshCw size={18} color={colors.primary} />
                <Text className="text-primary">重试</Text>
              </Pressable>
            </>
          ) : (
            <ActivityIndicator color={colors.primary} />
          )}
        </View>
      </View>
    );
  }

  return (
    <NoteViewerSession
      key={draft.resource.row.session_id}
      {...props}
      initialEdit={initialEditPending}
      onInitialEditHandled={() => setInitialEditPending(false)}
      draft={draft}
      initialValue={draft.resource.session.value}
    />
  );
}

type NoteDraftController = ReturnType<typeof useNoteDraft>;

function NoteViewerSession({
  note,
  onBack,
  initialEdit = false,
  ownerId,
  navigationEntries = EMPTY_ENTRIES,
  draft,
  initialValue,
  onInitialEditHandled,
}: NoteViewerProps & {
  ownerId: number;
  draft: NoteDraftController;
  initialValue: NoteDraftValue;
  onInitialEditHandled: () => void;
}) {
  const [value, setValue] = useState(initialValue);
  const latestValue = useRef(initialValue);
  const mounted = useRef(true);
  const titleInput = useRef<TextInput>(null);
  const contentInput = useRef<TextInput>(null);
  const activeField = useRef<InlineEditField | null>(null);
  const lastPress = useRef<InlineEditPress | null>(null);
  const selections = useRef({
    title: { start: initialValue.title.length, end: initialValue.title.length },
    content: { start: initialValue.content.length, end: initialValue.content.length },
  });
  const pendingKeyboardField = useRef<InlineEditField | null>(null);
  const openingKeyboard = useRef(false);
  const openingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const webBlurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [keyboardAllowed, setKeyboardAllowed] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(() => Keyboard.isVisible());
  const {
    keyboardOverlap,
    stableContainer,
    onStableLayout,
    handleKeyboardEvent,
  } = useKeyboardOverlap();
  const [screenReaderEnabled, setScreenReaderEnabled] = useState(false);

  useEffect(() => {
    mounted.current = true;
    void AccessibilityInfo.isScreenReaderEnabled().then((enabled) => {
      if (mounted.current) setScreenReaderEnabled(enabled);
    });
    const accessibility = AccessibilityInfo.addEventListener(
      "screenReaderChanged",
      setScreenReaderEnabled,
    );
    return () => {
      mounted.current = false;
      accessibility.remove();
      if (openingTimer.current !== null) clearTimeout(openingTimer.current);
      if (webBlurTimer.current !== null) clearTimeout(webBlurTimer.current);
    };
  }, []);

  const changeValue = useCallback((next: NoteDraftValue) => {
    latestValue.current = next;
    setValue(next);
    draft.change(next);
  }, [draft]);

  const fieldInput = useCallback(
    (field: InlineEditField) => field === "title" ? titleInput.current : contentInput.current,
    [],
  );

  const requestKeyboard = useCallback((field: InlineEditField) => {
    if (draft.saving) return;
    activeField.current = field;
    if (keyboardAllowed || keyboardVisible) {
      fieldInput(field)?.focus();
      return;
    }
    pendingKeyboardField.current = field;
    openingKeyboard.current = true;
    setKeyboardAllowed(true);
  }, [draft.saving, fieldInput, keyboardAllowed, keyboardVisible]);

  useEffect(() => {
    if (!keyboardAllowed || pendingKeyboardField.current === null) return;
    const field = pendingKeyboardField.current;
    pendingKeyboardField.current = null;
    const input = fieldInput(field);
    const selection = selections.current[field];
    input?.blur();
    const frame = requestAnimationFrame(() => {
      input?.focus();
      requestAnimationFrame(() => input?.setNativeProps({ selection }));
    });
    if (openingTimer.current !== null) clearTimeout(openingTimer.current);
    openingTimer.current = setTimeout(() => {
      openingKeyboard.current = false;
      openingTimer.current = null;
    }, 1200);
    return () => cancelAnimationFrame(frame);
  }, [fieldInput, keyboardAllowed]);

  useEffect(() => {
    const shown = Keyboard.addListener("keyboardDidShow", (event) => {
      openingKeyboard.current = false;
      if (openingTimer.current !== null) clearTimeout(openingTimer.current);
      openingTimer.current = null;
      setKeyboardVisible(true);
      handleKeyboardEvent(true, event);
    });
    const hidden = Keyboard.addListener("keyboardDidHide", () => {
      openingKeyboard.current = false;
      setKeyboardVisible(false);
      setKeyboardAllowed(false);
      lastPress.current = null;
      handleKeyboardEvent(false);
      titleInput.current?.blur();
      contentInput.current?.blur();
      draft.requestFlush();
    });
    return () => {
      shown.remove();
      hidden.remove();
    };
  }, [draft, handleKeyboardEvent]);

  useEffect(() => {
    if (!initialEdit) return;
    const frame = requestAnimationFrame(() => {
      onInitialEditHandled();
      requestKeyboard("content");
    });
    return () => cancelAnimationFrame(frame);
  }, [initialEdit, onInitialEditHandled, requestKeyboard]);

  const pressInput = useCallback((field: InlineEditField) => {
    activeField.current = field;
    if (screenReaderEnabled) {
      requestKeyboard(field);
      return;
    }
    const result = resolveInlineEditPress(lastPress.current, field, performance.now());
    lastPress.current = result.next;
    if (result.openKeyboard) requestKeyboard(field);
  }, [requestKeyboard, screenReaderEnabled]);

  const focusInput = useCallback((field: InlineEditField) => {
    activeField.current = field;
  }, []);

  const blurInput = useCallback(() => {
    draft.requestFlush();
    if (Platform.OS !== "web" || openingKeyboard.current) return;
    if (webBlurTimer.current !== null) clearTimeout(webBlurTimer.current);
    webBlurTimer.current = setTimeout(() => {
      webBlurTimer.current = null;
      if (!titleInput.current?.isFocused() && !contentInput.current?.isFocused()) {
        setKeyboardAllowed(false);
      }
    }, 0);
  }, [draft]);

  const handleBack = useCallback(() => {
    if (keyboardVisible || Keyboard.isVisible()) {
      Keyboard.dismiss();
      return;
    }
    titleInput.current?.blur();
    contentInput.current?.blur();
    onBack();
  }, [keyboardVisible, onBack]);

  const confirmConflict = useCallback(async () => {
    try {
      await draft.confirmConflict();
    } catch {
      // useNoteDraft 已保留错误文案与草稿。
    }
  }, [draft]);

  const scroll = useRef(resetToolbarScroll());
  const toolbarRestoreTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
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
      if (toolbarRestoreTimer.current !== null) clearTimeout(toolbarRestoreTimer.current);
      if (!Keyboard.isVisible()) {
        toolbarRestoreTimer.current = setTimeout(() => {
          toolbarRestoreTimer.current = null;
          if (!Keyboard.isVisible()) {
            scroll.current = resetToolbarScroll(scroll.current.offset);
            visible.set(true);
          }
        }, TOOLBAR_RESTORE_DELAY_MS);
      }
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
      if (toolbarRestoreTimer.current !== null) clearTimeout(toolbarRestoreTimer.current);
      toolbarRestoreTimer.current = null;
      visible.set(true);
      return () => {
        if (toolbarRestoreTimer.current !== null) clearTimeout(toolbarRestoreTimer.current);
        toolbarRestoreTimer.current = null;
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
  const inputsEditable = !draft.saving;
  const showSoftInput = keyboardAllowed || screenReaderEnabled;
  const statusMessage = draft.error;
  return (
    <View ref={stableContainer} collapsable={false} className="flex-1 bg-white" onLayout={onStableLayout}>
      <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: keyboardOverlap }}>
      <NoteViewerHeader
        onBack={handleBack}
      />

      {(draft.resource?.conflict || statusMessage) && (
        <View className="mx-5 mt-2 flex-row items-center gap-2 rounded-2xl bg-red-50 px-3 py-2">
          <CircleAlert size={18} color={colors.hyperError} />
          <Text accessibilityRole="alert" className="flex-1 text-sm text-hyper-error">
            {statusMessage || "本地草稿基于旧版本，请核对后确认使用"}
          </Text>
          {draft.resource?.conflict && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="使用本地草稿"
              disabled={draft.saving}
              onPress={() => void confirmConflict()}
              className="min-h-11 justify-center px-2"
            >
              <Text className="text-sm font-semibold text-primary">使用本地草稿</Text>
            </Pressable>
          )}
        </View>
      )}

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
            paddingBottom: keyboardVisible ? 12 : FLOATING_TOUCH_HEIGHT + FLOATING_BOTTOM + 12,
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
            title={value.title}
            inputRef={titleInput}
            editable={inputsEditable}
            showSoftInputOnFocus={showSoftInput}
            onChangeText={(title) => changeValue({ ...latestValue.current, title })}
            onPressIn={() => pressInput("title")}
            onFocus={() => focusInput("title")}
            onBlur={blurInput}
            onSelectionChange={(event) => {
              selections.current.title = event.nativeEvent.selection;
            }}
            renderMeta={(titleControls) => (
              <NoteViewerMeta
                noteId={note.id}
                content={value.content}
                categoryId={note.category_id}
                createdAt={note.created_at}
                isTitleExpandable={titleControls.isTitleExpandable}
                chevronAnimatedStyle={titleControls.chevronAnimatedStyle}
                onToggleTitleExpanded={titleControls.onToggleTitleExpanded}
              />
            )}
          />
          <NoteViewerContent
            content={value.content}
            inputRef={contentInput}
            editable={inputsEditable}
            showSoftInputOnFocus={showSoftInput}
            onChangeText={(content) => changeValue({ ...latestValue.current, content })}
            onPressIn={() => pressInput("content")}
            onFocus={() => focusInput("content")}
            onBlur={blurInput}
            onSelectionChange={(event) => {
              selections.current.content = event.nativeEvent.selection;
            }}
            onBodyLayout={onBodyLayout}
            onRows={onRows}
          />
        </Animated.ScrollView>
        {!keyboardVisible && !panel && shown.bar && (
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
        {!keyboardVisible && !panel && shown.bubble && (
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
      {keyboardVisible ? (
        <EditorBottomToolbar docked disabled={draft.saving} onEdit={() => requestKeyboard("content")} />
      ) : (
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
          <EditorBottomToolbar docked={false} disabled={draft.saving} onEdit={() => requestKeyboard("content")} />
        </Animated.View>
      )}
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
    </View>
  );
}

import { colors } from "@/shared/theme";
import { BackButton } from "@/shared/ui";
import { Check } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import {
    ActivityIndicator,
    Keyboard,
    Platform,
    Pressable,
    ScrollView,
    Text,
    TextInput,
    View,
    type KeyboardEvent,
} from "react-native";
import Animated, { useAnimatedStyle, useSharedValue } from "react-native-reanimated";
import EditorBottomToolbar, { FLOATING_BOTTOM, FLOATING_TOUCH_HEIGHT } from "./editor-bottom-toolbar";
import {
    advanceToolbarScroll,
    EDIT_PRESS_INTERVAL_MS,
    FOCUS_TIMEOUT_MS,
    resetToolbarScroll,
    TOOLBAR_RESTORE_DELAY_MS,
} from "../toolbar-interaction";
import { useKeyboardOverlap } from "../use-keyboard-overlap";
import type {
    PlainTextEditorProps,
    PlainTextEditorValue,
} from "../editor.types";

const CONTENT_END_GAP = 12;

/**
 * 纯文本编辑器外壳，只维护临时输入状态和通用交互。
 * 业务校验、持久化、缓存及页面跳转由调用方负责。
 */
export default function PlainTextEditor({
    initialValue,
    autoFocusContent = false,
    screenTitle,
    titlePlaceholder = "输入标题...",
    contentPlaceholder = "输入内容...",
    saving = false,
    disabled = false,
    onChange,
    onBlur,
    statusContent,
    headerActions,
    onCancel,
    onSubmit,
}: PlainTextEditorProps) {
    const [value, setValue] = useState<PlainTextEditorValue>(initialValue);
    const latest = useRef(value);
    const controlsDisabled = saving || disabled;
    const contentInput = useRef<TextInput>(null);
    const [contentHeight, setContentHeight] = useState(0);
    const [viewportHeight, setViewportHeight] = useState(0);
    const [keyboardVisible, setKeyboardVisible] = useState(() => Keyboard.isVisible());
    const keyboardOpen = useRef(Keyboard.isVisible());
    const {
        keyboardOverlap,
        stableContainer,
        onStableLayout,
        handleKeyboardEvent,
    } = useKeyboardOverlap();
    const focusLocked = useRef(false);
    const lastPress = useRef(-Infinity);
    const focusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const focusFrame = useRef<number | null>(null);
    const blocked = useRef(controlsDisabled);
    const scroll = useRef(resetToolbarScroll());
    const toolbarRestoreTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const floatingVisible = useSharedValue(true);
    const floatingStyle = useAnimatedStyle(() => ({
        display: floatingVisible.get() ? "flex" : "none",
    }));
    // 留白属于滚动内容，而非 TextInput 内边距或正文视口外的占位。
    const contentEndSpace = keyboardVisible ? CONTENT_END_GAP
        : FLOATING_TOUCH_HEIGHT + FLOATING_BOTTOM + CONTENT_END_GAP;

    const releaseFocusLock = () => {
        focusLocked.current = false;
        if (focusTimer.current !== null) clearTimeout(focusTimer.current);
        focusTimer.current = null;
    };

    const clearToolbarRestoreTimer = () => {
        if (toolbarRestoreTimer.current !== null) clearTimeout(toolbarRestoreTimer.current);
        toolbarRestoreTimer.current = null;
    };

    const scheduleToolbarRestore = () => {
        clearToolbarRestoreTimer();
        if (keyboardOpen.current) return;
        toolbarRestoreTimer.current = setTimeout(() => {
            toolbarRestoreTimer.current = null;
            if (!keyboardOpen.current) {
                scroll.current = resetToolbarScroll(scroll.current.offset);
                floatingVisible.set(true);
            }
        }, TOOLBAR_RESTORE_DELAY_MS);
    };

    useEffect(() => {
        blocked.current = controlsDisabled;
        if (controlsDisabled) {
            if (focusFrame.current !== null) cancelAnimationFrame(focusFrame.current);
            focusFrame.current = null;
            releaseFocusLock();
        }
    }, [controlsDisabled]);

    useEffect(() => {
        const updateKeyboard = (visible: boolean, event?: KeyboardEvent) => {
            keyboardOpen.current = visible;
            setKeyboardVisible(visible);
            scroll.current = resetToolbarScroll(scroll.current.offset);
            clearToolbarRestoreTimer();
            floatingVisible.set(true);
            handleKeyboardEvent(visible, event);
            releaseFocusLock();
        };
        const show = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow", (event) => updateKeyboard(true, event));
        const frame = Platform.OS === "ios" ? Keyboard.addListener("keyboardWillChangeFrame", (event) => {
            if (keyboardOpen.current) updateKeyboard(true, event);
        }) : null;
        const hide = Keyboard.addListener("keyboardDidHide", () => updateKeyboard(false));
        return () => {
            show.remove(); hide.remove(); frame?.remove(); releaseFocusLock(); clearToolbarRestoreTimer();
            if (focusFrame.current !== null) cancelAnimationFrame(focusFrame.current);
        };
    }, [handleKeyboardEvent, floatingVisible]);

    const editContent = () => {
        const now = performance.now();
        if (controlsDisabled || focusLocked.current || now - lastPress.current < EDIT_PRESS_INTERVAL_MS) return;
        if (contentInput.current?.isFocused() && keyboardOpen.current) return;
        lastPress.current = now;
        focusLocked.current = true;
        // Android 返回键可能只收起键盘而保留焦点，此时先失焦再重新请求。
        if (contentInput.current?.isFocused() && !keyboardOpen.current) contentInput.current.blur();
        focusTimer.current = setTimeout(releaseFocusLock, FOCUS_TIMEOUT_MS);
        focusFrame.current = requestAnimationFrame(() => {
            focusFrame.current = null;
            if (!blocked.current) contentInput.current?.focus();
        });
    };

    const change = (next: PlainTextEditorValue) => {
        if (controlsDisabled) return;
        latest.current = next;
        setValue(next);
        onChange?.(next);
    };

    const setTitle = (title: string) => {
        change({ ...latest.current, title });
    };

    const setContent = (content: string) => {
        change({ ...latest.current, content });
    };

    return (
        <View ref={stableContainer} collapsable={false} className="flex-1 bg-white" onLayout={onStableLayout}>
        <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: keyboardOverlap }}>
            <View className="flex-row items-center justify-between border-b border-border-soft px-4 pb-3 pt-3">
                <BackButton
                    onPress={onCancel}
                    disabled={controlsDisabled}
                    accessibilityLabel="返回"
                />

                <View pointerEvents="none" style={{ position: "absolute", left: 104, right: 104, top: 0, bottom: 0, justifyContent: "center" }}>
                    <Text numberOfLines={1} className="text-center text-[18px] font-semibold text-gray-800">
                        {screenTitle}
                    </Text>
                </View>

                <View className="flex-row items-center gap-1">
                    {headerActions}
                    <Pressable
                        onPress={() => void onSubmit(latest.current)}
                        disabled={controlsDisabled}
                        accessibilityRole="button"
                        accessibilityLabel="保存"
                        accessibilityState={{ disabled: controlsDisabled }}
                        className="p-2"
                    >
                        {saving ? (
                            <ActivityIndicator
                                size="small"
                                color={colors.primary}
                            />
                        ) : (
                            <Check size={24} color={colors.primary} />
                        )}
                    </Pressable>
                </View>
            </View>

            {statusContent}

            <TextInput
                value={value.title}
                onChangeText={setTitle}
                onBlur={onBlur}
                editable={!controlsDisabled}
                placeholder={titlePlaceholder}
                accessibilityLabel="标题"
                className="border-b border-border-soft px-5 py-4 text-[22px] font-semibold text-gray-900"
            />
            <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{ flexGrow: 1, paddingBottom: contentEndSpace }}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="none"
                automaticallyAdjustKeyboardInsets={false}
                scrollEventThrottle={16}
                onLayout={(event) => {
                    const height = Math.ceil(event.nativeEvent.layout.height);
                    setViewportHeight((current) => current === height ? current : height);
                }}
                onScroll={(event) => {
                    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
                    const offset = Math.min(contentOffset.y, Math.max(0, contentSize.height - layoutMeasurement.height));
                    const next = advanceToolbarScroll(scroll.current, offset,
                        keyboardOpen.current || focusLocked.current);
                    if (next.visible !== scroll.current.visible) floatingVisible.set(next.visible);
                    scroll.current = next;
                    scheduleToolbarRestore();
                }}
            >
                <TextInput
                    ref={contentInput}
                    autoFocus={autoFocusContent && !controlsDisabled}
                    value={value.content}
                    onChangeText={setContent}
                    onBlur={onBlur}
                    editable={!controlsDisabled}
                    placeholder={contentPlaceholder}
                    accessibilityLabel="正文"
                    multiline
                    scrollEnabled={false}
                    onContentSizeChange={(event) => {
                        const height = Math.ceil(event.nativeEvent.contentSize.height);
                        setContentHeight((current) => current === height ? current : height);
                    }}
                    textAlignVertical="top"
                    style={{ height: Math.max(80, contentHeight, viewportHeight - contentEndSpace),
                        paddingHorizontal: 20, paddingVertical: 16 }}
                    className="text-[16px] text-gray-700"
                />
            </ScrollView>
            {keyboardVisible && <EditorBottomToolbar docked disabled={controlsDisabled} onEdit={editContent} />}
            {!keyboardVisible && <Animated.View pointerEvents="box-none"
                style={[{ position: "absolute", bottom: FLOATING_BOTTOM, alignSelf: "center" }, floatingStyle]}>
                <EditorBottomToolbar docked={false} disabled={controlsDisabled} onEdit={editContent} />
            </Animated.View>}
        </View>
        </View>
    );
}

import { colors } from "@/shared/theme";
import { ArrowLeft, Check } from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import {
    ActivityIndicator,
    Dimensions,
    Keyboard,
    Platform,
    Pressable,
    ScrollView,
    StatusBar,
    Text,
    TextInput,
    View,
    type KeyboardEvent,
} from "react-native";
import Animated, { useAnimatedStyle, useSharedValue } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { remainingKeyboardOverlap } from "../keyboard-layout";
import EditorBottomToolbar, { FLOATING_BOTTOM, FLOATING_TOUCH_HEIGHT } from "./editor-bottom-toolbar";
import { advanceToolbarScroll, EDIT_PRESS_INTERVAL_MS, FOCUS_TIMEOUT_MS, resetToolbarScroll } from "../toolbar-interaction";
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
    const container = useRef<View>(null);
    const contentInput = useRef<TextInput>(null);
    const [contentHeight, setContentHeight] = useState(0);
    const [viewportHeight, setViewportHeight] = useState(0);
    const [keyboardVisible, setKeyboardVisible] = useState(() => Keyboard.isVisible());
    const [keyboardOverlap, setKeyboardOverlap] = useState(0);
    const keyboardOpen = useRef(Keyboard.isVisible());
    const keyboardTop = useRef<number | null>(Keyboard.metrics?.()?.screenY ?? null);
    const keyboardHeight = useRef(Keyboard.metrics?.()?.height ?? 0);
    const restingBottom = useRef<number | null>(null);
    const insets = useSafeAreaInsets();
    const bottomInset = useRef(insets.bottom);
    const layoutFrame = useRef<number | null>(null);
    const measurement = useRef(0);
    const alive = useRef(true);
    const focusLocked = useRef(false);
    const lastPress = useRef(-Infinity);
    const focusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const focusFrame = useRef<number | null>(null);
    const blocked = useRef(controlsDisabled);
    const scroll = useRef(resetToolbarScroll());
    const floatingVisible = useSharedValue(true);
    const floatingStyle = useAnimatedStyle(() => ({
        display: floatingVisible.get() ? "flex" : "none",
    }));
    // 留白属于滚动内容，而非 TextInput 内边距或正文视口外的占位。
    const contentEndSpace = keyboardVisible ? CONTENT_END_GAP
        : FLOATING_TOUCH_HEIGHT + FLOATING_BOTTOM + CONTENT_END_GAP;

    // 测量不参与避让的外层，避免自身布局变化造成累计偏移；窗口已缩小时重叠自然为 0。
    const measureKeyboardOverlap = useCallback(() => {
        const request = ++measurement.current;
        container.current?.measureInWindow((_x, y, _width, height) => {
            if (!alive.current || request !== measurement.current) return;
            const top = keyboardTop.current;
            const bottom = y + height;
            if (!keyboardOpen.current) {
                restingBottom.current = bottom;
                setKeyboardOverlap(0);
                return;
            }
            if (Platform.OS === "android" && keyboardHeight.current > 0) {
                // 首次进入时键盘可能已打开。全面屏的窗口测量原点扣除了状态栏。
                const baseline = restingBottom.current ?? Dimensions.get("screen").height
                    - (StatusBar.currentHeight ?? 0) - bottomInset.current;
                setKeyboardOverlap(remainingKeyboardOverlap(keyboardHeight.current, baseline, bottom, height));
            } else {
                setKeyboardOverlap(top === null ? 0 : Math.max(0, Math.min(height, bottom - top)));
            }
        });
    }, []);

    const scheduleKeyboardMeasurement = useCallback(() => {
        measureKeyboardOverlap();
        if (layoutFrame.current !== null) cancelAnimationFrame(layoutFrame.current);
        layoutFrame.current = requestAnimationFrame(() => {
            layoutFrame.current = null;
            measureKeyboardOverlap();
        });
    }, [measureKeyboardOverlap]);

    useEffect(() => {
        bottomInset.current = insets.bottom;
        scheduleKeyboardMeasurement();
    }, [insets.bottom, scheduleKeyboardMeasurement]);

    const releaseFocusLock = () => {
        focusLocked.current = false;
        if (focusTimer.current !== null) clearTimeout(focusTimer.current);
        focusTimer.current = null;
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
        alive.current = true;
        const updateKeyboard = (visible: boolean, event?: KeyboardEvent) => {
            keyboardOpen.current = visible;
            keyboardTop.current = visible ? event?.endCoordinates.screenY ?? Keyboard.metrics?.()?.screenY ?? null : null;
            keyboardHeight.current = visible ? event?.endCoordinates.height ?? Keyboard.metrics?.()?.height ?? 0 : 0;
            setKeyboardVisible(visible);
            scroll.current = resetToolbarScroll(scroll.current.offset);
            floatingVisible.set(true);
            scheduleKeyboardMeasurement();
            releaseFocusLock();
        };
        const show = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow", (event) => updateKeyboard(true, event));
        const frame = Platform.OS === "ios" ? Keyboard.addListener("keyboardWillChangeFrame", (event) => {
            if (keyboardOpen.current) updateKeyboard(true, event);
        }) : null;
        const dimensions = Dimensions.addEventListener("change", scheduleKeyboardMeasurement);
        const hide = Keyboard.addListener("keyboardDidHide", () => updateKeyboard(false));
        scheduleKeyboardMeasurement();
        return () => {
            alive.current = false;
            show.remove(); hide.remove(); frame?.remove(); dimensions.remove(); releaseFocusLock();
            if (layoutFrame.current !== null) cancelAnimationFrame(layoutFrame.current);
            if (focusFrame.current !== null) cancelAnimationFrame(focusFrame.current);
        };
    }, [scheduleKeyboardMeasurement, floatingVisible]);

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
        <View ref={container} collapsable={false} className="flex-1 bg-white" onLayout={scheduleKeyboardMeasurement}>
        <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: keyboardOverlap }}>
            <View className="flex-row items-center justify-between border-b border-border-soft px-4 pb-3 pt-3">
                <Pressable
                    onPress={onCancel}
                    disabled={controlsDisabled}
                    accessibilityRole="button"
                    accessibilityLabel="返回"
                    className="p-2"
                >
                    <ArrowLeft size={24} color={colors.textPrimary} />
                </Pressable>

                <Text className="text-[18px] font-semibold text-gray-800">
                    {screenTitle}
                </Text>

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

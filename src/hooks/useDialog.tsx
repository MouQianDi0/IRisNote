import { useState, useCallback } from "react";
import { Modal, Pressable, Text, TouchableWithoutFeedback, View } from "react-native";

// 弹窗配置类型
type DialogConfig = {
    title?: string;
    message?: string;
    confirmText?: string;
    cancelText?: string;
    onConfirm?: () => void;
    onCancel?: () => void;
    showCancel?: boolean;
};

// Hook 返回类型
type UseDialogReturn = {
    visible: boolean;
    config: DialogConfig;
    show: (config?: DialogConfig) => void;
    hide: () => void;
    confirm: (config?: DialogConfig) => Promise<boolean>;
};

// 自定义弹窗 Hook
export function useDialog(): UseDialogReturn {
    const [visible, setVisible] = useState(false);
    const [config, setConfig] = useState<DialogConfig>({});

    // 显示弹窗
    const show = useCallback((newConfig?: DialogConfig) => {
        setConfig(newConfig || {});
        setVisible(true);
    }, []);

    // 隐藏弹窗
    const hide = useCallback(() => {
        setVisible(false);
        setConfig({});
    }, []);

    // Promise 版本：等待用户确认
    const confirm = useCallback((newConfig?: DialogConfig): Promise<boolean> => {
        return new Promise((resolve) => {
            setConfig({
                ...newConfig,
                onConfirm: () => {
                    newConfig?.onConfirm?.();
                    hide();
                    resolve(true);
                },
                onCancel: () => {
                    newConfig?.onCancel?.();
                    hide();
                    resolve(false);
                },
            });
            setVisible(true);
        });
    }, [hide]);

    return { visible, config, show, hide, confirm };
}

// 弹窗组件
type DialogProps = {
    visible: boolean;
    title?: string;
    message?: string;
    confirmText?: string;
    cancelText?: string;
    showCancel?: boolean;
    onConfirm?: () => void;
    onCancel?: () => void;
};

export function Dialog({
    visible,
    title = "提示",
    message = "",
    confirmText = "确定",
    cancelText = "取消",
    showCancel = true,
    onConfirm,
    onCancel,
}: DialogProps) {
    return (
        <Modal visible={visible} transparent animationType="fade">
            <TouchableWithoutFeedback onPress={onCancel}>
                <View className="flex-1 bg-black/40 justify-center items-center">
                    <TouchableWithoutFeedback>
                        <View className="bg-white rounded-[16px] p-5 w-[280px] shadow-lg">
                            {/* 标题 */}
                            <Text className="text-[16px] font-semibold text-gray-800 text-center mb-2">
                                {title}
                            </Text>
                            {/* 消息内容 */}
                            {message ? (
                                <Text className="text-[14px] text-gray-500 text-center mb-5">
                                    {message}
                                </Text>
                            ) : null}
                            {/* 按钮区域 */}
                            <View className="flex-row gap-3">
                                {showCancel && (
                                    <Pressable
                                        className="flex-1 py-3 rounded-[10px] bg-gray-100"
                                        onPress={onCancel}
                                    >
                                        <Text className="text-[14px] text-gray-600 text-center">
                                            {cancelText}
                                        </Text>
                                    </Pressable>
                                )}
                                <Pressable
                                    className="flex-1 py-3 rounded-[10px] bg-blue-500"
                                    onPress={onConfirm}
                                >
                                    <Text className="text-[14px] text-white text-center">
                                        {confirmText}
                                    </Text>
                                </Pressable>
                            </View>
                        </View>
                    </TouchableWithoutFeedback>
                </View>
            </TouchableWithoutFeedback>
        </Modal>
    );
}

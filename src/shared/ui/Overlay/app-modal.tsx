import { use, useId, useLayoutEffect } from "react";
import { Modal, type ModalProps } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { ModalDepthContext, OverlaySlot, useOverlay } from "./overlay-context";

/** Keeps global overlays above this native window without duplicating their state. */
export function AppModal({ children, visible = true, ...props }: ModalProps) {
    const id = useId();
    const depth = use(ModalDepthContext) + 1;
    const register = useOverlay()?.register;
    useLayoutEffect(() => {
        if (visible) return register?.(id, depth);
    }, [visible, id, depth, register]);
    return (
        <Modal {...props} visible={visible}>
            <ModalDepthContext value={depth}>
                <GestureHandlerRootView style={{ flex: 1 }}>
                    {children}
                    {visible && <OverlaySlot id={id} />}
                </GestureHandlerRootView>
            </ModalDepthContext>
        </Modal>
    );
}

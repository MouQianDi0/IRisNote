type FloatingMenuVisibilityListener = (hidden: boolean) => void;

let floatingMenuHidden = false;
const floatingMenuVisibilityListeners: FloatingMenuVisibilityListener[] = [];

export const getFloatingMenuHidden = () => floatingMenuHidden;

export const setFloatingMenuHidden = (hidden: boolean) => {
    if (floatingMenuHidden === hidden) return;

    floatingMenuHidden = hidden;
    floatingMenuVisibilityListeners.forEach((fn) => fn(hidden));
};

export const onFloatingMenuVisibilityChanged = (
    fn: FloatingMenuVisibilityListener,
) => {
    floatingMenuVisibilityListeners.push(fn);
    return () => {
        const index = floatingMenuVisibilityListeners.indexOf(fn);
        if (index >= 0) floatingMenuVisibilityListeners.splice(index, 1);
    };
};

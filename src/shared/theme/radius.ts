import source from "./presets/default-light.json";
import type { AppRadii } from "./theme.types";

/** 新公共组件使用的语义圆角。 */
export const radii = Object.freeze(source.radii) satisfies AppRadii;

/**
 * 旧调用方兼容圆角；迁移完成前保留原值，防止无关控件发生视觉变化。
 */
export const radius = Object.freeze({
    ...source.legacyRadii,
    full: source.radii.full,
    iconControl: source.radii.iconControl,
    field: source.radii.field,
    iconCell: source.radii.iconCell,
    progressBubble: source.radii.progressBubble,
});

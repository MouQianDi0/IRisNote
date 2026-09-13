import { legacyColors } from "./palette";

/**
 * 旧调用方兼容颜色对象。
 *
 * 真实色值由 presets/default-light.json 统一提供；新公共组件应改用
 * semanticColors 或 componentRecipes，不再扩展这个兼容对象。
 */
export const colors = legacyColors;

export type ThemeColor = keyof typeof colors;

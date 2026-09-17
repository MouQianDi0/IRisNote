import { tv } from "tailwind-variants";

/**
 * 共享 HyperOS 弹窗与选择列表的样式配方。
 *
 * 视觉规格见 docs/UI/IRisNote视觉设计规范.md；颜色与圆角值由 global.css 的
 * hyper-* Token 维护，这里只组合语义类名，避免出现第二个数据源。
 */

/** 静态外壳：遮罩、卡片与标题（规格 §4）。标题用 HyperOS title2（24px）。 */
export const dialogScrim =
  "flex-1 items-center justify-center bg-hyper-scrim p-6";
export const dialogCard =
  "w-full max-w-[440px] max-h-[85%] rounded-hyper-modal bg-white p-6";
export const dialogTitle = "flex-1 text-2xl leading-8 text-black";

/** 选择列表行主文字：浏览态选中变主色，删除态勾选变错误色（规格 §5）。 */
export const draftTitleStyles = tv({
  base: "text-[17px]",
  variants: {
    tone: {
      default: "text-black",
      selected: "text-primary",
      danger: "text-hyper-error",
    },
  },
  defaultVariants: {
    tone: "default",
  },
});

/** 行副文本（元信息）：跟随主文字同调取色（规格 §5）。 */
export const draftSummaryStyles = tv({
  base: "mt-1 text-[13px]",
  variants: {
    tone: {
      default: "text-hyper-text-secondary",
      selected: "text-primary",
      danger: "text-hyper-error",
    },
  },
  defaultVariants: {
    tone: "default",
  },
});

/** 选择列表行（规格 §5）：仅选中行有极浅蓝底（hyper-list-selected），与容器底 hyper-list 成对。 */
export const draftRowStyles = tv({
  base: "min-h-[56px] flex-row items-center gap-3 px-4 py-3",
  variants: {
    selected: {
      true: "bg-hyper-list-selected",
      false: "",
    },
  },
  defaultVariants: {
    selected: false,
  },
});

/** 弹窗按钮（规格 §6.1）：label 文字由 DialogButton 渲染，这里只管容器。
 *  禁用态用显式浅色 token（hyper-*-disabled），不用透明度叠加；按压整体 opacity 0.85。
 *  tonal = 弱化带底：浅灰底 + 主色文字（规格 §6.1 弱化层）。 */
export const dialogButtonStyles = tv({
  base: "flex-row items-center justify-center rounded-hyper-control",
  variants: {
    variant: {
      primary: "h-12 bg-primary",
      secondary: "h-12 bg-hyper-card",
      tonal: "h-12 bg-hyper-card",
      danger: "h-12 bg-hyper-error",
      text: "h-11 bg-transparent",
    },
    disabled: {
      true: "",
      false: "",
    },
    pressed: {
      true: "opacity-85",
      false: "",
    },
  },
  defaultVariants: {
    variant: "primary",
    disabled: false,
    pressed: false,
  },
  compoundVariants: [
    { variant: "primary", disabled: true, class: "bg-hyper-primary-disabled" },
    {
      variant: "secondary",
      disabled: true,
      class: "bg-hyper-secondary-disabled",
    },
    { variant: "tonal", disabled: true, class: "bg-hyper-secondary-disabled" },
    { variant: "danger", disabled: true, class: "bg-hyper-danger-disabled" },
  ],
});

export const dialogButtonLabelStyles = tv({
  base: "text-[17px]",
  variants: {
    variant: {
      primary: "text-white",
      secondary: "text-black",
      tonal: "text-primary",
      danger: "text-white",
      text: "text-primary",
    },
    disabled: {
      true: "",
      false: "",
    },
  },
  defaultVariants: {
    variant: "primary",
    disabled: false,
  },
  compoundVariants: [
    {
      variant: "secondary",
      disabled: true,
      class: "text-hyper-label-disabled",
    },
    { variant: "tonal", disabled: true, class: "text-hyper-primary-faded" },
    { variant: "text", disabled: true, class: "text-hyper-primary-faded" },
    { variant: "danger", disabled: true, class: "text-hyper-error" },
  ],
});

export type DialogButtonVariant =
  "primary" | "secondary" | "tonal" | "danger" | "text";

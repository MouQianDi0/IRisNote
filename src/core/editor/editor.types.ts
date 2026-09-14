export type PlainTextEditorValue = {
  title: string;
  content: string;
};

export type PlainTextEditorProps = {
  autoFocusContent?: boolean;
  initialValue: PlainTextEditorValue;
  screenTitle?: string;
  titlePlaceholder?: string;
  contentPlaceholder?: string;
  saving?: boolean;
  disabled?: boolean;
  onChange?: (value: PlainTextEditorValue) => void;
  onBlur?: () => void;
  statusContent?: import("react").ReactNode;
  /** 顶栏保存按钮左侧的额外操作（如新建笔记的草稿入口），不传则布局不变。 */
  headerActions?: import("react").ReactNode;
  onCancel: () => void;
  onSubmit: (value: PlainTextEditorValue) => void | Promise<void>;
};

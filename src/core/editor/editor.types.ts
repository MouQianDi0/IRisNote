export type PlainTextEditorValue = {
    title: string;
    content: string;
};

export type PlainTextEditorProps = {
    autoFocusContent?: boolean;
    initialValue: PlainTextEditorValue;
    screenTitle: string;
    titlePlaceholder?: string;
    contentPlaceholder?: string;
    saving?: boolean;
    disabled?: boolean;
    onChange?: (value: PlainTextEditorValue) => void;
    onBlur?: () => void;
    statusContent?: import("react").ReactNode;
    onCancel: () => void;
    onSubmit: (value: PlainTextEditorValue) => void | Promise<void>;
};

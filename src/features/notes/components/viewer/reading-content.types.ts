import type { RefObject } from "react";
import type { TextInput, TextInputProps } from "react-native";
import type { TextRow } from "../../reading/reading-position";
export type NoteViewerContentProps = {
  content: string;
  inputRef: RefObject<TextInput | null>;
  editable: boolean;
  showSoftInputOnFocus: boolean;
  onChangeText: (value: string) => void;
  onPressIn: NonNullable<TextInputProps["onPressIn"]>;
  onFocus: NonNullable<TextInputProps["onFocus"]>;
  onBlur: NonNullable<TextInputProps["onBlur"]>;
  onSelectionChange: NonNullable<TextInputProps["onSelectionChange"]>;
  onBodyLayout: (top: number, height: number) => void;
  onRows: (rows: TextRow[]) => void;
};

import type { TextRow } from "../../reading/reading-position";
export type NoteViewerContentProps = {
  content: string | null;
  onBodyLayout: (top: number, height: number) => void;
  onRows: (rows: TextRow[]) => void;
};

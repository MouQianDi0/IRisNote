import { Share } from "react-native";
import {
  formatNoteText,
  type ShareableNote,
} from "@/components/Note/NoteShare/CopyNoteToClipboard";

export const shareNote = async (note: ShareableNote) => {
  return Share.share({
    title: note.title,
    message: formatNoteText(note),
  });
};

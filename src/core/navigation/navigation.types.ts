import type {
    Bolt,
    ClipboardPenLine,
    PencilLine,
    SquareCheckBig,
} from "lucide-react-native";

export type TabKey = "note" | "todo" | "excerpt" | "user";

export type MainAction = {
    icon:
        | typeof PencilLine
        | typeof SquareCheckBig
        | typeof ClipboardPenLine
        | typeof Bolt;
    route: string;
};

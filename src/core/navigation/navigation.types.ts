import type { LucideIcon } from "lucide-react-native";

export type TabKey = "note" | "todo" | "excerpt" | "user";

export type MainAction = {
    icon: LucideIcon;
    label: string;
    route: string;
};

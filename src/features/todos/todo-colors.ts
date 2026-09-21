import { palette } from "@/shared/theme";
import type { TodoDisplayState } from "./todos.types";

export const todoColors: Record<
  TodoDisplayState,
  { surface: string; accent: string }
> = {
  low: { surface: palette.todoLowSurface, accent: palette.todoLowAccent },
  normal: {
    surface: palette.todoNormalSurface,
    accent: palette.todoNormalAccent,
  },
  high: { surface: palette.todoHighSurface, accent: palette.todoHighAccent },
  done: { surface: palette.todoDoneSurface, accent: palette.todoDoneAccent },
  ended: { surface: palette.todoEndedSurface, accent: palette.todoEndedAccent },
};

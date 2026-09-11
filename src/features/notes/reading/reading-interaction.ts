import { clamp } from "./reading-position";
// The scrollbar lingers after scrolling stops; the bubble belongs to the grab and hides sooner.
export const BAR_HIDE_MS = 5000;
export const BUBBLE_HIDE_MS = 1000;
export function shouldHideReadingControls(
  now: number,
  lastInteraction: number,
  dragging: boolean,
  held: boolean,
  hideAfterMs: number,
) {
  "worklet";
  return !dragging && !held && now - lastInteraction >= hideAfterMs;
}
export function dragReadingOffset(
  initial: number,
  translation: number,
  travel: number,
  start: number,
  end: number,
) {
  "worklet";
  return (
    start +
    clamp((initial + translation) / Math.max(1, travel), 0, 1) * (end - start)
  );
}

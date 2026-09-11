export function bubblePosition(
  x: number,
  y: number,
  width: number,
  height: number,
  bounds: { left: number; top: number; right: number; bottom: number },
) {
  "worklet";
  // The anchor is the lower-right corner, 50px left and 100px above the finger.
  const left = Math.max(
    bounds.left + 8,
    Math.min(x - 50 - width, bounds.right - 8 - width),
  );
  const top = Math.max(
    bounds.top + 8,
    Math.min(y - 100 - height, bounds.bottom - 8 - height),
  );
  return { left, top };
}

import type { TextRow } from "./reading-position";

/** Measure our own single text node via DOM Range. Binary search each visual row. */
export function measureReadingText(
  element: HTMLElement,
  text: string,
): TextRow[] {
  const lineHeight =
    Number.parseFloat(getComputedStyle(element).lineHeight) || 28;
  if (!text.length) return [{ start: 0, end: 0, y: 0, height: lineHeight }];
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  const nodes: { node: Node; start: number; end: number }[] = [];
  let node: Node | null,
    total = 0;
  while ((node = walker.nextNode())) {
    const length = node.textContent?.length ?? 0;
    nodes.push({ node, start: total, end: total + length });
    total += length;
  }
  if (total !== text.length || !nodes.length) return [];
  const range = document.createRange();
  const topAt = (index: number) => {
    let lo = 0,
      hi = nodes.length - 1;
    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (nodes[mid].end <= index) lo = mid + 1;
      else hi = mid;
    }
    const entry = nodes[lo];
    range.setStart(entry.node, index - entry.start);
    range.setEnd(
      entry.node,
      Math.min(entry.end - entry.start, index - entry.start + 1),
    );
    return range.getBoundingClientRect().top;
  };
  const origin = topAt(0);
  const rows: TextRow[] = [];
  let cursor = 0;
  while (cursor < text.length) {
    const top = topAt(cursor);
    let lo = cursor + 1,
      hi = text.length;
    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (topAt(mid) > top + lineHeight / 2) hi = mid;
      else lo = mid + 1;
    }
    rows.push({
      start: cursor,
      end: lo,
      y: Math.max(0, top - origin),
      height: lineHeight,
    });
    cursor = lo;
  }
  if (text.endsWith("\n"))
    rows.push({
      start: text.length,
      end: text.length,
      y: (rows.at(-1)?.y ?? 0) + lineHeight,
      height: lineHeight,
    });
  return rows;
}

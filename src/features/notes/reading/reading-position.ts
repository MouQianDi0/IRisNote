/** Offsets are UTF-16 code units in newline-normalized, otherwise unmodified text. */
export type ReadingAnchor = { before: string; text: string; after: string };
export type ReadingPosition = {
  contentVersion: string;
  line: number;
  character: number;
  anchor: ReadingAnchor | null;
  percent: number;
};
export type ReadingRecord = ReadingPosition & {
  schema: 2;
  ownerId: number;
  noteId: number;
  serverId: number | null;
  updatedAt: number;
  localVersion: number;
  serverVersion: string | null;
  pendingSync: boolean;
};
export type ReadingHistory = ReadingRecord | { percent: number };
export type TextRow = { start: number; end: number; y: number; height: number };
export type ReadingGeometry = {
  bodyTop: number;
  bodyHeight: number;
  viewport: number;
  contentHeight: number;
  rows: TextRow[];
};
export function clamp(value: number, min: number, max: number) {
  "worklet";
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
}
export function normalizeReadingText(text: string | null) {
  return (text ?? "").replace(/\r\n?/g, "\n");
}
export function textVersion(text: string) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++)
    hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return `${text.length}:${(hash >>> 0).toString(16)}`;
}
export function readingRange(g: Omit<ReadingGeometry, "rows">) {
  "worklet";
  const end = Math.max(0, g.contentHeight - g.viewport);
  return {
    start: Math.min(g.bodyTop, end),
    end,
    short: g.bodyHeight <= g.viewport,
  };
}
export function readingPercent(
  offset: number,
  g: Omit<ReadingGeometry, "rows">,
) {
  "worklet";
  const r = readingRange(g);
  return r.short || r.end <= r.start
    ? 100
    : clamp(((offset - r.start) / (r.end - r.start)) * 100, 0, 100);
}
export function offsetForPercent(percent: number, g: ReadingGeometry) {
  const r = readingRange(g);
  return r.start + (clamp(percent, 0, 100) / 100) * (r.end - r.start);
}
export function rowAtY(rows: TextRow[], y: number) {
  let lo = 0,
    hi = rows.length - 1;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (rows[mid].y + rows[mid].height <= y) lo = mid + 1;
    else hi = mid;
  }
  return rows[lo];
}
export class ReadingText {
  readonly text: string;
  readonly version: string;
  readonly starts: number[] = [0];
  constructor(content: string | null) {
    this.text = normalizeReadingText(content);
    this.version = textVersion(this.text);
    for (let i = 0; i < this.text.length; i++)
      if (this.text[i] === "\n") this.starts.push(i + 1);
  }
  index(line: number, character: number) {
    if (!Number.isInteger(line) || line < 1 || line > this.starts.length)
      return null;
    const start = this.starts[line - 1];
    const end =
      line < this.starts.length ? this.starts[line] - 1 : this.text.length;
    return start + clamp(character, 0, end - start);
  }
  position(index: number, percent: number): ReadingPosition {
    index = clamp(Math.floor(index), 0, this.text.length);
    let lo = 0,
      hi = this.starts.length - 1;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (this.starts[mid] <= index) lo = mid;
      else hi = mid - 1;
    }
    return {
      contentVersion: this.version,
      line: lo + 1,
      character: index - this.starts[lo],
      percent: this.text.length ? clamp(percent, 0, 100) : 0,
      anchor: this.text.length
        ? {
            before: this.text.slice(Math.max(0, index - 32), index),
            text: this.text.slice(index, index + 48),
            after: this.text.slice(index + 48, index + 80),
          }
        : null,
    };
  }
  atOffset(offset: number, geometry: ReadingGeometry) {
    const row = rowAtY(geometry.rows, Math.max(0, offset - geometry.bodyTop));
    return this.position(row?.start ?? 0, readingPercent(offset, geometry));
  }
  resolveIndex(position: ReadingPosition): number | null {
    if (position.contentVersion === this.version)
      return this.index(position.line, position.character);
    const a = position.anchor;
    if (a) {
      // Repeated passages are deliberately not guessed.
      const needle = a.before + a.text + a.after;
      const first = needle ? this.text.indexOf(needle) : -1;
      if (first >= 0 && this.text.indexOf(needle, first + 1) < 0)
        return first + a.before.length;
      if (a.text.length >= 8) {
        const match = this.text.indexOf(a.text);
        if (match >= 0 && this.text.indexOf(a.text, match + 1) < 0)
          return match;
      }
    }
    return this.index(position.line, position.character);
  }
  restore(
    position: ReadingHistory | ReadingPosition,
    geometry: ReadingGeometry,
  ) {
    if (!this.text.length) return 0;
    if ("line" in position) {
      const index = this.resolveIndex(position);
      if (index !== null && geometry.rows.length) {
        const row =
          geometry.rows.find((r) => index >= r.start && index < r.end) ??
          (index === this.text.length ? geometry.rows.at(-1) : undefined);
        if (row)
          return clamp(
            geometry.bodyTop + row.y,
            0,
            Math.max(0, geometry.contentHeight - geometry.viewport),
          );
      }
    }
    return offsetForPercent(position.percent, geometry);
  }
}
export function nativeTextRows(
  text: string,
  lines: { text: string; y: number; height: number }[],
): TextRow[] {
  let cursor = 0;
  return lines.map((line, index) => {
    const raw = normalizeReadingText(line.text);
    const match = raw ? text.indexOf(raw, cursor) : cursor;
    const start = match >= cursor ? match : cursor;
    let end = start + raw.length;
    if (!raw.endsWith("\n") && text[end] === "\n") end++;
    if (index === lines.length - 1) end = text.length;
    cursor = Math.min(text.length, end);
    return {
      start: Math.min(start, text.length),
      end: cursor,
      y: line.y,
      height: line.height,
    };
  });
}

import type { ReadingPosition } from "./reading-position";
/** Explicit data only: plain text is never guessed as headings. */
export type ReadingNavigationEntry = {
  id: string;
  kind: "heading" | "bookmark";
  title: string;
  line: number;
  character?: number;
  level?: number;
  /** Inclusive range within the logical line; omitted means an exact character anchor. */
  endCharacter?: number;
};
export function orderNavigation(entries: readonly ReadingNavigationEntry[]) {
  return entries
    .filter(
      (e) =>
        Number.isInteger(e.line) &&
        e.line >= 1 &&
        Number.isInteger(e.character ?? 0) &&
        (e.character ?? 0) >= 0,
    )
    .slice()
    .sort(
      (a, b) =>
        a.line - b.line ||
        (a.character ?? 0) - (b.character ?? 0) ||
        (a.kind === b.kind ? 0 : a.kind === "heading" ? -1 : 1),
    );
}
export function currentNavigation(
  entries: readonly ReadingNavigationEntry[],
  position: Pick<ReadingPosition, "line" | "character">,
) {
  const headings = entries.filter(
    (e) =>
      e.kind === "heading" &&
      (e.line < position.line ||
        (e.line === position.line && (e.character ?? 0) <= position.character)),
  );
  const bookmarks = entries.filter(
    (e) =>
      e.kind === "bookmark" &&
      e.line === position.line &&
      (e.character === undefined ||
        (position.character >= e.character &&
          position.character <= (e.endCharacter ?? e.character))),
  );
  return { heading: headings.at(-1), bookmarks };
}

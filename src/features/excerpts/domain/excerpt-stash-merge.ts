export function mergeStashContents(
    items: readonly { content: string; localOrder: number }[],
    separator: boolean,
): string {
    return [...items]
        .sort((a, b) => a.localOrder - b.localOrder)
        .map((item) => item.content)
        .join(separator ? "\n\n" : "\n");
}

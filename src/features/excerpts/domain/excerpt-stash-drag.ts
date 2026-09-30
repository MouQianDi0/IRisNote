/** 拖动条目的中心越过其他条目的半高时，计算新的显示位置。 */
export function stashDragTarget(centers: readonly number[], currentIndex: number, draggedCenter: number): number {
    "worklet";
    let next = currentIndex;
    while (next < centers.length - 1 && draggedCenter > centers[next + 1]) next++;
    while (next > 0 && draggedCenter < centers[next - 1]) next--;
    return next;
}

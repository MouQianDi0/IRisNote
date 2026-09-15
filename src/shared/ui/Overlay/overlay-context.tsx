import {
  createContext,
  use,
  useCallback,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
  type ReactNode,
} from "react";

type Layer = { id: string; depth: number; order: number };
const OverlayContext = createContext<{
  register: (id: string, depth: number) => () => void;
  top: string | undefined;
  render: (modal: boolean) => ReactNode;
} | null>(null);
export const ModalDepthContext = createContext(0);

export function OverlayProvider({
  children,
  render,
}: PropsWithChildren<{ render: (modal: boolean) => ReactNode }>) {
  const [layers, setLayers] = useState<Layer[]>([]);
  const sequence = useRef(0);
  const register = useCallback((id: string, depth: number) => {
    const order = ++sequence.current;
    setLayers((layers) => [
      ...layers.filter((layer) => layer.id !== id),
      { id, depth, order },
    ]);
    return () =>
      setLayers((layers) => layers.filter((layer) => layer.id !== id));
  }, []);
  const top = [...layers].sort(
    (a, b) => b.depth - a.depth || b.order - a.order,
  )[0]?.id;
  const value = useMemo(
    () => ({ register, top, render }),
    [register, top, render],
  );
  return <OverlayContext value={value}>{children}</OverlayContext>;
}
export function useOverlay() {
  return use(OverlayContext);
}
export function OverlaySlot({ id }: { id?: string }) {
  const context = useOverlay();
  return context && context.top === id
    ? context.render(id !== undefined)
    : null;
}

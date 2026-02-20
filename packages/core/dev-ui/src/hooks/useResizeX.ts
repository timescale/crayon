import { useState, useCallback, useRef, useEffect } from "react";

interface UseResizeXOptions {
  defaultWidth: number;
  minWidth: number;
  maxWidth: number;
  /** "right" = drag handle on right edge (left sidebar), "left" = drag handle on left edge (right sidebar) */
  side: "left" | "right";
}

export function useResizeX({ defaultWidth, minWidth, maxWidth, side }: UseResizeXOptions) {
  const [width, setWidth] = useState(defaultWidth);
  const dragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  const onDragStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragging.current = true;
      startX.current = e.clientX;
      startWidth.current = width;
    },
    [width],
  );

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      const delta = e.clientX - startX.current;
      const newWidth = side === "right"
        ? startWidth.current + delta
        : startWidth.current - delta;
      setWidth(Math.max(minWidth, Math.min(maxWidth, newWidth)));
    };
    const onMouseUp = () => {
      dragging.current = false;
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [minWidth, maxWidth, side]);

  return { width, onDragStart };
}

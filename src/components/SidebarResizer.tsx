// Draggable vertical divider between the sidebar and the main content.
// Drag with pointer (mouse/touch/pen), or focus it and use arrow keys;
// double-click resets to the default width.
import { useCallback, useRef, useState } from "react";
import type {
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
  RefObject,
} from "react";

export const SIDEBAR_MIN_WIDTH = 160;
export const SIDEBAR_MAX_WIDTH = 640;
export const SIDEBAR_DEFAULT_WIDTH = 240;

function clampWidth(value: number): number {
  return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, Math.round(value)));
}

interface SidebarResizerProps {
  /** The flex container that owns the sidebar; its left edge is width 0. */
  containerRef: RefObject<HTMLDivElement | null>;
  width: number;
  onResize: (width: number) => void;
}

export function SidebarResizer({ containerRef, width, onResize }: SidebarResizerProps) {
  const [dragging, setDragging] = useState(false);
  const draggingRef = useRef(false);

  const resizeFromClientX = useCallback(
    (clientX: number) => {
      const rect = containerRef.current?.getBoundingClientRect();
      onResize(clampWidth(clientX - (rect ? rect.left : 0)));
    },
    [containerRef, onResize],
  );

  const handlePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    draggingRef.current = true;
    setDragging(true);
    // Capture the pointer so drags keep tracking outside the handle.
    e.currentTarget.setPointerCapture(e.pointerId);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  const handlePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (draggingRef.current) resizeFromClientX(e.clientX);
  };

  const endDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    setDragging(false);
    e.currentTarget.releasePointerCapture(e.pointerId);
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  };

  const handleKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 48 : 16;
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      onResize(clampWidth(width - step));
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      onResize(clampWidth(width + step));
    } else if (e.key === "Home") {
      e.preventDefault();
      onResize(SIDEBAR_MIN_WIDTH);
    } else if (e.key === "End") {
      e.preventDefault();
      onResize(SIDEBAR_MAX_WIDTH);
    }
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize sidebar"
      aria-valuenow={width}
      aria-valuemin={SIDEBAR_MIN_WIDTH}
      aria-valuemax={SIDEBAR_MAX_WIDTH}
      tabIndex={0}
      title="Drag to resize the sidebar — double-click to reset"
      data-testid="sidebar-resizer"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onKeyDown={handleKeyDown}
      onDoubleClick={() => onResize(SIDEBAR_DEFAULT_WIDTH)}
      className={`
        group w-2 shrink-0 cursor-col-resize touch-none outline-none transition-colors
        focus-visible:bg-blue-200
        ${dragging ? "bg-blue-200" : "bg-gray-100 hover:bg-blue-100"}
      `}
    >
      {/* Grip icon */}
      <div className="pointer-events-none flex h-full items-center justify-center gap-[2px]">
        <span
          className={`h-4 w-[2px] rounded-full transition-colors ${
            dragging ? "bg-blue-500" : "bg-gray-300 group-hover:bg-gray-400"
          }`}
        />
        <span
          className={`h-4 w-[2px] rounded-full transition-colors ${
            dragging ? "bg-blue-500" : "bg-gray-300 group-hover:bg-gray-400"
          }`}
        />
      </div>
    </div>
  );
}

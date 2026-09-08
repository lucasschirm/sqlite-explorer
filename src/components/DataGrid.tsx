import { useMemo, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { CellValue } from "../types";
import { formatCellValue } from "../types";

interface DataGridProps {
  columns: string[];
  rows: CellValue[][];
  onRowDoubleClick?: (rowIndex: number) => void;
  rowHeight?: number;
}

const ROW_HEIGHT = 36;

// Shared column sizing: header and body cells MUST use the same width or the
// columns drift apart (headers size to their text, cells to their own).
const COLUMN_MIN_PX = 100;
const COLUMN_MAX_PX = 360;
const CHAR_W_DATA = 7.3; // 12px monospace cell text
const CHAR_W_HEADER = 8.4; // 12px semibold uppercase + tracking-wider
const CELL_PADDING_PX = 26; // px-3 (12+12) + 1px border + rounding buffer

function cellTextLength(cell: CellValue): number {
  if (cell == null) return 4; // "NULL"
  if (cell instanceof Uint8Array) return 10; // "BLOB" badge
  if (typeof cell === "number") return String(cell).length;
  if (typeof cell === "bigint") return cell.toString().length;
  return cell.length;
}

/**
 * Estimate a fixed pixel width for each column from the header text and a
 * sample of rows. Both the header cell and every body cell render at exactly
 * this width, which guarantees alignment; overflow is truncated.
 */
function estimateColumnWidths(columns: string[], rows: CellValue[][], sampleSize = 200): number[] {
  const sample = rows.length > sampleSize ? rows.slice(0, sampleSize) : rows;
  const cap = COLUMN_MAX_PX - CELL_PADDING_PX;
  return columns.map((col, i) => {
    let widest = col.length * CHAR_W_HEADER;
    for (const row of sample) {
      const w = cellTextLength(row[i] ?? null) * CHAR_W_DATA;
      if (w > widest) widest = w;
      if (widest >= cap) {
        widest = cap;
        break;
      }
    }
    return Math.round(Math.min(COLUMN_MAX_PX, Math.max(COLUMN_MIN_PX, widest + CELL_PADDING_PX)));
  });
}

export function DataGrid({
  columns,
  rows,
  onRowDoubleClick,
  rowHeight = ROW_HEIGHT,
}: DataGridProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const headerInnerRef = useRef<HTMLDivElement>(null);

  const widths = useMemo(() => estimateColumnWidths(columns, rows), [columns, rows]);
  const totalWidth = useMemo(() => widths.reduce((sum, w) => sum + w, 0), [widths]);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeight,
    overscan: 20,
  });

  // Keep the header aligned with the body's horizontal scroll. Direct DOM
  // update (no React state) so scrolling never triggers a re-render.
  const syncHeaderScroll = () => {
    if (headerInnerRef.current && parentRef.current) {
      headerInnerRef.current.style.transform = `translateX(${-parentRef.current.scrollLeft}px)`;
    }
  };

  if (columns.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-gray-400 text-sm">
        No rows to display
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-0 flex-1">
      {/* Column headers - fixed; horizontally synced with the body scroller */}
      <div className="overflow-hidden border-b border-gray-200 bg-gray-50 shrink-0">
        <div
          ref={headerInnerRef}
          className="flex will-change-transform"
          style={{ width: totalWidth, minWidth: "100%" }}
          data-testid="grid-header"
        >
          {columns.map((col, i) => (
            <div
              key={i}
              style={{ width: widths[i] }}
              className="shrink-0 px-3 py-2 text-xs font-semibold text-gray-600 uppercase tracking-wider truncate border-r border-gray-100 last:border-r-0"
            >
              {col}
            </div>
          ))}
        </div>
      </div>

      {/* Virtualized rows - the only scrollable area */}
      <div ref={parentRef} className="flex-1 overflow-auto min-h-0" onScroll={syncHeaderScroll}>
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            position: "relative",
            width: "100%",
            minWidth: totalWidth,
          }}
        >
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const row = rows[virtualRow.index];
            return (
              <div
                key={virtualRow.key}
                data-testid={virtualRow.index === 0 ? "grid-first-row" : undefined}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
                className={`flex border-b border-gray-100 hover:bg-blue-50/50 ${
                  onRowDoubleClick ? "cursor-pointer" : ""
                }`}
                onDoubleClick={() => onRowDoubleClick?.(virtualRow.index)}
              >
                {row.map((cell, cellIdx) => (
                  <div
                    key={cellIdx}
                    style={{ width: widths[cellIdx] }}
                    className="shrink-0 px-3 py-1 text-sm text-gray-700 truncate border-r border-gray-50 last:border-r-0 font-mono text-xs leading-8"
                    title={formatCellValue(cell)}
                  >
                    {cell == null ? (
                      <span className="text-gray-300 italic">NULL</span>
                    ) : cell instanceof Uint8Array ? (
                      <span className="text-purple-500 italic">BLOB</span>
                    ) : (
                      formatCellValue(cell)
                    )}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer */}
      <div className="px-3 py-1.5 text-xs text-gray-400 border-t border-gray-200 bg-gray-50 shrink-0">
        {rows.length} row{rows.length !== 1 ? "s" : ""}
      </div>
    </div>
  );
}

import { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

interface DataGridProps {
  columns: string[];
  rows: (string | number | null)[][];
  onRowDoubleClick?: (rowIndex: number) => void;
  rowHeight?: number;
}

const ROW_HEIGHT = 36;

export function DataGrid({
  columns,
  rows,
  onRowDoubleClick,
  rowHeight = ROW_HEIGHT,
}: DataGridProps) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeight,
    overscan: 20,
  });

  if (columns.length === 0 || rows.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-gray-400 text-sm">
        No rows to display
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-0 flex-1">
      {/* Column headers - sticky */}
      <div className="flex border-b border-gray-200 bg-gray-50 shrink-0">
        {columns.map((col) => (
          <div
            key={col}
            className="px-3 py-2 text-xs font-semibold text-gray-600 uppercase tracking-wider shrink-0 min-w-[120px] max-w-[260px] truncate border-r border-gray-100 last:border-r-0"
          >
            {col}
          </div>
        ))}
      </div>

      {/* Virtualized rows */}
      <div
        ref={parentRef}
        className="flex-1 overflow-auto min-h-0"
      >
        <div
          style={{ height: `${virtualizer.getTotalSize()}px`, position: "relative" }}
        >
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const row = rows[virtualRow.index];
            return (
              <div
                key={virtualRow.key}
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
                    className="px-3 py-1 text-sm text-gray-700 shrink-0 min-w-[120px] max-w-[260px] truncate border-r border-gray-50 last:border-r-0 font-mono text-xs leading-8"
                    title={cell != null ? String(cell) : "NULL"}
                  >
                    {cell != null ? (
                      String(cell)
                    ) : (
                      <span className="text-gray-300 italic">NULL</span>
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

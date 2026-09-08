import { useEffect } from "react";
import type { CellValue, ColumnInfo, QueryResult } from "../types";
import { formatCellValue } from "../types";

interface RecordDrawerProps {
  drawer: {
    tableName: string;
    columns: ColumnInfo[];
    record: QueryResult;
  } | null;
  onClose: () => void;
}

function getInputType(colType: string): string {
  const upper = colType.toUpperCase();
  if (upper.includes("INT") || upper.includes("REAL") || upper.includes("NUM") || upper.includes("FLOA") || upper.includes("DOUB")) return "number";
  if (upper === "DATE") return "date";
  if (upper.includes("DATETIME") || upper.includes("TIMESTAMP")) return "datetime-local";
  return "text";
}

function shouldUseTextarea(colType: string, value: CellValue): boolean {
  if (value instanceof Uint8Array) return true;
  const upper = colType.toUpperCase();
  if (upper.includes("TEXT") || upper === "CLOB" || upper === "BLOB") {
    const str = value != null ? String(value) : "";
    return str.length > 200;
  }
  return false;
}

/**
 * Right-side drawer showing a single record in form view. Slides in over the
 * main content; close via backdrop click, the × button, or Escape.
 */
export function RecordDrawer({ drawer, onClose }: RecordDrawerProps) {
  const open = drawer != null;

  // Escape closes the drawer.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;
  const { tableName, columns, record } = drawer;

  return (
    <div
      className="fixed inset-0 z-[9000]"
      role="dialog"
      aria-modal="true"
      aria-label={`Record from ${tableName}`}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-gray-900/40 drawer-backdrop"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="absolute right-0 top-0 h-full w-full max-w-md bg-white shadow-2xl flex flex-col border-l border-gray-200 drawer-panel">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-200 bg-gray-50 shrink-0">
          <span className="text-base">📄</span>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold text-gray-800 truncate">
              Record — {tableName}
            </h2>
            <p className="text-xs text-gray-400">
              {columns.length} column{columns.length !== 1 ? "s" : ""}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close record drawer"
            className="shrink-0 w-7 h-7 flex items-center justify-center rounded text-gray-400 hover:text-gray-700 hover:bg-gray-200 transition-colors text-lg leading-none"
          >
            ×
          </button>
        </div>

        {/* Form body */}
        <div className="flex-1 overflow-y-auto p-5 min-h-0">
          {record.rows.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-gray-400 text-sm">
              Record not found
            </div>
          ) : (
            <div className="space-y-4">
              {columns.map((col, idx) => {
                const value = record.rows[0][idx] ?? null;
                const strValue = formatCellValue(value);
                const inputType = getInputType(col.type);
                const useArea = shouldUseTextarea(col.type, value);
                const isPk = col.pk > 0;

                return (
                  <div key={`${col.cid}-${col.name}`} className="space-y-1.5">
                    <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                      <span>{col.name}</span>
                      {isPk && (
                        <span className="text-[10px] font-bold uppercase bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">
                          PK
                        </span>
                      )}
                      <span className="text-xs text-gray-400 font-normal">{col.type}</span>
                    </label>
                    {useArea ? (
                      <textarea
                        readOnly
                        value={strValue}
                        rows={6}
                        className="w-full px-3 py-2 text-sm font-mono bg-white border border-gray-200 rounded-lg text-gray-700 focus:outline-none resize-y"
                      />
                    ) : (
                      <input
                        readOnly
                        type={inputType}
                        value={inputType === "number" && strValue === "" ? "" : strValue}
                        className="w-full px-3 py-2 text-sm font-mono bg-white border border-gray-200 rounded-lg text-gray-700 focus:outline-none"
                      />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

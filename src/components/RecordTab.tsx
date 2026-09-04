import type { ColumnInfo, QueryResult } from "../types";

interface RecordTabProps {
  columns: ColumnInfo[];
  record: QueryResult;
}

function getInputType(colType: string): string {
  const upper = colType.toUpperCase();
  if (upper.includes("INTEGER") || upper.includes("REAL") || upper.includes("NUMERIC")) return "number";
  if (upper === "DATE") return "date";
  if (upper.includes("DATETIME") || upper.includes("TIMESTAMP")) return "datetime-local";
  return "text";
}

function shouldUseTextarea(colType: string, value: string | number | null): boolean {
  const upper = colType.toUpperCase();
  if (upper.includes("TEXT") || upper === "CLOB" || upper === "BLOB") {
    const str = value != null ? String(value) : "";
    return str.length > 200;
  }
  return false;
}

export function RecordTab({ columns, record }: RecordTabProps) {
  if (record.rows.length === 0) {
    return (
      <div className="flex items-center justify-center flex-1 text-gray-400 text-sm">
        Record not found
      </div>
    );
  }

  const row = record.rows[0];

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-gray-50 min-h-0">
      <div className="max-w-2xl mx-auto space-y-4">
        {columns.map((col, idx) => {
          const value = row[idx];
          const strValue = value != null ? String(value) : "";
          const inputType = getInputType(col.type);
          const useArea = shouldUseTextarea(col.type, value);
          const isPk = col.pk > 0;

          return (
            <div key={col.name} className="space-y-1.5">
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                <span>{col.name}</span>
                {isPk && (
                  <span className="text-[10px] font-bold uppercase bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">
                    PK
                  </span>
                )}
                <span className="text-xs text-gray-400 font-normal">
                  {col.type}
                </span>
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
    </div>
  );
}

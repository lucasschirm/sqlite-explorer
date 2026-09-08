export interface TableInfo {
  name: string;
  rowCount: number;
}

export interface Tab {
  id: string;
  type: "data" | "structure";
  title: string;
  tableName: string;
  sql?: string;
}

export interface ColumnInfo {
  cid: number;
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
  pk: number;
}

export interface IndexInfo {
  index_name: string;
  unique: number;
  origin: string;
  partial: number;
  columns: string;
}

/**
 * Values transferred from the database worker. BigInt (INTEGER columns that
 * exceed Number.MAX_SAFE_INTEGER) and Uint8Array (BLOB columns) are converted
 * to display strings on the main thread via formatCellValue.
 */
export type CellValue = string | number | bigint | Uint8Array | null;

export interface QueryResult {
  columns: string[];
  rows: CellValue[][];
}

/** Render any cell value as user-facing text. */
export function formatCellValue(value: CellValue): string {
  if (value == null) return "NULL";
  if (typeof value === "bigint") return `${value}`;
  if (value instanceof Uint8Array) {
    const preview = Array.from(value.slice(0, 12))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join(" ");
    return value.length > 12 ? `0x ${preview} … (${value.length} bytes)` : `0x ${preview}`;
  }
  return String(value);
}

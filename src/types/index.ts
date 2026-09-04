export interface TableInfo {
  name: string;
  rowCount: number;
}

export interface Tab {
  id: string;
  type: "data" | "structure" | "record";
  title: string;
  tableName: string;
  sql?: string;
  recordId?: number | string;
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

export interface QueryResult {
  columns: string[];
  rows: (string | number | null)[][];
}

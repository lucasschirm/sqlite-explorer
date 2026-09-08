/// <reference lib="webworker" />
// Database worker: owns the SQLite engine so page reads (via BlobVFS's
// synchronous FileReaderSync) and heavy queries never block the UI thread.
//
// Protocol (request → response):
//   {type:'open',   id, blob, name}  → {type:'open:ok',  id, tables} | {type:'error', id, message}
//   {type:'query',  id, sql}         → {type:'query:ok', id, result} | {type:'error', id, message}
//   {type:'close',  id}              → {type:'close:ok', id}
// Progress (unsolicited):
//   {type:'progress', stage, detail}
import initModuleFactory from "wa-sqlite/dist/wa-sqlite.mjs";
import { Factory } from "wa-sqlite";
import { BlobVFS } from "../lib/blobVfs";
import type { CellValue, QueryResult, TableInfo } from "../types";

const BASE = (import.meta.env.BASE_URL ?? "/").replace(/\/?$/, "/");
const MAX_ROWS = 100_000; // cap rows transferred to the UI per query

const VFS = new BlobVFS();
let sqlite3: ReturnType<typeof Factory> | null = null;
let db: number | null = null;

interface OpenRequest { type: "open"; id: number; blob: Blob; name: string }
interface QueryRequest { type: "query"; id: number; sql: string; params?: CellValue[] }
interface CloseRequest { type: "close"; id: number }
type Request = OpenRequest | QueryRequest | CloseRequest;

function post(msg: Record<string, unknown>): void {
  (self as unknown as Worker).postMessage(msg);
}

async function ensureEngine(): Promise<void> {
  if (sqlite3) return;
  post({ type: "progress", stage: "engine", detail: "Loading SQLite engine" });
  const mod = await initModuleFactory({
    locateFile: (file: string) => `${BASE}sqlite/${file}`,
  });
  sqlite3 = Factory(mod);
  sqlite3.vfs_register(VFS, false);
}

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

async function listTables(): Promise<TableInfo[]> {
  const { rows } = await runQuery("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
  const names = rows.map((r) => String(r[0]));

  const tables: TableInfo[] = [];
  for (let i = 0; i < names.length; i++) {
    const name = names[i];
    post({ type: "progress", stage: "tables", detail: `Counting rows — ${name} (${i + 1}/${names.length})` });
    try {
      const count = await runQuery(`SELECT COUNT(*) FROM ${quoteIdent(name)}`);
      tables.push({ name, rowCount: Number(count.rows[0]?.[0] ?? 0) });
    } catch (err) {
      console.error(`Failed to count rows of "${name}":`, err);
      tables.push({ name, rowCount: 0 });
    }
  }
  return tables;
}

/**
 * Execute user SQL. Runs every statement; returns the first result set that
 * produces columns (matching sql.js `exec` + `results[0]` behavior the UI
 * was built on).
 */
async function runQuery(sql: string, params: CellValue[] = []): Promise<QueryResult & { truncated?: boolean }> {
  if (!sqlite3 || db == null) throw new Error("No database is open");
  const s = sqlite3;
  let result: QueryResult & { truncated?: boolean } | null = null;
  let truncated = false;

  try {
    // statements() auto-finalizes each statement, including on early break.
    for await (const stmt of s.statements(db, sql)) {
      const columns = s.column_names(stmt);
      if (columns.length > 0 && !result) {
        // Bind the caller's parameters to the first statement we consume.
        for (let i = 0; i < params.length; i++) {
          s.bind(stmt, i + 1, params[i]);
        }
        result = { columns, rows: [] };
      }

      if (result) {
        const colCount = result.columns.length;
        while ((await s.step(stmt)) === 100 /* SQLITE_ROW */) {
          if (result.rows.length >= MAX_ROWS) {
            truncated = true;
            break;
          }
          const row: CellValue[] = [];
          for (let i = 0; i < colCount; i++) {
            // Wa-sqlite returns blob values as Uint8Array — structured clone
            // transfers them to the main thread without copying.
            row.push(s.column(stmt, i) as CellValue);
          }
          result.rows.push(row);
        }
      }
      if (truncated) break;
    }
  } catch (err) {
    if (err instanceof Error) throw err;
    throw new Error(String(err));
  }

  if (truncated) {
    post({ type: "progress", stage: "query", detail: `Result limited to first ${MAX_ROWS.toLocaleString()} rows` });
  }
  return result ?? { columns: [], rows: [], truncated };
}

// Serialize all requests: SQLite state (db handle) is single, and interleaving
// an `open` with a running `query` would corrupt results. Chain each request
// onto the tail of the previous one.
let queue: Promise<void> = Promise.resolve();

function handle(request: Request): Promise<void> {
  return queue.then(async () => {
    try {
      switch (request.type) {
        case "open": {
          await ensureEngine();
          if (db != null) {
            try {
              await sqlite3!.close(db);
            } catch (err) {
              console.error("Failed to close previous database:", err);
            }
            db = null;
          }
          VFS.clearBlobs();
          VFS.registerBlob("/user.db", request.blob);
          post({ type: "progress", stage: "open", detail: `Opening ${request.name}` });
          db = await sqlite3!.open_v2("/user.db", 0x00000001 /* SQLITE_OPEN_READONLY */, VFS.name);
          const tables = await listTables();
          post({ type: "open:ok", id: request.id, tables });
          break;
        }
        case "query": {
          const result = await runQuery(request.sql, request.params ?? []);
          post({ type: "query:ok", id: request.id, result });
          break;
        }
        case "close": {
          if (db != null) {
            try {
              await sqlite3!.close(db);
            } catch (err) {
              console.error("Failed to close database:", err);
            }
            db = null;
          }
          VFS.clearBlobs();
          post({ type: "close:ok", id: request.id });
          break;
        }
      }
    } catch (err) {
      console.error(`dbWorker: ${request.type} failed:`, err);
      post({ type: "error", id: request.id, message: err instanceof Error ? err.message : String(err) });
    }
  });
}

self.onmessage = (e: MessageEvent<Request>) => {
  try {
    handle(e.data);
  } catch (err) {
    console.error("dbWorker: failed to enqueue message:", err);
  }
};

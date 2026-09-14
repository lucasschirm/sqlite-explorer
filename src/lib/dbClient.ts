// Main-thread RPC client for the database worker. Owns the worker's lifecycle
// and maps requests to Promise-based calls the UI can await.
//
// The File/Blob reference is structured-cloned to the worker in O(1) (no data
// copy), so handing over a multi-GB file is instant.
import type { CellValue, QueryResult, TableInfo } from "../types";

export interface OpenProgress {
  stage: "engine" | "open" | "tables" | "query";
  detail: string;
}

type WorkerResponse =
  | { type: "open:ok"; id: number; tables: TableInfo[] }
  | { type: "query:ok"; id: number; result: QueryResult }
  | { type: "close:ok"; id: number }
  | { type: "progress"; stage: OpenProgress["stage"]; detail: string }
  | { type: "error"; id: number; message: string };

interface Pending {
  resolve: (value: never) => void;
  reject: (reason: Error) => void;
}

class DbClient {
  private worker: Worker | null = null;
  private seq = 0;
  private pending = new Map<number, Pending>();
  onProgress: ((progress: OpenProgress) => void) | null = null;

  private ensureWorker(): Worker {
    if (this.worker) return this.worker;
    this.worker = new Worker(new URL("../worker/dbWorker.ts", import.meta.url), {
      type: "module",
      name: "sqlite-db-worker",
    });
    this.worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const msg = e.data;
      if (msg.type === "progress") {
        this.onProgress?.({ stage: msg.stage, detail: msg.detail });
        return;
      }
      const entry = this.pending.get(msg.id);
      if (!entry) return;
      this.pending.delete(msg.id);
      if (msg.type === "error") {
        entry.reject(new Error(msg.message));
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (entry.resolve as (v: unknown) => void)(msg);
      }
    };
    this.worker.onerror = (e) => {
      console.error("dbClient: worker error:", e.message ?? e);
      this.failAllPending(new Error(`Database worker crashed: ${e.message ?? "unknown error"}`));
      // Drop the dead worker so the next request spins up a fresh one.
      this.worker = null;
    };
    this.worker.onmessageerror = () => {
      console.error("dbClient: worker message deserialization failed");
    };
    return this.worker;
  }

  private failAllPending(error: Error): void {
    for (const entry of this.pending.values()) entry.reject(error);
    this.pending.clear();
  }

  private send<T extends { type: string }>(request: Record<string, unknown>): Promise<T> {
    const worker = this.ensureWorker();
    const id = ++this.seq;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as never, reject });
      worker.postMessage({ ...request, id });
    });
  }

  /**
   * Open a database file. The blob (a File is a Blob) is passed by reference;
   * the worker serves SQLite pages from it on demand, so files of any size
   * open without loading them into memory.
   */
  async open(blob: Blob, name: string, onProgress?: (p: OpenProgress) => void): Promise<TableInfo[]> {
    this.onProgress = onProgress ?? null;
    try {
      const res = await this.send<{ type: "open:ok"; tables: TableInfo[] }>({
        type: "open",
        blob,
        name,
      });
      return res.tables;
    } finally {
      this.onProgress = null;
    }
  }

  /**
   * Open a database served over HTTP with Range support (the slitex CLI
   * server). Pages are fetched on demand — like the blob path, the whole
   * file never loads into memory.
   */
  async openRemote(url: string, name: string, onProgress?: (p: OpenProgress) => void): Promise<TableInfo[]> {
    this.onProgress = onProgress ?? null;
    try {
      const res = await this.send<{ type: "open:ok"; tables: TableInfo[] }>({
        type: "open-remote",
        url,
        name,
      });
      return res.tables;
    } finally {
      this.onProgress = null;
    }
  }

  /** Run a SQL statement against the open database. `params` binds to `?` placeholders. */
  async query(sql: string, params: CellValue[] = []): Promise<QueryResult> {
    const res = await this.send<{ type: "query:ok"; result: QueryResult }>({ type: "query", sql, params });
    return res.result;
  }

  /** Close the current database (no-op when nothing is open). */
  async close(): Promise<void> {
    if (!this.worker) return;
    try {
      await this.send({ type: "close" });
    } catch (err) {
      console.error("dbClient: failed to close database:", err);
    }
  }
}

export const dbClient = new DbClient();

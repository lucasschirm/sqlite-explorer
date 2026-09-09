// WebMCP integration (https://github.com/WebMCP-org) via @mcp-b/webmcp-polyfill.
//
// Exposes three agent-facing tools on document.modelContext. Every tool both
// returns data to the agent AND reflects its action in the app UI (sidebar
// filter, Structure tab, SQL result tab). On failure, tools return the raw
// SQLite error message (e.g. `no such table: foo`) so agents can react to the
// real database error instead of a wrapped one.
import { initializeWebMCPPolyfill } from "@mcp-b/webmcp-polyfill";
import { formatCellValue, type CellValue, type TableInfo } from "../types";

// select_table hard limit: max records returned per page.
export const WEBMCP_PAGE_SIZE = 1000;

// Truncate huge cell values in markdown output so responses stay bounded.
const CELL_TEXT_LIMIT = 120;

// ---- Minimal structural typing over the (draft-spec) modelContext API ----

interface WebMcpTool {
  name: string;
  description: string;
  title?: string;
  inputSchema?: Record<string, unknown>;
  annotations?: Record<string, unknown>;
  execute: (input: unknown) => unknown;
}

interface WebMcpModelContext {
  registerTool: (tool: WebMcpTool, options?: { signal?: AbortSignal }) => Promise<void> | void;
}

// The controller lets tool executions drive the current app state without
// re-registering the tools on every render. App.tsx keeps this fresh.
export interface WebMcpController {
  /** True when a database is open. */
  isReady: () => boolean;
  /** All tables with row counts (unfiltered). */
  getTables: () => TableInfo[];
  /** Run SQL against the open database. */
  query: (sql: string) => Promise<{ columns: string[]; rows: CellValue[][] }>;
  /** Filter the sidebar table list ("" clears the filter). */
  setTableFilter: (filter: string) => void;
  /** Open the Structure tab for a table. */
  openStructure: (table: string) => void;
  /** Open a tab showing a paged SQL result. */
  openSqlTab: (sql: string, page: number) => void;
}

let controller: WebMcpController | null = null;

/** Point the tools at the live app (called from App.tsx on every relevant change). */
export function setWebMcpController(next: WebMcpController): void {
  controller = next;
}

// ---- Markdown helpers ----

function mdCell(value: CellValue): string {
  const text = formatCellValue(value);
  const truncated = text.length > CELL_TEXT_LIMIT ? `${text.slice(0, CELL_TEXT_LIMIT)}…` : text;
  // Escape pipes/newlines so they cannot break the table.
  return truncated.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

function mdTable(columns: string[], rows: CellValue[][]): string {
  const head = `| ${columns.join(" | ")} |`;
  const rule = `| ${columns.map(() => "---").join(" | ")} |`;
  const body = rows.map((row) => `| ${row.map(mdCell).join(" | ")} |`).join("\n");
  return `${head}\n${rule}\n${body}`;
}

function rawSqlError(err: unknown): string {
  // Deliberately unwrapped: agents must see the exact SQLite error text
  // (e.g. "no such table: foo"), not a wrapped or reworded message.
  return err instanceof Error ? err.message : String(err);
}

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

/** Validate a table exists by touching it; SQLite's error propagates verbatim. */
async function assertTableExists(table: string): Promise<void> {
  const c = controller;
  if (!c) throw new Error("No database is open");
  await c.query(`SELECT * FROM ${quoteIdent(table)} LIMIT 0`);
}

// ---- Pagination (shared with App's SQL-result tab) ----

export interface PagedQuery {
  countSql: string;
  pageSql: string;
  page: number;
  pageSize: number;
  offset: number;
}

/** Wrap a user query for counting + one page of records (1-based page). */
export function buildPagedQuery(sql: string, page: number): PagedQuery {
  const clean = sql.trim().replace(/;\s*$/, "");
  const safePage = Math.max(1, Math.floor(page) || 1);
  const offset = (safePage - 1) * WEBMCP_PAGE_SIZE;
  return {
    countSql: `SELECT COUNT(*) FROM (${clean}) AS __webmcp_count`,
    pageSql: `SELECT * FROM (${clean}) AS __webmcp_page LIMIT ${WEBMCP_PAGE_SIZE} OFFSET ${offset}`,
    page: safePage,
    pageSize: WEBMCP_PAGE_SIZE,
    offset,
  };
}

// ---- Tool implementations ----

async function runListTables(input: unknown): Promise<string> {
  const c = controller;
  if (!c || !c.isReady()) return "No database is open";
  const search = typeof (input as { search?: unknown })?.search === "string" ? (input as { search: string }).search.trim() : "";

  // Reflect in the UI: filter (or clear) the sidebar table list.
  c.setTableFilter(search);

  const tables = c.getTables();
  const filtered = search ? tables.filter((t) => t.name.toLowerCase().includes(search.toLowerCase())) : tables;
  if (filtered.length === 0) return `No tables match "${search}".`;

  return mdTable(
    ["table", "rows"],
    filtered.map((t) => [t.name, t.rowCount] as CellValue[])
  );
}

async function runViewTable(input: unknown): Promise<string> {
  const c = controller;
  if (!c || !c.isReady()) return "No database is open";
  const table = typeof (input as { table?: unknown })?.table === "string" ? (input as { table: string }).table.trim() : "";
  if (!table) return "Missing required parameter: table";

  // Raw SQLite error (no such table: x) when it does not exist.
  await assertTableExists(table);

  // Reflect in the UI: open the Structure tab for this table.
  c.openStructure(table);

  const columnsRes = await c.query(`PRAGMA table_info(${quoteIdent(table)})`);
  const indexListRes = await c.query(`PRAGMA index_list(${quoteIdent(table)})`);

  const indexRows: CellValue[][] = [];
  for (const idx of indexListRes.rows) {
    const indexName = String(idx[1] ?? "");
    try {
      const info = await c.query(`PRAGMA index_info(${quoteIdent(indexName)})`);
      const cols = info.rows.map((r) => String(r[2] ?? "")).join(", ");
      indexRows.push([indexName, idx[2] ?? null, idx[3] ?? null, cols] as CellValue[]);
    } catch (err) {
      console.error(`webmcp view_table: index_info failed for "${indexName}":`, err);
      indexRows.push([indexName, idx[2] ?? null, idx[3] ?? null, ""] as CellValue[]);
    }
  }

  // Related tables via foreign keys, both directions.
  const related = new Map<string, string>();
  const fkOut = await c.query(`PRAGMA foreign_key_list(${quoteIdent(table)})`);
  for (const fk of fkOut.rows) {
    const target = String(fk[2] ?? "");
    if (target) related.set(target, `${table}.${fk[3]} → ${target}.${fk[4]}`);
  }
  const allTables = c.getTables().map((t) => t.name);
  for (const other of allTables) {
    if (other === table) continue;
    try {
      const fkIn = await c.query(`PRAGMA foreign_key_list(${quoteIdent(other)})`);
      for (const fk of fkIn.rows) {
        if (String(fk[2] ?? "") === table) {
          related.set(other, `${other}.${fk[3]} → ${table}.${fk[4]}`);
        }
      }
    } catch (err) {
      console.error(`webmcp view_table: foreign_key_list failed for "${other}":`, err);
    }
  }

  const sections: string[] = [
    `## Columns of ${table}`,
    mdTable(
      ["cid", "name", "type", "notnull", "default", "pk"],
      columnsRes.rows
    ),
    indexRows.length > 0
      ? `## Indexes\n${mdTable(["name", "unique", "origin", "columns"], indexRows)}`
      : "## Indexes\nNone",
    related.size > 0
      ? `## Related tables\n${mdTable(["table", "foreign key"], Array.from(related, ([t, via]) => [t, via] as CellValue[]))}`
      : "## Related tables\nNone",
  ];
  return sections.join("\n\n");
}

async function runSelectTable(input: unknown): Promise<string> {
  const c = controller;
  if (!c || !c.isReady()) return "No database is open";
  const args = (input ?? {}) as { sql?: unknown; page?: unknown };
  const sql = typeof args.sql === "string" ? args.sql.trim() : "";
  if (!sql) return "Missing required parameter: sql";
  const page = typeof args.page === "number" ? args.page : 1;

  const paged = buildPagedQuery(sql, page);

  // Raw SQLite errors propagate verbatim (bad SQL, non-SELECT, readonly, ...).
  const countRes = await c.query(paged.countSql);
  const total = Number(countRes.rows[0]?.[0] ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / paged.pageSize));
  const pageRes = await c.query(paged.pageSql);

  // Reflect in the UI: open a tab with this SQL and the requested page.
  c.openSqlTab(sql, paged.page);

  const table = pageRes.columns.length
    ? mdTable(pageRes.columns, pageRes.rows)
    : "_(no columns)_";
  return [
    table,
    "",
    `Total records: ${total}`,
    `Total pages: ${totalPages}`,
    `Current page: ${paged.page}`,
  ].join("\n");
}

// ---- Registration ----

let initialized = false;

/**
 * Initialize the polyfill and register the tools (idempotent).
 * No-op outside secure contexts where document.modelContext is unavailable.
 */
export function initWebMcpTools(): void {
  if (initialized) return;
  initialized = true;

  try {
    initializeWebMCPPolyfill({ installTestingShim: true });
  } catch (err) {
    console.error("webmcp: polyfill initialization failed:", err);
    return;
  }

  const ctx = (document as Document & { modelContext?: WebMcpModelContext }).modelContext;
  if (!ctx) {
    // Insecure context (e.g. plain http on a LAN IP) — tools stay unavailable.
    console.warn("webmcp: document.modelContext unavailable; tools not registered");
    return;
  }

  const tools: WebMcpTool[] = [
    {
      name: "list_tables",
      title: "List tables",
      description:
        "List all tables in the open SQLite database with their row counts. Accepts an optional `search` substring to filter; the sidebar list in the UI reflects the filter.",
      inputSchema: {
        type: "object",
        properties: {
          search: { type: "string", description: "Optional case-insensitive substring to filter table names" },
        },
      },
      annotations: { readOnlyHint: true },
      execute: async (input) => {
        try {
          return await runListTables(input);
        } catch (err) {
          console.error("webmcp list_tables failed:", err);
          return rawSqlError(err);
        }
      },
    },
    {
      name: "view_table",
      title: "View table structure",
      description:
        "Show the structure of one table: columns (name, type, notnull, default, pk), indexes (name, unique, origin, columns) and related tables via foreign keys. Opens the table's Structure tab in the UI. Fails with the raw SQLite error when the table does not exist.",
      inputSchema: {
        type: "object",
        properties: {
          table: { type: "string", description: "Exact table name" },
        },
        required: ["table"],
      },
      annotations: { readOnlyHint: true },
      execute: async (input) => {
        try {
          return await runViewTable(input);
        } catch (err) {
          console.error("webmcp view_table failed:", err);
          return rawSqlError(err);
        }
      },
    },
    {
      name: "select_table",
      title: "Run SQL query",
      description:
        "Run a SQL query against the open database with hard pagination: at most 1000 records per page. Pass `page` (1-based) to page through results. Returns a markdown table of the records plus total records, total pages and the current page. The result opens as a tab in the UI. SQL errors are returned verbatim from SQLite.",
      inputSchema: {
        type: "object",
        properties: {
          sql: { type: "string", description: "SQL query, e.g. SELECT * FROM users ORDER BY id" },
          page: { type: "integer", minimum: 1, default: 1, description: "1-based page number (1000 records per page)" },
        },
        required: ["sql"],
      },
      annotations: { readOnlyHint: true },
      execute: async (input) => {
        try {
          return await runSelectTable(input);
        } catch (err) {
          console.error("webmcp select_table failed:", err);
          return rawSqlError(err);
        }
      },
    },
  ];

  for (const tool of tools) {
    try {
      const maybe = ctx.registerTool(tool);
      if (maybe instanceof Promise) {
        void maybe.catch((err: unknown) => {
          console.error(`webmcp: failed to register tool "${tool.name}":`, err);
        });
      }
    } catch (err) {
      console.error(`webmcp: failed to register tool "${tool.name}":`, err);
    }
  }
}

import { useState, useCallback, useRef, useEffect, Suspense, lazy } from "react";
import type { TableInfo, Tab, ColumnInfo, QueryResult, CellValue } from "./types";
import { formatCellValue } from "./types";
import { peekFileBytes } from "./lib/readFile";
import { dbClient, type OpenProgress } from "./lib/dbClient";
import { ToastProvider, useToast } from "./components/Toast";
import { LoadingOverlay } from "./components/LoadingOverlay";
import { FileDropZone } from "./components/FileDropZone";
import { Sidebar } from "./components/Sidebar";
import { TabBar } from "./components/TabBar";
// Monaco is heavy (~700KB gzipped) — load it only when a database is open
// and a data tab renders the editor, keeping the drop-zone page instant.
const SqlEditor = lazy(() =>
  import("./components/SqlEditor").then((m) => ({ default: m.SqlEditor }))
);
import { DataGrid } from "./components/DataGrid";
import { StructureTab } from "./components/StructureTab";
import { RecordDrawer } from "./components/RecordDrawer";
import { buildSchemaCatalog, setSchemaCatalog } from "./lib/sqlCompletions";
import { initWebMcpTools, setWebMcpController, buildPagedQuery } from "./lib/webmcp";
import { aiClient } from "./lib/aiClient";
import { AiStatusPill } from "./components/AiStatusPill";
import { DocsPage } from "./components/DocsPage";
import { AboutPage } from "./components/AboutPage";
import { assetUrl } from "./lib/assetUrl";

let tabIdCounter = 0;
function nextTabId() {
  return `tab-${++tabIdCounter}`;
}

// Minimal hash routing: "" (app), "#/docs" (documentation), "#/about".
// Docs anchors look like "#/docs?structure-tab" — hashchange re-scrolls.
type Route = { page: "app" | "docs" | "about"; anchor: string | null };
function parseHash(): Route {
  const hash = window.location.hash;
  if (hash.startsWith("#/docs")) {
    const anchor = hash.startsWith("#/docs?") ? hash.slice("#/docs?".length) : null;
    return { page: "docs", anchor };
  }
  if (hash.startsWith("#/about")) return { page: "about", anchor: null };
  return { page: "app", anchor: null };
}

function useHashRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash());
  useEffect(() => {
    const onHashChange = () => {
      setRoute(parseHash());
      const { page, anchor } = parseHash();
      if (page === "docs" && anchor) {
        // scrollIntoView walks up to the nearest scrollable ancestor (the
        // page's main container — the window itself is overflow:hidden).
        requestAnimationFrame(() => {
          document.getElementById(anchor)?.scrollIntoView({ block: "start" });
        });
      } else {
        document.getElementById("page-scroll")?.scrollTo({ top: 0 });
        window.scrollTo(0, 0);
      }
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);
  return route;
}

let sqlTabCounter = 0;
function nextSqlTitle() {
  return `SQL ${++sqlTabCounter}`;
}

const SQLITE_HEADER = "SQLite format 3\u0000";

function looksLikeSqlite(data: ArrayBuffer | Uint8Array): boolean {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  if (bytes.length < 16) return false;
  const expected = SQLITE_HEADER.split("").map((c) => c.charCodeAt(0));
  for (let i = 0; i < 15; i++) {
    if (bytes[i] !== expected[i]) return false;
  }
  return true;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function App({ cliMode = false }: { cliMode?: boolean }) {
  const { showToast } = useToast();

  // Synchronous re-entry guard (state updates are async, so two drops in the
  // same tick would otherwise start two concurrent loads of the same file).
  const busyRef = useRef(false);
  const [hasDb, setHasDb] = useState(false);
  const [filename, setFilename] = useState<string | null>(null);

  const [tables, setTables] = useState<TableInfo[]>([]);
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);

  const [busy, setBusy] = useState<{ message: string; detail: string | null } | null>(null);
  const [fileDetail, setFileDetail] = useState<string | null>(null);

  const [tabResults, setTabResults] = useState<
    Record<string, { result: QueryResult; error: string | null }>
  >({});

  const [structureData, setStructureData] = useState<
    Record<string, { columns: QueryResult; indexes: QueryResult }>
  >({});

  // Sidebar table filter — driven by the WebMCP list_tables tool.
  const [tableFilter, setTableFilter] = useState("");

  // Right-side drawer showing one record in form view.
  const [recordDrawer, setRecordDrawer] = useState<{
    tableName: string;
    columns: ColumnInfo[];
    record: QueryResult;
  } | null>(null);

  // Register the agent-facing WebMCP tools once on mount.
  useEffect(() => {
    initWebMcpTools();
  }, []);

  // Preload the local SQL model (WebLLM) in the background at boot — before
  // any database is opened. Fire-and-forget: downloads are cached by the
  // browser, failures only dim the status pill, nothing blocks the UI.
  // Skipped in CLI mode: local.html boots straight into an open database.
  useEffect(() => {
    if (cliMode) return;
    aiClient.preload(assetUrl(""));
  }, []);

  // Open a database via the worker. `opener` abstracts the source: a local
  // blob (site) or an HTTP range-backed URL (slitex CLI).
  const openDatabase = useCallback(
    async (opener: (onProgress: (p: OpenProgress) => void) => Promise<TableInfo[]>, fname: string) => {
      try {
        setBusy({ message: "Opening database", detail: `${fname} — pages load on demand` });

        const tables = await opener((p: OpenProgress) => {
          setBusy({ message: "Opening database", detail: `${fname} — ${p.detail}` });
        });

        setFilename(fname);
        setHasDb(true);
        setTables(tables);
        setTabs([]);
        setActiveTabId(null);
        setTabResults({});
        setStructureData({});
        setRecordDrawer(null);
        setBusy(null);
        showToast("success", `Loaded "${fname}" — ${tables.length} tables`);

        // Build the SQL completion catalog in the background (schema only,
        // one PRAGMA per table); suggestions appear once it lands.
        void buildSchemaCatalog((sql) => dbClient.query(sql)).then((catalog) => {
          setSchemaCatalog(catalog);
        });
      } catch (err) {
        console.error("Failed to open SQLite database:", err);
        setBusy(null);
        showToast(
          "error",
          `Failed to open database: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    },
    [showToast]
  );

  // CLI mode: the slitex server pre-opens a database — boot straight into
  // the explorer (the drop zone only appears if the open fails).
  useEffect(() => {
    if (!cliMode) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/boot");
        if (!res.ok) throw new Error(`HTTP ${res.status} from /api/boot`);
        const boot = (await res.json()) as { name: string; url: string };
        if (cancelled) return;
        await openDatabase((onP) => dbClient.openRemote(boot.url, boot.name, onP), boot.name);
      } catch (err) {
        console.error("CLI boot failed:", err);
        if (cancelled) return;
        setBusy(null);
        showToast("error", `Failed to open database: ${err instanceof Error ? err.message : String(err)}`);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cliMode, openDatabase, showToast]);

  // Handle file selection/drop
  const handleFilePicked = useCallback(
    async (file: File) => {
      if (busyRef.current) {
        showToast("info", "Still processing, please wait.");
        return;
      }
      busyRef.current = true;
      setFileDetail(null);
      try {
        // 1) Validate the SQLite header up front (16 bytes only): instant
        //    feedback, and we never touch the rest of a non-database file.
        setBusy({
          message: "Checking file",
          detail: `${file.name} (${formatBytes(file.size)})`,
        });
        let header: Uint8Array;
        try {
          header = await peekFileBytes(file, 16);
        } catch (err) {
          console.error("Failed to read file header:", err);
          throw new Error(
            `Could not read "${file.name}". The file may be inaccessible or locked by another application.`
          );
        }
        if (!looksLikeSqlite(header)) {
          console.error("Invalid SQLite header for file:", file.name);
          throw new Error(`"${file.name}" is not a valid SQLite database file.`);
        }

        // 2) Hand the file reference to the worker. SQLite reads pages on
        //    demand through the blob VFS, so multi-GB files open instantly
        //    with no whole-file read.
        await openDatabase((onP) => dbClient.open(file, file.name, onP), file.name);
      } catch (err) {
        // openDatabase reports open failures itself; this catch handles
        // everything before that (header validation).
        setBusy(null);
        showToast("error", err instanceof Error ? err.message : String(err));
      } finally {
        busyRef.current = false;
      }
    },
    [showToast, openDatabase]
  );

  // Load the bundled demo database
  const handleLoadDemo = useCallback(async () => {
    if (busyRef.current) {
      showToast("info", "Still processing, please wait.");
      return;
    }
    busyRef.current = true;
    setFileDetail(null);
    try {
      setBusy({ message: "Loading demo database", detail: "demo.db" });
      const res = await fetch(assetUrl("demo.db"));
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} fetching demo.db`);
      }
      const buffer = await res.arrayBuffer();
      if (!looksLikeSqlite(buffer)) {
        throw new Error("Bundled demo.db failed validation");
      }
      await openDatabase((onP) => dbClient.open(new Blob([buffer]), "demo.db", onP), "demo.db");
    } catch (err) {
      console.error("Failed to load demo database:", err);
      setBusy(null);
      showToast(
        "error",
        `Failed to load demo database: ${err instanceof Error ? err.message : String(err)}`
      );
    } finally {
      busyRef.current = false;
    }
  }, [showToast, openDatabase]);

  // Async query helpers -------------------------------------------------------

  const runTableQuery = useCallback(
    async (tabId: string, sql: string) => {
      try {
        const result = await dbClient.query(sql);
        setTabResults((prev) => ({ ...prev, [tabId]: { result, error: null } }));
      } catch (err) {
        console.error(`Query failed for tab ${tabId}:`, err);
        setTabResults((prev) => ({
          ...prev,
          [tabId]: {
            result: prev[tabId]?.result ?? { columns: [], rows: [] },
            error: err instanceof Error ? err.message : String(err),
          },
        }));
      }
    },
    []
  );

  // Open a data tab for a table
  const openDataTab = useCallback(
    (tableName: string) => {
      try {
        const existing = tabs.find((t) => t.type === "data" && t.tableName === tableName);
        if (existing) {
          setActiveTabId(existing.id);
          return;
        }
        setBusy({ message: `Loading table "${tableName}"`, detail: null });
        const sql = `SELECT * FROM "${tableName}" LIMIT 100`;
        const id = nextTabId();
        const newTab: Tab = { id, type: "data", title: tableName, tableName, sql };
        setTabs((prev) => [...prev, newTab]);
        setActiveTabId(id);
        void runTableQuery(id, sql).finally(() => setBusy(null));
      } catch (err) {
        console.error("Failed to open data tab:", err);
        setBusy(null);
        showToast("error", `Failed to open table: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
    [tabs, showToast, runTableQuery]
  );

  // Open structure tab
  const openStructureTab = useCallback(
    async (tableName: string) => {
      // Allocated up-front (side-effect-free) so it stays a const string and
      // can be used as a computed key inside state-update closures below.
      const structureId = nextTabId();
      try {
        const existing = tabs.find((t) => t.type === "structure" && t.tableName === tableName);
        if (existing) {
          setActiveTabId(existing.id);
          return;
        }
        setBusy({ message: `Analyzing structure of "${tableName}"`, detail: null });
        const newTab: Tab = {
          id: structureId,
          type: "structure",
          title: `${tableName} — Structure`,
          tableName,
        };

        setTabs((prev) => [...prev, newTab]);
        setActiveTabId(structureId);

        const columnsRes = await dbClient.query(`PRAGMA table_info("${tableName}")`);
        const indexListRes = await dbClient.query(`PRAGMA index_list("${tableName}")`);
        const indexRows: CellValue[][] = [];
        for (const idxRow of indexListRes.rows) {
          const indexName = String(idxRow[0]);
          const unique = idxRow[1];
          const origin = idxRow[2];
          const partial = idxRow[3];
          try {
            const infoRes = await dbClient.query(`PRAGMA index_info("${indexName}")`);
            const colNames = infoRes.rows
              .map((r) => (r[2] != null ? formatCellValue(r[2]) : ""))
              .join(", ");
            indexRows.push([indexName, unique, origin, partial, colNames]);
          } catch (err) {
            console.error(`Failed to read index "${indexName}":`, err);
            indexRows.push([indexName, unique, origin, partial, ""]);
          }
        }
        setStructureData((prev) => {
          return {
            ...prev,
            [structureId]: {
              columns: columnsRes,
              indexes: { columns: ["index_name", "unique", "origin", "partial", "columns"], rows: indexRows },
            },
          };
        });
        setBusy(null);
      } catch (err) {
        console.error(`Failed to read structure of "${tableName}":`, err);
        setStructureData((prev) => ({
          ...prev,
          [structureId]: { columns: { columns: [], rows: [] }, indexes: { columns: [], rows: [] } },
        }));
        setBusy(null);
        showToast("error", `Failed to read structure of "${tableName}": ${err instanceof Error ? err.message : String(err)}`);
      }
    },
    [tabs, showToast]
  );

  // Open the record drawer for a table row
  const openRecordDrawer = useCallback(
    async (tableName: string, rowId: number | string) => {
      try {
        setBusy({ message: `Loading record from "${tableName}"`, detail: null });

        const colsRes = await dbClient.query(`PRAGMA table_info("${tableName}")`);
        const colInfos: ColumnInfo[] = colsRes.rows.map((r) => ({
          cid: Number(r[0]),
          name: String(r[1]),
          type: String(r[2] ?? ""),
          notnull: Number(r[3]),
          dflt_value: r[4] == null ? null : formatCellValue(r[4]),
          pk: Number(r[5]),
        }));
        const allCols = colInfos.map((c) => `"${c.name}"`).join(", ");
        // Parameterized: record ids are arbitrary user data (TEXT PKs etc.)
        const recordRes = await dbClient.query(
          `SELECT ${allCols} FROM "${tableName}" WHERE rowid = ?`,
          [rowId]
        );
        setRecordDrawer({ tableName, columns: colInfos, record: recordRes });
        setBusy(null);
      } catch (err) {
        console.error(`Failed to load record ${rowId} of "${tableName}":`, err);
        setBusy(null);
        showToast("error", `Failed to load record: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
    [showToast]
  );

  // Execute SQL from the editor
  const handleRunQuery = useCallback(
    async (tabId: string, sql: string) => {
      try {
        setBusy({ message: "Running query", detail: null });
        await runTableQuery(tabId, sql);
        setTabs((prev) => prev.map((t) => (t.id === tabId ? { ...t, sql } : t)));
      } catch (err) {
        console.error("Failed to run query:", err);
        showToast("error", `Query failed: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        setBusy(null);
      }
    },
    [showToast, runTableQuery]
  );

  // Close tab
  const handleCloseTab = useCallback(
    (tabId: string) => {
      try {
        const idx = tabs.findIndex((t) => t.id === tabId);
        const remaining = tabs.filter((t) => t.id !== tabId);
        setTabs(remaining);
        if (activeTabId === tabId) {
          // Prefer neighbor to the left, else last remaining
          const next = idx > 0 ? remaining[idx - 1] : remaining[remaining.length - 1];
          setActiveTabId(next?.id ?? null);
        }
        setTabResults((prev) => {
          const next = { ...prev };
          delete next[tabId];
          return next;
        });
        setStructureData((prev) => {
          const next = { ...prev };
          delete next[tabId];
          return next;
        });
      } catch (err) {
        console.error("Failed to close tab:", err);
        showToast("error", `Failed to close tab: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
    [tabs, activeTabId, showToast]
  );  // Open/refresh a tab reflecting a WebMCP select_table result (paged SQL).
  const openAgentSqlTab = useCallback(
    async (sql: string, page: number) => {
      try {
        const paged = buildPagedQuery(sql, page);
        const existing = tabs.find((t) => t.type === "data" && t.sql === sql);
        const id = existing ? existing.id : nextTabId();
        if (!existing) {
          const title = nextSqlTitle();
          setTabs((prev) => [...prev, { id, type: "data", title, tableName: "", sql }]);
        }
        setActiveTabId(id);
        const result = await dbClient.query(paged.pageSql);
        setTabResults((prev) => ({ ...prev, [id]: { result, error: null } }));
      } catch (err) {
        console.error("Failed to open WebMCP SQL tab:", err);
        showToast("error", err instanceof Error ? err.message : String(err));
      }
    },
    [tabs, showToast]
  );

  // Keep the WebMCP tool controller pointed at the latest app state/actions.
  useEffect(() => {
    setWebMcpController({
      isReady: () => hasDb,
      getTables: () => tables,
      query: (sql) => dbClient.query(sql),
      setTableFilter: setTableFilter,
      openStructure: (table) => void openStructureTab(table),
      openSqlTab: (sql, page) => void openAgentSqlTab(sql, page),
    });
  });

  // Row double-click → record drawer
  const handleRowDoubleClick = useCallback(
    async (tab: Tab, rowIndex: number) => {
      try {
        const result = tabResults[tab.id]?.result;
        if (!result || rowIndex >= result.rows.length) return;
        const row = result.rows[rowIndex];

        // Prefer an explicit rowid column (present when the query selected one
        // or the table exposes it); otherwise match the row by its first
        // column's value against the table's actual rowid — a column value is
        // NOT the rowid in general (TEXT PKs, WITHOUT ROWID tables).
        const rowidIdx = result.columns.indexOf("rowid");
        if (rowidIdx >= 0 && row[rowidIdx] != null) {
          await openRecordDrawer(tab.tableName, row[rowidIdx] as number | string);
          return;
        }

        setBusy({ message: "Locating record", detail: null });
        const firstCol = result.columns[0];
        const matchRes = await dbClient.query(
          `SELECT rowid FROM "${tab.tableName}" WHERE "${firstCol}" = ? LIMIT 1`,
          [row[0] ?? null]
        );
        const matchedRowId = matchRes.rows[0]?.[0];
        setBusy(null);
        if (matchedRowId != null) {
          await openRecordDrawer(tab.tableName, matchedRowId as number | string);
        } else {
          showToast("info", "Could not determine row id for this row");
        }
      } catch (err) {
        console.error("Failed to open record from row:", err);
        setBusy(null);
        showToast("error", `Failed to open record: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
    [tabResults, openRecordDrawer, showToast]
  );

  // Global drag-and-drop (catches drops outside the FileDropZone)
  useEffect(() => {
    const onWindowDragOver = (e: DragEvent) => {
      e.preventDefault();
    };
    const onWindowDrop = (e: DragEvent) => {
      e.preventDefault();

      // Prefer File System Access API for a real disk handle (bypasses
      // sandboxed FileReader restrictions on large dropped files).
      const item = e.dataTransfer?.items?.[0] as
        | (DataTransferItem & { getAsFileSystemHandle?: () => Promise<FileSystemFileHandle | null> })
        | undefined;
      if (item?.getAsFileSystemHandle) {
        item
          .getAsFileSystemHandle()
          .then((handle) => {
            if (handle && "getFile" in handle) {
              return handle.getFile();
            }
            return null;
          })
          .then((file) => {
            if (file) {
              void handleFilePicked(file);
              return;
            }
            const fallback = e.dataTransfer?.files?.[0];
            if (fallback) void handleFilePicked(fallback);
          })
          .catch((err) => {
            console.warn("getAsFileSystemHandle failed, falling back to DataTransfer.files:", err);
            const fallback = e.dataTransfer?.files?.[0];
            if (fallback) void handleFilePicked(fallback);
          });
        return;
      }

      const file = e.dataTransfer?.files?.[0];
      if (file) void handleFilePicked(file);
    };
    window.addEventListener("dragover", onWindowDragOver, false);
    window.addEventListener("drop", onWindowDrop, false);
    return () => {
      window.removeEventListener("dragover", onWindowDragOver);
      window.removeEventListener("drop", onWindowDrop);
    };
  }, [handleFilePicked]);

  const activeTab = tabs.find((t) => t.id === activeTabId);
  const filterText = tableFilter.trim().toLowerCase();
  const visibleTables = filterText
    ? tables.filter((t) => t.name.toLowerCase().includes(filterText))
    : tables;

  if (!hasDb) {
    return (
      <div className="h-screen w-screen flex flex-col bg-gray-50">
        <header className="px-6 py-3 bg-gray-900 text-white flex items-center gap-3 shrink-0">
          <span className="text-lg">🗄️</span>
          <h1 className="text-sm font-semibold">SQLite Explorer</h1>
          <nav className="ml-auto flex items-center gap-4 text-xs">
            <a href="#/docs" className="text-gray-300 hover:text-white transition-colors">Docs</a>
            <a href="#/about" className="text-gray-300 hover:text-white transition-colors">About</a>
          </nav>
        </header>
        <FileDropZone onPickFile={handleFilePicked} isLoading={busy != null} onDemo={handleLoadDemo} />
        <LoadingOverlay
          visible={busy != null}
          message={busy?.message ?? ""}
          detail={busy?.detail ?? fileDetail}
          indeterminate
        />
      </div>
    );
  }

  return (
    <div className="h-screen w-screen flex flex-col bg-white">
      <header className="px-4 py-2 bg-gray-900 text-white flex items-center gap-3 shrink-0">
        <span className="text-lg">🗄️</span>
        <h1 className="text-sm font-semibold">SQLite Explorer</h1>
        {!cliMode && <AiStatusPill />}
        <nav className="flex items-center gap-4 text-xs">
          <a href="#/docs" className="text-gray-300 hover:text-white transition-colors">Docs</a>
          <a href="#/about" className="text-gray-300 hover:text-white transition-colors">About</a>
        </nav>
        {filename && (
          <>
            <span className="text-gray-500 text-xs">—</span>
            <span className="text-xs text-gray-400 font-mono truncate max-w-[300px]">{filename}</span>
          </>
        )}
        <button
          onClick={() => {
            // Reload the page to reset to the initial state
            void dbClient.close();
            window.location.reload();
          }}
          className="ml-auto text-xs bg-gray-700 hover:bg-gray-600 px-3 py-1 rounded transition-colors"
        >
          Load another file
        </button>
      </header>

      {/* Body */}
      <div className="flex flex-1 min-h-0">
        <Sidebar
          tables={visibleTables}
          filteredFrom={tables.length}
          activeTable={activeTab?.tableName ?? null}
          onSelectTable={openDataTab}
          onSelectStructure={openStructureTab}
        />
        <div className="flex flex-col flex-1 min-w-0 min-h-0">
          <TabBar tabs={tabs} activeTabId={activeTabId} onSelectTab={setActiveTabId} onCloseTab={handleCloseTab} />
          {activeTab ? (
            <div className="flex flex-col flex-1 min-h-0">
              {activeTab.type === "data" && (
                <Suspense fallback={<div className="h-[180px] border-b border-gray-200 bg-gray-50 animate-pulse" />}>
                  <SqlEditor
                    key={activeTab.id}
                    initialSql={activeTab.sql ?? ""}
                    isEditable
                    onRun={(sql) => void handleRunQuery(activeTab.id, sql)}
                    error={tabResults[activeTab.id]?.error ?? null}
                  />
                </Suspense>
              )}
              {activeTab.type === "data" && (
                <DataGrid
                  columns={tabResults[activeTab.id]?.result.columns ?? []}
                  rows={tabResults[activeTab.id]?.result.rows ?? []}
                  onRowDoubleClick={(rowIdx) => handleRowDoubleClick(activeTab, rowIdx)}
                />
              )}
              {activeTab.type === "structure" && structureData[activeTab.id] && (
                <StructureTab
                  columnsData={structureData[activeTab.id].columns}
                  indexesData={structureData[activeTab.id].indexes}
                />
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center flex-1 text-gray-400 text-sm">
              Click a table in the sidebar to get started
            </div>
          )}
        </div>
      </div>

      <RecordDrawer
        drawer={recordDrawer}
        onClose={() => setRecordDrawer(null)}
      />

      <LoadingOverlay visible={busy != null} message={busy?.message ?? ""} detail={busy?.detail ?? fileDetail} indeterminate />
    </div>
  );
}



export default function WrappedApp({ cliMode = false }: { cliMode?: boolean }) {
  const route = useHashRoute();

  if (route.page === "docs" || route.page === "about") {
    return (
      <div className="h-screen flex flex-col bg-white">
        <header className="px-6 py-3 bg-gray-900 text-white flex items-center gap-3 shrink-0 z-10">
          <a
            href="#/"
            className="flex items-center gap-3 text-white hover:opacity-90 transition-opacity"
          >
            <span className="text-lg">🗄️</span>
            <h1 className="text-sm font-semibold">SQLite Explorer</h1>
          </a>
          <nav className="ml-auto flex items-center gap-4 text-xs">
            <a
              href="#/docs"
              className={`transition-colors ${route.page === "docs" ? "text-white font-semibold" : "text-gray-300 hover:text-white"}`}
            >
              Docs
            </a>
            <a
              href="#/about"
              className={`transition-colors ${route.page === "about" ? "text-white font-semibold" : "text-gray-300 hover:text-white"}`}
            >
              About
            </a>
            <a
              href="#/"
              className="bg-gray-700 hover:bg-gray-600 px-3 py-1 rounded transition-colors"
            >
              ← Back to app
            </a>
          </nav>
        </header>
        <main id="page-scroll" className="flex-1 overflow-y-auto min-h-0">
          {route.page === "docs" ? <DocsPage /> : <AboutPage />}
        </main>
      </div>
    );
  }
  return (
    <ToastProvider>
      <App cliMode={cliMode} />
    </ToastProvider>
  );
}

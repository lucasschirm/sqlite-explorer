import { useState, useCallback, useRef, useEffect } from "react";
import initSqlJs, { type Database } from "sql.js";
import type { TableInfo, Tab, ColumnInfo, QueryResult } from "./types";
import { ToastProvider, useToast } from "./components/Toast";
import { LoadingOverlay } from "./components/LoadingOverlay";
import { FileDropZone } from "./components/FileDropZone";
import { Sidebar } from "./components/Sidebar";
import { TabBar } from "./components/TabBar";
import { SqlEditor } from "./components/SqlEditor";
import { DataGrid } from "./components/DataGrid";
import { StructureTab } from "./components/StructureTab";
import { RecordTab } from "./components/RecordTab";

let tabIdCounter = 0;
function nextTabId() {
  return `tab-${++tabIdCounter}`;
}

const SQLITE_HEADER = "SQLite format 3\u0000";

function looksLikeSqlite(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 16) return false;
  const header = new Uint8Array(buffer.slice(0, 16));
  const expected = SQLITE_HEADER.split("").map((c) => c.charCodeAt(0));
  for (let i = 0; i < 15; i++) {
    if (header[i] !== expected[i]) return false;
  }
  return true;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

// Base-aware URL for static assets (works locally, Freebuff, and GitHub Pages)
const BASE = (import.meta.env.BASE_URL ?? "/").replace(/\/?$/, "/");
const assetUrl = (name: string) => `${BASE}${name}`;

function App() {
  const { showToast } = useToast();

  const dbRef = useRef<Database | null>(null);
  const [hasDb, setHasDb] = useState(false);
  const [filename, setFilename] = useState<string | null>(null);

  const [tables, setTables] = useState<TableInfo[]>([]);
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);

  const [busy, setBusy] = useState<{ message: string; detail: string | null } | null>(null);
  const [fileProgress, setFileProgress] = useState<number | null>(null);
  const [fileDetail, setFileDetail] = useState<string | null>(null);

  const [tabResults, setTabResults] = useState<
    Record<string, { result: QueryResult; error: string | null }>
  >({});

  const [structureData, setStructureData] = useState<
    Record<string, { columns: QueryResult; indexes: QueryResult }>
  >({});

  const [recordData, setRecordData] = useState<
    Record<string, { columns: ColumnInfo[]; record: QueryResult }>
  >({});

  const loadTables = useCallback(
    (db: Database) => {
      const tableNames: string[] = [];
      try {
        const res = db.exec("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
        if (res.length > 0) {
          for (const row of res[0].values) {
            tableNames.push(String(row[0]));
          }
        }
      } catch (err) {
        console.error("Failed to list tables:", err);
        showToast("error", "Failed to list tables. See console for details.");
        return;
      }

      const tableInfos: TableInfo[] = tableNames.map((name) => {
        try {
          const countRes = db.exec(`SELECT COUNT(*) FROM "${name}"`);
          return { name, rowCount: (countRes[0]?.values[0]?.[0] as number) ?? 0 };
        } catch (err) {
          console.error(`Failed to count rows of "${name}":`, err);
          return { name, rowCount: 0 };
        }
      });
      setTables(tableInfos);
      return tableInfos;
    },
    [showToast]
  );

  // Core: open a database from an in-memory buffer and reset UI state
  const loadDbFromBuffer = useCallback(
    async (buffer: ArrayBuffer, fname: string) => {
      try {
        setBusy({ message: "Parsing database", detail: fname });
        const SQL = await initSqlJs({ locateFile: (f) => assetUrl(f) });
        const db = new SQL.Database(new Uint8Array(buffer));
        dbRef.current = db;
        setFilename(fname);
        setHasDb(true);
        const infos = loadTables(db) ?? [];
        setTabs([]);
        setActiveTabId(null);
        setTabResults({});
        setStructureData({});
        setRecordData({});
        setBusy(null);
        showToast("success", `Loaded "${fname}" — ${infos.length} tables`);
      } catch (err) {
        console.error("Failed to open SQLite database:", err);
        setBusy(null);
        showToast(
          "error",
          `Failed to parse database: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    },
    [loadTables, showToast]
  );

  // Handle file selection/drop
  const handleFilePicked = useCallback(
    (file: File) => {
      if (busy) {
        showToast("info", "Still processing, please wait.");
        return;
      }
      setBusy({ message: "Reading file", detail: `${file.name} (${formatBytes(file.size)})` });
      setFileProgress(0);
      setFileDetail(null);

      const reader = new FileReader();

      reader.onprogress = (e) => {
        if (e.lengthComputable) setFileProgress(e.loaded / e.total);
      };
      reader.onerror = () => {
        console.error("FileReader error:", reader.error);
        setBusy(null);
        setFileProgress(null);
        showToast("error", `Failed to read file: ${reader.error?.message ?? "unknown error"}`);
      };
      reader.onload = () => {
        try {
          const buffer = reader.result as ArrayBuffer;
          setFileProgress(null);
          if (!looksLikeSqlite(buffer)) {
            setBusy(null);
            console.error("Invalid SQLite header for file:", file.name);
            showToast("error", `"${file.name}" is not a valid SQLite database file.`);
            return;
          }
          loadDbFromBuffer(buffer, file.name);
        } catch (err) {
          console.error("Unexpected error loading file:", err);
          setBusy(null);
          showToast(
            "error",
            `Unexpected error loading file: ${err instanceof Error ? err.message : String(err)}`
          );
        }
      };

      try {
        reader.readAsArrayBuffer(file);
      } catch (err) {
        console.error("Failed to start reading file:", err);
        setBusy(null);
        showToast("error", `Failed to start reading file: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
    [busy, showToast, loadDbFromBuffer]
  );

  // Load the bundled demo database
  const handleLoadDemo = useCallback(async () => {
    if (busy) {
      showToast("info", "Still processing, please wait.");
      return;
    }
    setBusy({ message: "Loading demo database", detail: "demo.db" });
    setFileProgress(null);
    try {
      const res = await fetch(assetUrl("demo.db"));
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} fetching demo.db`);
      }
      const buffer = await res.arrayBuffer();
      if (!looksLikeSqlite(buffer)) {
        throw new Error("Bundled demo.db failed validation");
      }
      await loadDbFromBuffer(buffer, "demo.db");
    } catch (err) {
      console.error("Failed to load demo database:", err);
      setBusy(null);
      showToast(
        "error",
        `Failed to load demo database: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }, [busy, showToast, loadDbFromBuffer]);

  // Open a data tab for a table
  const openDataTab = useCallback(
    (tableName: string) => {
      try {
        if (!dbRef.current) {
          showToast("error", "No database loaded");
          return;
        }
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
        try {
          const result = executeQuery(dbRef.current, sql);
          setTabResults((prev) => ({ ...prev, [id]: { result, error: null } }));
        } catch (err) {
          console.error(`Failed to load table "${tableName}":`, err);
          setTabResults((prev) => ({
            ...prev,
            [id]: { result: { columns: [], rows: [] }, error: err instanceof Error ? err.message : String(err) },
          }));
        } finally {
          setBusy(null);
        }
      } catch (err) {
        console.error("Failed to open data tab:", err);
        setBusy(null);
        showToast("error", `Failed to open table: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
    [tabs, showToast]
  );

  // Open structure tab
  const openStructureTab = useCallback(
    (tableName: string) => {
      try {
        if (!dbRef.current) {
          showToast("error", "No database loaded");
          return;
        }
        const existing = tabs.find((t) => t.type === "structure" && t.tableName === tableName);
        if (existing) {
          setActiveTabId(existing.id);
          return;
        }
        setBusy({ message: `Analyzing structure of "${tableName}"`, detail: null });
        const id = nextTabId();
        const newTab: Tab = {
          id,
          type: "structure",
          title: `${tableName} — Structure`,
          tableName,
        };
        setTabs((prev) => [...prev, newTab]);
        setActiveTabId(id);
        const db = dbRef.current;
        try {
          const columnsRes = executeQuery(db, `PRAGMA table_info("${tableName}")`);
          const indexListRes = executeQuery(db, `PRAGMA index_list("${tableName}")`);
          const indexRows: (string | number | null)[][] = [];
          for (const idxRow of indexListRes.rows) {
            const indexName = String(idxRow[0]);
            const unique = idxRow[1];
            const origin = idxRow[2];
            const partial = idxRow[3];
            try {
              const infoRes = executeQuery(db, `PRAGMA index_info("${indexName}")`);
              const colNames = infoRes.rows.map((r) => (r[2] != null ? String(r[2]) : "")).join(", ");
              indexRows.push([indexName, unique, origin, partial, colNames]);
            } catch (err) {
              console.error(`Failed to read index "${indexName}":`, err);
              indexRows.push([indexName, unique, origin, partial, ""]);
            }
          }
          setStructureData((prev) => ({
            ...prev,
            [id]: {
              columns: columnsRes,
              indexes: { columns: ["index_name", "unique", "origin", "partial", "columns"], rows: indexRows },
            },
          }));
        } catch (err) {
          console.error(`Failed to read structure of "${tableName}":`, err);
          setStructureData((prev) => ({
            ...prev,
            [id]: { columns: { columns: [], rows: [] }, indexes: { columns: [], rows: [] } },
          }));
          showToast("error", `Failed to read structure of "${tableName}"`);
        } finally {
          setBusy(null);
        }
      } catch (err) {
        console.error("Failed to open structure tab:", err);
        setBusy(null);
        showToast("error", `Failed to open structure: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
    [tabs, showToast]
  );

  // Open record tab
  const openRecordTab = useCallback(
    (tableName: string, rowId: number | string) => {
      try {
        if (!dbRef.current) {
          showToast("error", "No database loaded");
          return;
        }
        const tabKey = `${tableName}-record-${rowId}`;
        const existing = tabs.find((t) => t.id === tabKey);
        if (existing) {
          setActiveTabId(existing.id);
          return;
        }
        setBusy({ message: `Loading record ${rowId} from "${tableName}"`, detail: null });
        const newTab: Tab = { id: tabKey, type: "record", title: `Record ${rowId}`, tableName, recordId: rowId };
        setTabs((prev) => [...prev, newTab]);
        setActiveTabId(tabKey);
        const db = dbRef.current;
        try {
          const colsRes = executeQuery(db, `PRAGMA table_info("${tableName}")`);
          const colInfos: ColumnInfo[] = colsRes.rows.map((r) => ({
            cid: r[0] as number,
            name: String(r[1]),
            type: String(r[2] ?? ""),
            notnull: r[3] as number,
            dflt_value: (r[4] as string | null) ?? null,
            pk: r[5] as number,
          }));
          const allCols = colInfos.map((c) => `"${c.name}"`).join(", ");
          const recordRes = executeQuery(db, `SELECT ${allCols} FROM "${tableName}" WHERE rowid = ${rowId}`);
          setRecordData((prev) => ({ ...prev, [tabKey]: { columns: colInfos, record: recordRes } }));
        } catch (err) {
          console.error(`Failed to load record ${rowId} of "${tableName}":`, err);
          setRecordData((prev) => ({
            ...prev,
            [tabKey]: { columns: [], record: { columns: [], rows: [] } },
          }));
          showToast("error", `Failed to load record: ${err instanceof Error ? err.message : String(err)}`);
        } finally {
          setBusy(null);
        }
      } catch (err) {
        console.error("Failed to open record tab:", err);
        setBusy(null);
        showToast("error", `Failed to open record: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
    [tabs, showToast]
  );

  // Execute SQL from the editor
  const handleRunQuery = useCallback(
    (tabId: string, sql: string) => {
      try {
        if (!dbRef.current) {
          showToast("error", "No database loaded");
          return;
        }
        setBusy({ message: "Running query", detail: null });
        try {
          const result = executeQuery(dbRef.current, sql);
          setTabResults((prev) => ({ ...prev, [tabId]: { result, error: null } }));
          setTabs((prev) => prev.map((t) => (t.id === tabId ? { ...t, sql } : t)));
        } catch (err) {
          console.error("SQL error:", err);
          setTabResults((prev) => ({
            ...prev,
            [tabId]: {
              result: prev[tabId]?.result ?? { columns: [], rows: [] },
              error: err instanceof Error ? err.message : String(err),
            },
          }));
        } finally {
          setBusy(null);
        }
      } catch (err) {
        console.error("Failed to run query:", err);
        setBusy(null);
        showToast("error", `Query failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
    [showToast]
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
        setRecordData((prev) => {
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
  );

  // Row double-click → record tab
  const handleRowDoubleClick = useCallback(
    (tab: Tab, rowIndex: number) => {
      try {
        if (!dbRef.current) return;
        const result = tabResults[tab.id]?.result;
        if (!result || rowIndex >= result.rows.length) return;
        const row = result.rows[rowIndex];
        const rowidIdx = result.columns.indexOf("rowid");
        const rowId = rowidIdx >= 0 ? row[rowidIdx] : row[0];
        if (rowId != null) {
          openRecordTab(tab.tableName, rowId as number | string);
        } else {
          showToast("info", "Could not determine row id for this row");
        }
      } catch (err) {
        console.error("Failed to open record from row:", err);
        showToast("error", `Failed to open record: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
    [tabResults, openRecordTab, showToast]
  );

  // Global drag-and-drop
  useEffect(() => {
    const onWindowDragOver = (e: DragEvent) => {
      e.preventDefault();
    };
    const onWindowDrop = (e: DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer?.files?.[0];
      if (file) handleFilePicked(file);
    };
    window.addEventListener("dragover", onWindowDragOver, false);
    window.addEventListener("drop", onWindowDrop, false);
    return () => {
      window.removeEventListener("dragover", onWindowDragOver);
      window.removeEventListener("drop", onWindowDrop);
    };
  }, [handleFilePicked]);

  const activeTab = tabs.find((t) => t.id === activeTabId);

  if (!hasDb) {
    return (
      <div className="h-screen w-screen flex flex-col bg-gray-50">
        <header className="px-6 py-3 bg-gray-900 text-white flex items-center gap-3 shrink-0">
          <span className="text-lg">🗄️</span>
          <h1 className="text-sm font-semibold">SQLite Viewer</h1>
        </header>
        <FileDropZone onPickFile={handleFilePicked} isLoading={busy != null} onDemo={handleLoadDemo} />
        <LoadingOverlay
          visible={busy != null}
          message={busy?.message ?? ""}
          detail={busy?.detail ?? fileDetail}
          indeterminate={fileProgress == null}
          progress={fileProgress ?? undefined}
        />
      </div>
    );
  }

  return (
    <div className="h-screen w-screen flex flex-col bg-white">
      <header className="px-4 py-2 bg-gray-900 text-white flex items-center gap-3 shrink-0">
        <span className="text-lg">🗄️</span>
        <h1 className="text-sm font-semibold">SQLite Viewer</h1>
        {filename && (
          <>
            <span className="text-gray-500 text-xs">—</span>
            <span className="text-xs text-gray-400 font-mono truncate max-w-[300px]">{filename}</span>
          </>
        )}
        <button
          onClick={() => {
            // Reload the page to reset to the initial state
            dbRef.current?.close();
            dbRef.current = null;
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
          tables={tables}
          activeTable={activeTab?.tableName ?? null}
          onSelectTable={openDataTab}
          onSelectStructure={openStructureTab}
        />
        <div className="flex flex-col flex-1 min-w-0 min-h-0">
          <TabBar tabs={tabs} activeTabId={activeTabId} onSelectTab={setActiveTabId} onCloseTab={handleCloseTab} />
          {activeTab ? (
            <div className="flex flex-col flex-1 min-h-0">
              {activeTab.type === "data" && (
                <SqlEditor
                  key={activeTab.id}
                  initialSql={activeTab.sql ?? ""}
                  isEditable
                  onRun={(sql) => handleRunQuery(activeTab.id, sql)}
                  error={tabResults[activeTab.id]?.error ?? null}
                />
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
              {activeTab.type === "record" && recordData[activeTab.id] && (
                <RecordTab columns={recordData[activeTab.id].columns} record={recordData[activeTab.id].record} />
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center flex-1 text-gray-400 text-sm">
              Click a table in the sidebar to get started
            </div>
          )}
        </div>
      </div>

      <LoadingOverlay
        visible={busy != null}
        message={busy?.message ?? ""}
        detail={busy?.detail ?? fileDetail}
        indeterminate={fileProgress == null}
        progress={fileProgress ?? undefined}
      />
    </div>
  );
}

function executeQuery(db: Database, sql: string): QueryResult {
  const results = db.exec(sql);
  if (results.length === 0) return { columns: [], rows: [] };
  const first = results[0];
  return { columns: first.columns, rows: first.values };
}

export default function WrappedApp() {
  return (
    <ToastProvider>
      <App />
    </ToastProvider>
  );
}

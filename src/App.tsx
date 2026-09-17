import { useState, useCallback, useRef, useEffect, Suspense, lazy } from "react";
import type { TableInfo, Tab, ColumnInfo, QueryResult, CellValue } from "./types";
import { formatCellValue } from "./types";
import { peekFileBytes, looksLikeSqlite } from "./lib/readFile";
import { initHandoverReceiver, allowedOriginsFromLocation } from "./lib/handover";
import { dbClient, type OpenProgress } from "./lib/dbClient";
import { ToastProvider, useToast } from "./components/Toast";
import { LoadingOverlay } from "./components/LoadingOverlay";
import { FileDropZone } from "./components/FileDropZone";
import { Sidebar } from "./components/Sidebar";
import { SidebarResizer, SIDEBAR_DEFAULT_WIDTH } from "./components/SidebarResizer";
import { TabBar } from "./components/TabBar";
import { NameModal } from "./components/NameModal";
import { SaveOptionsModal } from "./components/SaveOptionsModal";
import { NoProjectModal } from "./components/NoProjectModal";
import type { ProjectsSectionMode } from "./components/ProjectsSection";
import {
  listProjects,
  createProject,
  deleteProject,
  deleteView,
  findView,
  getViewFrom,
  upsertView,
  projectNameExists,
  viewNameExists,
  type StoredProject,
} from "./lib/projectsStore";
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
import { suggestViewName } from "./lib/aiViewName";
import { useAiStatus } from "./hooks/useAiStatus";
import { AiStatusPill } from "./components/AiStatusPill";
import { assetUrl } from "./lib/assetUrl";
import { siteUrl } from "./lib/siteUrl";

let tabIdCounter = 0;
function nextTabId() {
  return `tab-${++tabIdCounter}`;
}

// Legacy hash URLs (#/docs, #/docs?<anchor>, #/about) redirect to the real
// /docs and /about pages — prerendered since the SSG conversion — preserving
// deep-link anchors as a query param.

let sqlTabCounter = 0;
function nextSqlTitle() {
  return `SQL ${++sqlTabCounter}`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function Explorer({ cliMode = false }: { cliMode?: boolean }) {
  const { showToast } = useToast();
  // Synchronous re-entry guard (state updates are async, so two drops in the
  // same tick would otherwise start two concurrent loads of the same file).
  const busyRef = useRef(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  // Latest openDatabase closure, readable from the stable handover listener.
  const openDatabaseRef = useRef<
    ((opener: (onProgress: (p: OpenProgress) => void) => Promise<TableInfo[]>, fname: string) => Promise<void>) | null
  >(null);
  const [hasDb, setHasDb] = useState(false);
  const [filename, setFilename] = useState<string | null>(null);

  // Legacy hash URLs (#/docs, #/docs?<anchor>, #/about) redirect to the real
  // /docs and /about pages, preserving deep-link anchors.
  useEffect(() => {
    const hash = window.location.hash;
    if (!hash.startsWith("#/docs") && !hash.startsWith("#/about")) return;
    const target = hash.startsWith("#/docs") ? "/docs" : "/about";
    const anchor = hash.startsWith("#/docs?") ? hash.slice("#/docs?".length) : null;
    window.location.replace(anchor ? `${target}?${anchor}` : target);
  }, []);

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

  // Draggable sidebar width (px), managed by the SidebarResizer handle.
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT_WIDTH);

  // Projects & views (persisted in localStorage). A project groups saved SQL
  // views; opening one swaps the sidebar's Projects list for its Views list
  // and shows the view editor in the main pane.
  const [projects, setProjects] = useState<StoredProject[]>(() => listProjects());
  const [projectsMode, setProjectsMode] = useState<ProjectsSectionMode>("projects");
  const [openProjectId, setOpenProjectId] = useState<string | null>(null);
  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  const [viewSql, setViewSql] = useState("");
  const [viewSavedSql, setViewSavedSql] = useState("");
  const [viewResult, setViewResult] = useState<{ result: QueryResult; error: string | null } | null>(null);
  const [viewEditorOpen, setViewEditorOpen] = useState(false);
  const viewDirty = viewSql !== viewSavedSql;
  // Browser-only SPA: reading localStorage lazily at first render is safe.
  // After every mutation we re-read with setProjects(listProjects()).

  // Modals: create-project, save-existing-view options, name-new-view,
  // and the "no project open" prompt shown when saving without one.
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [viewNameModalOpen, setViewNameModalOpen] = useState(false);
  const [noProjectModalOpen, setNoProjectModalOpen] = useState(false);
  // SQL the pending save came from — the Save button exists on every SQL
  // editor (view editor and plain data tabs), so this pins the source text.
  const [saveEditorSql, setSaveEditorSql] = useState<string | null>(null);
  // AI-suggested view name, filled in while the name modal is open.
  const [aiSuggestion, setAiSuggestion] = useState("");
  const { status: aiStatus } = useAiStatus();
  const aiEnabled = aiStatus === "ready";

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

  // Preload the local SQL model (WebLLM, served from cdn.lucasschirm.com) in
  // the background at boot — before
  // any database is opened. Fire-and-forget: downloads are cached by the
  // browser, failures only dim the status pill, nothing blocks the UI.
  // Skipped in CLI mode: local.html boots straight into an open database.
  useEffect(() => {
    if (cliMode) return;
    aiClient.preload(assetUrl(""));
  }, []);

  // Open a database via the worker. `opener` abstracts the source: a local
  // blob (site) or an HTTP range-backed URL (sqlitexp CLI).
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
      }  }, [showToast]);

  // Keep the handover listener's view of openDatabase current.
  useEffect(() => {
    openDatabaseRef.current = openDatabase;
  });

  // CLI mode: the sqlitexp server pre-opens a database — boot straight into
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

  // Accept database handovers from other windows (popups/iframes of host
  // pages — see examples/sqlite-handover). Mounted once; the allowed origins
  // are parsed from the URL at boot and the callback goes through a ref so a
  // changing openDatabase identity never re-registers the listener.
  useEffect(() => {
    return initHandoverReceiver((blob, name) => {
      const open = openDatabaseRef.current;
      if (!open) return;
      void open(() => dbClient.open(blob, name), name);
    }, { allowedOrigins: allowedOriginsFromLocation() });
  }, []);

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
        setViewEditorOpen(false); // table click takes over the main pane
        setActiveViewId(null); // and deselects any open view
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
        setViewEditorOpen(false); // table click takes over the main pane
        setActiveViewId(null); // and deselects any open view

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

  // Projects & views -----------------------------------------------------------

  /** Run a view's SQL in the main-pane editor and record it as saved state. */
  const runViewSql = useCallback(async (sql: string) => {
    try {
      setBusy({ message: "Running query", detail: null });
      const result = await dbClient.query(sql);
      setViewResult({ result, error: null });
    } catch (err) {
      setViewResult({
        result: { columns: [], rows: [] },
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(null);
      // A manual run re-baselines the dirty badge, mirroring tab behavior.
      setViewSavedSql(sql);
    }
  }, []);

  /** Clear the view editor back to a fresh, closed state. */
  const resetViewEditor = useCallback(() => {
    setActiveViewId(null);
    setViewEditorOpen(false);
    setViewSql("");
    setViewSavedSql("");
    setViewResult(null);
  }, []);

  const openProjectViews = useCallback(
    (projectId: string) => {
      resetViewEditor();
      setProjectsMode("views");
      setOpenProjectId(projectId);
    },
    [resetViewEditor]
  );

  const closeProjectViews = useCallback(() => {
    resetViewEditor();
    setProjectsMode("projects");
    setOpenProjectId(null);
  }, [resetViewEditor]);

  /** Continue a save that started with no project open. */
  const resumePendingSave = useCallback(
    (sql: string) => {
      setActiveViewId(null);
      setViewEditorOpen(true);
      setViewSql(sql);
      setViewSavedSql("");
      setViewResult(null);
      setAiSuggestion("");
      setViewNameModalOpen(true);
      setSaveEditorSql(null);
    },
    []
  );

  const handleCreateProject = useCallback(
    (name: string) => {
      try {
        const project = createProject(name);
        setProjectModalOpen(false);
        setProjects(listProjects());
        openProjectViews(project.id);
        // A save started with no project open: resume it in the new project.
        if (saveEditorSql != null) {
          resumePendingSave(saveEditorSql);
        }
        showToast("success", `Project "${project.name}" created`);
      } catch (err) {
        console.error("Failed to create project:", err);
        showToast("error", `Failed to create project: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
    [openProjectViews, resumePendingSave, saveEditorSql, showToast]
  );

  const handleDeleteProject = useCallback(
    (projectId: string) => {
      try {
        const name = projects.find((p) => p.id === projectId)?.name ?? "project";
        deleteProject(projectId);
        setProjects(listProjects());
        // closeProjectViews also exits views mode and clears the open project.
        if (openProjectId === projectId) closeProjectViews();
        showToast("success", `Deleted project "${name}"`);
      } catch (err) {
        console.error("Failed to delete project:", err);
        showToast("error", `Failed to delete project: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
    [projects, openProjectId, closeProjectViews, showToast]
  );

  /** Create-view button (Views section): empty editor on the right. */
  const handleStartCreateView = useCallback(() => {
    if (!openProjectId) return;
    setActiveViewId(null);
    setViewSql("");
    setViewSavedSql("");
    setViewResult(null);
    setViewEditorOpen(true);
  }, [openProjectId]);

  /** Click an existing view: open with its SQL filled in and executed. */
  const handleSelectView = useCallback(
    (projectId: string, viewId: string) => {
      const found = findView(projectId, viewId);
      if (!found) {
        showToast("error", "That view no longer exists");
        setProjects(listProjects());
        return;
      }
      setProjectsMode("views");
      setOpenProjectId(projectId);
      setActiveViewId(viewId);
      setViewEditorOpen(true);
      setViewSql(found.view.sql);
      setViewSavedSql(found.view.sql);
      setViewResult(null);
      void runViewSql(found.view.sql);
    },
    [runViewSql, showToast]
  );

  const handleCloseViewEditor = resetViewEditor;

  /**
   * Save button / Ctrl+Cmd+S from any SQL editor. No project open → invite to
   * create one; existing view selected → options modal; otherwise name modal.
   */
  const handleSaveViewClicked = useCallback(
    (sql: string) => {
      if (!sql.trim()) {
        showToast("info", "Write some SQL first");
        return;
      }
      setSaveEditorSql(sql);
      if (!openProjectId) {
        setNoProjectModalOpen(true);
      } else if (activeViewId != null) {
        setSaveModalOpen(true);
      } else {
        setAiSuggestion("");
        setViewNameModalOpen(true);
      }
    },
    [openProjectId, activeViewId, showToast]
  );

  // While the name modal is open, ask the local AI for a view-name suggestion
  // (only when the model is ready — otherwise the field stays empty).
  useEffect(() => {
    if (!viewNameModalOpen || !aiEnabled) return;
    let cancelled = false;
    void suggestViewName(saveEditorSql ?? viewSql).then((name) => {
      if (!cancelled) setAiSuggestion(name);
    });
    return () => {
      cancelled = true;
    };
  }, [viewNameModalOpen, aiEnabled, saveEditorSql, viewSql]);

  /** SaveOptionsModal → Save: update the existing view (name + SQL) in place. */
  const handleSaveExistingView = useCallback(
    (name: string) => {
      if (!openProjectId || activeViewId == null) return;
      try {
        upsertView(openProjectId, activeViewId, name, saveEditorSql ?? viewSql);
        setSaveModalOpen(false);
        setSaveEditorSql(null);
        setProjects(listProjects());
        setViewSavedSql(saveEditorSql ?? viewSql);
        showToast("success", `View "${name}" saved`);
      } catch (err) {
        console.error("Failed to save view:", err);
        showToast("error", `Failed to save view: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
    [openProjectId, activeViewId, saveEditorSql, viewSql, showToast]
  );

  /** SaveOptionsModal → Create new view → same name modal as a new view. */
  const handleSaveAsNewView = useCallback(() => {
    setSaveModalOpen(false);
    setActiveViewId(null); // save as a brand-new view, don't touch the existing one
    setAiSuggestion("");
    setViewNameModalOpen(true);
  }, []);

  /** NameModal confirm for a (new) view name. */
  const handleSaveNamedView = useCallback(
    (name: string) => {
      if (!openProjectId) return;
      const sql = saveEditorSql ?? viewSql;
      try {
        const saved = upsertView(openProjectId, activeViewId, name, sql);
        setViewNameModalOpen(false);
        setSaveEditorSql(null);
        setProjects(listProjects());
        // Only the view editor tracks selection/saved state — a save from a
        // plain data tab leaves that tab as-is.
        if (viewEditorOpen) {
          setActiveViewId(saved.id);
          setViewSavedSql(sql);
        }
        showToast("success", `View "${saved.name}" saved`);
      } catch (err) {
        console.error("Failed to save view:", err);
        showToast("error", `Failed to save view: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
    [openProjectId, activeViewId, saveEditorSql, viewSql, viewEditorOpen, showToast]
  );

  /** Shared duplicate-name check for both save modals. */
  const validateViewName = useCallback(
    (name: string) =>
      openProjectId && viewNameExists(openProjectId, name, activeViewId ?? undefined)
        ? `A view named “${name}” already exists in this project`
        : null,
    [openProjectId, activeViewId]
  );

  const handleDeleteView = useCallback(
    (projectId: string, viewId: string) => {
      try {
        const name = getViewFrom(projects, projectId, viewId)?.name ?? "view";
        deleteView(projectId, viewId);
        setProjects(listProjects());
        if (activeViewId === viewId) resetViewEditor();
        showToast("success", `Deleted view "${name}"`);
      } catch (err) {
        console.error("Failed to delete view:", err);
        showToast("error", `Failed to delete view: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
    [projects, activeViewId, resetViewEditor, showToast]
  );

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
  const activeView = getViewFrom(projects, openProjectId, activeViewId);
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
            <a href={siteUrl("/docs")} className="text-gray-300 hover:text-white transition-colors">Docs</a>
            <a href={siteUrl("/about")} className="text-gray-300 hover:text-white transition-colors">About</a>
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
          <a href={siteUrl("/docs")} className="text-gray-300 hover:text-white transition-colors">Docs</a>
          <a href={siteUrl("/about")} className="text-gray-300 hover:text-white transition-colors">About</a>
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
      <div ref={bodyRef} className="flex flex-1 min-h-0">
        <Sidebar
          width={sidebarWidth}
          tables={visibleTables}
          filteredFrom={tables.length}
          activeTable={activeTab?.tableName ?? null}
          onSelectTable={openDataTab}
          onSelectStructure={openStructureTab}
          projects={projects}
          projectsMode={projectsMode}
          openProject={projects.find((p) => p.id === openProjectId) ?? null}
          activeViewId={activeViewId}
          onOpenProject={openProjectViews}
          onCloseProject={closeProjectViews}
          onCreateProject={() => setProjectModalOpen(true)}
          onDeleteProject={handleDeleteProject}
          onCreateView={handleStartCreateView}
          onSelectView={handleSelectView}
          onDeleteView={handleDeleteView}
        />
        <SidebarResizer
          containerRef={bodyRef}
          width={sidebarWidth}
          onResize={setSidebarWidth}
        />
        <div className="flex flex-col flex-1 min-w-0 min-h-0">
          <TabBar tabs={tabs} activeTabId={activeTabId} onSelectTab={setActiveTabId} onCloseTab={handleCloseTab} />
          {viewEditorOpen && openProjectId ? (
            <div className="flex flex-col flex-1 min-h-0">
              {/* View editor header: title, dirty badge, row count/error, close × */}
              <div className="px-4 py-2 flex items-center gap-2 border-b border-gray-200 bg-gray-50 shrink-0">
                <span className="text-sm">🔎</span>
                <span className="text-xs font-semibold text-gray-700 truncate">
                  {activeView
                    ? `View: ${activeView.name}`
                    : viewSavedSql
                      ? "View: Untitled"
                      : "New view"}
                </span>
                {viewDirty && (
                  <span className="text-[10px] uppercase font-bold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">
                    Unsaved
                  </span>
                )}
                <div className="ml-auto flex items-center gap-3">
                  {viewResult?.error ? (
                    <span className="text-xs text-red-600 truncate max-w-[280px]" title={viewResult.error}>
                      {viewResult.error}
                    </span>
                  ) : viewResult ? (
                    <span className="text-xs text-gray-400">
                      {viewResult.result.rows.length} row{viewResult.result.rows.length !== 1 ? "s" : ""}
                    </span>
                  ) : null}
                  <button
                    onClick={handleCloseViewEditor}
                    aria-label="Close view editor"
                    title="Close view"
                    className="w-7 h-7 flex items-center justify-center rounded text-gray-400 hover:text-gray-700 hover:bg-gray-200 transition-colors text-lg leading-none shrink-0"
                  >
                    ×
                  </button>
                </div>
              </div>
              <Suspense fallback={<div className="h-[180px] border-b border-gray-200 bg-gray-50 animate-pulse" />}>
                <SqlEditor
                  initialSql={viewSql}
                  isEditable
                  onRun={(sql) => void runViewSql(sql)}
                  onSave={handleSaveViewClicked}
                  onSqlChange={setViewSql}
                  error={null}
                />
              </Suspense>
              <DataGrid columns={viewResult?.result.columns ?? []} rows={viewResult?.result.rows ?? []} />
            </div>
          ) : activeTab ? (
            <div className="flex flex-col flex-1 min-h-0">
              {activeTab.type === "data" && (
                <Suspense fallback={<div className="h-[180px] border-b border-gray-200 bg-gray-50 animate-pulse" />}>
                  <SqlEditor
                    key={activeTab.id}
                    initialSql={activeTab.sql ?? ""}
                    isEditable
                    onRun={(sql) => void handleRunQuery(activeTab.id, sql)}
                    onSave={handleSaveViewClicked}
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
              {viewEditorOpen
                ? "Open a project in the sidebar to manage its views"
                : "Click a table in the sidebar to get started"}
            </div>
          )}
        </div>
      </div>

      <RecordDrawer
        drawer={recordDrawer}
        onClose={() => setRecordDrawer(null)}
      />

      {/* Create-project modal — opens the new project's Views on save. */}
      {projectModalOpen && (
        <NameModal
          title="Create a project"
          description="Projects group your saved SQL views."
          confirmLabel="Create"
          validate={(name) => (projectNameExists(name) ? `A project named “${name}” already exists` : null)}
          onConfirm={handleCreateProject}
          onCancel={() => setProjectModalOpen(false)}
        />
      )}

      {/* Saving with no project open: invite the user to create one. */}
      {noProjectModalOpen && (
        <NoProjectModal
          onCreateProject={() => {
            setNoProjectModalOpen(false);
            setProjectModalOpen(true);
          }}
          onCancel={() => {
            setNoProjectModalOpen(false);
            setSaveEditorSql(null);
          }}
        />
      )}

      {/* Save-existing-view options: rename/update in place or fork as a new view. */}
      {saveModalOpen && activeView && openProjectId && (
        <SaveOptionsModal
          viewName={activeView.name}
          validate={validateViewName}
          onSave={handleSaveExistingView}
          onCreateNew={handleSaveAsNewView}
          onCancel={() => {
            setSaveModalOpen(false);
            setSaveEditorSql(null);
          }}
        />
      )}

      {/* Name-a-view modal: new views and “Create new view” from the save modal. */}
      {viewNameModalOpen && openProjectId && (
        <NameModal
          title="Save view"
          description="Name this SQL query — it will be saved in the current project."
          confirmLabel="Save"
          suggestion={aiSuggestion}
          validate={validateViewName}
          onConfirm={handleSaveNamedView}
          onCancel={() => {
            setViewNameModalOpen(false);
            setSaveEditorSql(null);
          }}
        />
      )}

      <LoadingOverlay visible={busy != null} message={busy?.message ?? ""} detail={busy?.detail ?? fileDetail} indeterminate />
    </div>
  );
}



export default function App({ cliMode = false }: { cliMode?: boolean }) {
  return (
    <ToastProvider>
      <Explorer cliMode={cliMode} />
    </ToastProvider>
  );
}

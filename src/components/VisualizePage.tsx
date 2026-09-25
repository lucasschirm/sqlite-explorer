// /visualize page — ERD view of the open database, rendered by the
// sqlite-erd package (https://github.com/jurerotar/sqlite-erd).
//
// The explorer captures the schema DDL of the open database when a file loads
// (see src/lib/visualizeState.ts) and this page hands it to <SQLiteERD>. The
// package's own left workspace panel is hidden (showSidebar={false}); the app
// renders its usual Sidebar next to this page, so the left navigation stays
// consistent between Data and Diagram.
//
// Clicking a table or view node on the diagram navigates back to the explorer
// (hash route "#/") where that table's Data tab opens. sqlite-erd does not
// expose a table-click callback on its exported <SQLiteERD> component, so the
// click is detected via event delegation on React Flow's node DOM elements
// (which carry the node id — the table name — in their data-id attribute).
import { useEffect, useMemo, useRef } from "react";
import { SQLiteERD } from "sqlite-erd";
import "sqlite-erd/sqlite-erd.css";
import { getVisualizeDb } from "../lib/visualizeState";

interface VisualizePageProps {
  /** Navigate back to the explorer and open a table's Data tab. */
  onOpenTable: (tableName: string) => void;
}

export function VisualizePage({ onOpenTable }: VisualizePageProps) {
  // The state module is written when a database opens and never changes while
  // this page is visible (navigating away unmounts it), so a direct read is
  // stable here.
  const { name, schemaSql, tables } = getVisualizeDb();

  const knownTables = useMemo(
    () => new Set(tables.map((t) => t.name)),
    [tables]
  );

  // Event-delegated table/view click → back to the explorer. React Flow marks
  // every rendered node with data-testid="rf__node-<id>" and data-id="<id>";
  // the ERD's node ids are exactly the table/view names. Delegation on the
  // document keeps working regardless of when the diagram mounts.
  // Keep the latest callback in a ref without re-binding the listener. The
  // ref write lives in an effect (render-phase ref writes are a React
  // Compiler violation).
  const onOpenTableRef = useRef(onOpenTable);
  useEffect(() => {
    onOpenTableRef.current = onOpenTable;
  }, [onOpenTable]);
  useEffect(() => {
    const resolveTableName = (target: EventTarget | null): string | null => {
      let el = target instanceof Element ? target : null;
      while (el) {
        if (el.classList.contains("react-flow__node")) {
          return el.getAttribute("data-id");
        }
        el = el.parentElement;
      }
      return null;
    };
    const handleClick = (e: MouseEvent) => {
      const tableName = resolveTableName(e.target);
      if (!tableName) return;
      // Only react to diagram nodes that correspond to a real table/view of
      // the open database (guards against unrelated React Flow usages).
      if (knownTables.size > 0 && !knownTables.has(tableName)) return;
      onOpenTableRef.current(tableName);
    };
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [knownTables]);

  if (!schemaSql) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="max-w-md text-center px-6">
          <div className="text-4xl mb-3">🧩</div>
          <h2 className="text-lg font-semibold text-gray-800">No database open</h2>
          <p className="mt-2 text-sm text-gray-500 leading-relaxed">
            Load a SQLite file in the explorer first — the diagram is generated
            from the open database's schema and never leaves your machine.
          </p>
          <a
            href="#/"
            className="mt-5 inline-block text-xs bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded transition-colors"
          >
            ← Back to the explorer
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="erd-page flex-1 min-w-0 relative" data-testid="erd-container">
      {name && (
        <div
          data-testid="erd-filename"
          className="absolute top-4 left-4 z-10 text-[11px] px-2.5 py-1 rounded-full bg-white/85 border border-gray-200 shadow-sm text-gray-600 font-mono max-w-[280px] truncate"
        >
          {name}
        </div>
      )}
      {/* Keyed by schema so a newly opened database re-mounts the ERD. */}
      <SQLiteERD key={schemaSql} sqlSchema={schemaSql} showSidebar={false} />
    </div>
  );
}

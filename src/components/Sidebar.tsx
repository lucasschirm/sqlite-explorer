import type { TableInfo } from "../types";

interface SidebarProps {
  tables: TableInfo[];
  /** Total table count before filtering (shown when a filter hides tables). */
  filteredFrom?: number;
  activeTable: string | null;
  /** Which main section is shown: the table explorer or the ERD diagram. */
  section: "data" | "diagram";
  onSelectTable: (tableName: string) => void;
  onSelectStructure: (tableName: string) => void;
  /** Switch between Data and Diagram sections. */
  onSectionChange: (section: "data" | "diagram") => void;
}

export function Sidebar({
  tables,
  filteredFrom,
  activeTable,
  section,
  onSelectTable,
  onSelectStructure,
  onSectionChange,
}: SidebarProps) {
  const isFiltered = filteredFrom != null && filteredFrom > tables.length;
  return (
    <aside className="w-60 shrink-0 bg-gray-900 text-gray-300 flex flex-col border-r border-gray-700 h-full">
      {/* Data | Diagram section switcher */}
      <div
        className="px-3 pt-3 pb-2 border-b border-gray-700"
        data-testid="sidebar-sections"
      >
        <div
          className="grid grid-cols-2 gap-1 p-1 rounded-md bg-gray-800"
          role="tablist"
          aria-label="Sidebar section"
        >
          <button
            role="tab"
            aria-selected={section === "data"}
            data-testid="sidebar-section-data"
            onClick={() => onSectionChange("data")}
            className={`text-xs py-1.5 rounded transition-colors ${
              section === "data"
                ? "bg-gray-700 text-white font-medium"
                : "text-gray-400 hover:text-gray-200"
            }`}
          >
            Data
          </button>
          <button
            role="tab"
            aria-selected={section === "diagram"}
            data-testid="sidebar-section-diagram"
            onClick={() => onSectionChange("diagram")}
            className={`text-xs py-1.5 rounded transition-colors ${
              section === "diagram"
                ? "bg-gray-700 text-white font-medium"
                : "text-gray-400 hover:text-gray-200"
            }`}
          >
            Diagram
          </button>
        </div>
      </div>

      <div className="px-4 py-3 border-b border-gray-700">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
          Tables ({tables.length}
          {isFiltered ? ` of ${filteredFrom}` : ""})
        </h2>
      </div>
      <div className="flex-1 overflow-y-auto min-h-0">
        {tables.map((table) => (
          <div
            key={table.name}
            className={`
              w-full text-left px-3 py-2 text-sm transition-colors
              flex items-center justify-between group
              ${
                section === "data" && activeTable === table.name
                  ? "bg-blue-600/20 text-blue-300"
                  : "hover:bg-gray-800 text-gray-400 hover:text-gray-200"
              }
            `}
          >
            <button
              onClick={() => {
                // Clicking a table in either section opens its Data tab in the
                // explorer; the section switch stays as-is so users can return.
                if (section === "diagram") onSectionChange("data");
                onSelectTable(table.name);
              }}
              className="flex items-center gap-2 min-w-0 flex-1 text-left"
            >
              <span className="text-xs opacity-50">📋</span>
              <span className="truncate font-mono text-xs">{table.name}</span>
            </button>
            <div className="flex items-center gap-1 shrink-0">
              <span className="text-[10px] opacity-40 tabular-nums mr-1">
                {table.rowCount.toLocaleString()}
              </span>
              <button
                onClick={() => {
                  if (section === "diagram") onSectionChange("data");
                  onSelectStructure(table.name);
                }}
                title="Structure"
                className="text-[10px] opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity px-1 py-0.5 rounded hover:bg-gray-700"
              >
                🏗️
              </button>
            </div>
          </div>
        ))}
        {tables.length === 0 && (
          <div className="px-4 py-6 text-center text-sm text-gray-600">
            No tables found
          </div>
        )}
      </div>
      {section === "diagram" && (
        <div className="px-4 py-2.5 border-t border-gray-700 text-[10px] leading-relaxed text-gray-500">
          ERD of the open database. Click a table on the diagram to open it in
          the data explorer.
        </div>
      )}
    </aside>
  );
}

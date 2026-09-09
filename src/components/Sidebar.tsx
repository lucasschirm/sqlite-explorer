import type { TableInfo } from "../types";

interface SidebarProps {
  tables: TableInfo[];
  /** Total table count before filtering (shown when a filter hides tables). */
  filteredFrom?: number;
  activeTable: string | null;
  onSelectTable: (tableName: string) => void;
  onSelectStructure: (tableName: string) => void;
}

export function Sidebar({ tables, filteredFrom, activeTable, onSelectTable, onSelectStructure }: SidebarProps) {
  const isFiltered = filteredFrom != null && filteredFrom > tables.length;
  return (
    <div className="w-60 shrink-0 bg-gray-900 text-gray-300 flex flex-col border-r border-gray-700 h-full">
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
                activeTable === table.name
                  ? "bg-blue-600/20 text-blue-300"
                  : "hover:bg-gray-800 text-gray-400 hover:text-gray-200"
              }
            `}
          >
            <button
              onClick={() => onSelectTable(table.name)}
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
                onClick={() => onSelectStructure(table.name)}
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
    </div>
  );
}

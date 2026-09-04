import type { QueryResult } from "../types";
import { DataGrid } from "./DataGrid";

interface StructureTabProps {
  columnsData: QueryResult;
  indexesData: QueryResult;
}

export function StructureTab({ columnsData, indexesData }: StructureTabProps) {
  return (
    <div className="flex flex-col flex-1 min-h-0 divide-y divide-gray-200">
      {/* Columns section */}
      <div className="flex flex-col flex-1 min-h-0">
        <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 shrink-0">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Columns ({columnsData.rows.length})
          </h3>
        </div>
        <div className="flex-1 min-h-0 flex flex-col">
          <DataGrid
            columns={columnsData.columns}
            rows={columnsData.rows}
          />
        </div>
      </div>

      {/* Indexes section */}
      <div className="flex flex-col flex-1 min-h-0">
        <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 shrink-0">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Indexes ({indexesData.rows.length})
          </h3>
        </div>
        <div className="flex-1 min-h-0 flex flex-col">
          <DataGrid
            columns={indexesData.columns}
            rows={indexesData.rows}
          />
        </div>
      </div>
    </div>
  );
}

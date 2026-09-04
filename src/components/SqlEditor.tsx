import { useState, useCallback, useEffect } from "react";

interface SqlEditorProps {
  initialSql: string;
  isEditable?: boolean;
  onRun: (sql: string) => void;
  error?: string | null;
}

export function SqlEditor({
  initialSql,
  isEditable = true,
  onRun,
  error,
}: SqlEditorProps) {
  const [sql, setSql] = useState(initialSql);

  // Re-sync the editor text when the parent changes the initial SQL
  // (e.g. switching tables or after Run commits the new SQL).
  useEffect(() => {
    setSql(initialSql);
  }, [initialSql]);

  const handleRun = useCallback(() => {
    if (sql.trim()) onRun(sql.trim());
  }, [sql, onRun]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // Ctrl/Cmd + Enter to run
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        handleRun();
      }
    },
    [handleRun]
  );

  return (
    <div className="shrink-0 border-b border-gray-200 bg-white">
      <div className="flex items-stretch">
        <textarea
          value={sql}
          onChange={(e) => setSql(e.target.value)}
          onKeyDown={handleKeyDown}
          readOnly={!isEditable}
          rows={3}
          spellCheck={false}
          data-testid="sql-editor"
          className={`
            flex-1 resize-none px-4 py-2.5 text-sm font-mono
            text-gray-800 bg-transparent outline-none
            placeholder:text-gray-300
            ${!isEditable ? "bg-gray-50 text-gray-400 cursor-not-allowed" : ""}
          `}
          placeholder="Enter SQL query..."
        />
        {isEditable && (
          <button
            onClick={handleRun}
            className="px-5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors shrink-0"
          >
            Run
          </button>
        )}
      </div>
      {error && (
        <div className="px-4 py-2 text-xs text-red-600 bg-red-50 border-t border-red-100 font-mono">
          {error}
        </div>
      )}
    </div>
  );
}

import { useState, useCallback, useEffect, useRef } from "react";
import { monaco } from "../lib/monacoSetup";
import { registerSqlCompletions } from "../lib/sqlCompletions";
import { registerAiInlineCompletions } from "../lib/aiInlineCompletions";
import { format as formatSql } from "sql-formatter";

interface SqlEditorProps {
  initialSql: string;
  isEditable?: boolean;
  onRun: (sql: string) => void;
  error?: string | null;
}

export function SqlEditor({ initialSql, isEditable = true, onRun, error }: SqlEditorProps) {
  const [value, setValue] = useState(initialSql);
  const [formatError, setFormatError] = useState<string | null>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const onRunRef = useRef(onRun);
  onRunRef.current = onRun;

  // Create the editor once on mount.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    registerSqlCompletions(monaco);
    registerAiInlineCompletions(monaco);

    const editor = monaco.editor.create(container, {
      value: initialSql,
      language: "sql",
      theme: "sqlite-viewer",
      readOnly: !isEditable,
      minimap: { enabled: false },
      automaticLayout: true,
      fontSize: 13,
      lineNumbers: "on",
      scrollBeyondLastLine: false,
      wordWrap: "on",
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
      renderLineHighlight: "none",
      overviewRulerLanes: 0,
      padding: { top: 8, bottom: 8 },
      scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8 },
      occurrencesHighlight: "off",
      selectionHighlight: false,
      folding: false,
      contextmenu: false,
    });
    editorRef.current = editor;
    const model = editor.getModel();

    const disposable = model?.onDidChangeContent(() => {
      setValue(model.getValue());
    });

    // Ctrl/Cmd+Enter runs the query; Shift+Alt+F formats.
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
      const sql = editor.getValue();
      if (sql.trim()) onRunRef.current(sql.trim());
    });
    editor.addCommand(
      monaco.KeyMod.Shift | monaco.KeyMod.Alt | monaco.KeyCode.KeyF,
      () => void formatRef.current()
    );

    return () => {
      disposable?.dispose();
      editor.dispose();
      editorRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-sync editor text when the parent changes the initial SQL (tab switch).
  useEffect(() => {
    const editor = editorRef.current;
    if (editor && editor.getValue() !== initialSql) {
      editor.setValue(initialSql);
      setValue(initialSql);
    }
  }, [initialSql]);

  // readOnly follows the isEditable prop.
  useEffect(() => {
    editorRef.current?.updateOptions({ readOnly: !isEditable });
  }, [isEditable]);

  const handleFormat = useCallback(async () => {
    const editor = editorRef.current;
    if (!editor) return;
    try {
      const current = editor.getValue();
      if (!current.trim()) return;
      const formatted = formatSql(current, { language: "sqlite", tabWidth: 2, keywordCase: "upper" });
      const model = editor.getModel();
      if (!model) return;
      editor.executeEdits("sql-formatter", [
        { text: formatted, range: model.getFullModelRange(), forceMoveMarkers: true },
      ]);
      editor.pushUndoStop();
      setFormatError(null);
    } catch (err) {
      // Unparseable SQL: report without breaking the editor.
      console.error("SQL format failed:", err);
      setFormatError(`Format failed: ${err instanceof Error ? err.message : String(err)}`.slice(0, 200));
    }
  }, []);

  const formatRef = useRef(handleFormat);
  formatRef.current = handleFormat;

  const handleRun = useCallback(() => {
    if (value.trim()) onRunRef.current(value.trim());
  }, [value]);

  const message = error ?? formatError;

  return (
    <div className="shrink-0 border-b border-gray-200 bg-white">
      <div className="flex items-stretch">
        <div className="flex-1 min-w-0">
          <div ref={containerRef} data-testid="sql-editor" className="h-[180px] w-full" />
        </div>
        <div className="flex flex-col justify-between shrink-0 border-l border-gray-200">
          <button
            onClick={() => void handleFormat()}
            title="Format SQL (Shift+Alt+F)"
            className="px-4 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors"
          >
            Format
          </button>
          <button
            onClick={handleRun}
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors"
          >
            Run
          </button>
        </div>
      </div>
      {message && (
        <div className="px-4 py-2 text-xs font-mono break-words">
          {error ? (
            <span className="block text-red-600 bg-red-50 border-t border-red-100">{error}</span>
          ) : (
            <span className="text-red-600">{formatError}</span>
          )}
        </div>
      )}
    </div>
  );
}

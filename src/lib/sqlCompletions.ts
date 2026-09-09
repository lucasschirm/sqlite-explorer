// Schema-aware SQL completion for the Monaco SQL editor.
//
// A schema catalog (tables -> columns with types) is captured once per
// database open via PRAGMA table_info, then completion runs fully
// synchronously in memory — no keystroke latency, no worker round-trips.
import type { monaco } from "./monacoSetup";

export interface SchemaCatalog {
  tables: string[];
  // table name (as stored) -> column definitions
  columns: Map<string, { name: string; type: string }[]>;
}

// Best-effort column extraction from a view's CREATE statement.
function parseViewColumns(createSql: string): { name: string; type: string }[] {
  const selectCols = createSql.match(/SELECT\s+([\s\S]*?)\s+FROM\s/is)?.[1];
  if (!selectCols) return [];
  return selectCols
    .split(",")
    .map((part) => {
      // `expr AS alias`, `expr alias`, or a bare column reference.
      const aliased = part.match(/AS\s+"?([A-Za-z_][\w$]*)"?\s*$/i)?.[1];
      const bare = part.trim().replace(/["`[\]]/g, "");
      return { name: aliased ?? bare, type: "view column" };
    })
    .filter((c) => c.name);
}

/** Capture the full schema catalog for the open database. */
export async function buildSchemaCatalog(
  query: (sql: string) => Promise<{ columns: string[]; rows: unknown[][] }>
): Promise<SchemaCatalog> {
  const tables: string[] = [];
  const columns = new Map<string, { name: string; type: string }[]>();

  try {
    const res = await query(
      `SELECT name, sql FROM sqlite_master WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%' ORDER BY name`
    );
    for (const row of res.rows) {
      const name = String(row[0]);
      const createSql = row[1] != null ? String(row[1]) : "";
      tables.push(name);
      try {
        const cols = await query(`PRAGMA table_info("${name.replace(/"/g, '""')}")`);
        let defs = cols.rows.map((r) => ({ name: String(r[1]), type: String(r[2] ?? "") }));
        // Views return no columns from table_info; fall back to their SQL.
        if (defs.length === 0) {
          defs = parseViewColumns(createSql);
        }
        columns.set(name, defs);
      } catch (err) {
        console.error(`sqlCompletions: failed to read columns of "${name}":`, err);
      }
    }
  } catch (err) {
    console.error("sqlCompletions: failed to build schema catalog:", err);
  }

  return { tables, columns };
}

const SQL_KEYWORDS = [
  "SELECT", "FROM", "WHERE", "GROUP BY", "ORDER BY", "HAVING", "LIMIT", "OFFSET",
  "JOIN", "LEFT JOIN", "INNER JOIN", "OUTER JOIN", "CROSS JOIN", "ON", "AS",
  "INSERT", "INTO", "VALUES", "UPDATE", "SET", "DELETE",
  "AND", "OR", "NOT", "NULL", "IS", "IN", "BETWEEN", "LIKE", "GLOB", "EXISTS",
  "CASE", "WHEN", "THEN", "ELSE", "END", "DISTINCT", "UNION", "UNION ALL",
  "WITH", "RECURSIVE", "PRAGMA", "EXPLAIN", "CREATE", "TABLE", "VIEW", "INDEX",
  "DROP", "ALTER", "ADD", "COLUMN", "PRIMARY KEY", "FOREIGN KEY", "REFERENCES",
  "COUNT", "SUM", "AVG", "MIN", "MAX", "CAST", "COLLATE", "ESCAPE",
  "ASC", "DESC", "ROUND", "LENGTH", "SUBSTR", "TRIM", "UPPER", "LOWER",
  "COALESCE", "IFNULL", "NULLIF", "ABS", "RANDOM", "DATE", "TIME", "DATETIME", "STRFTIME",
];

// Module-level catalog; swapped when a database opens.
let catalog: SchemaCatalog | null = null;

/** Point the provider at a freshly built catalog (null clears suggestions). */
export function setSchemaCatalog(c: SchemaCatalog | null): void {
  catalog = c;
}

/** Current catalog for other consumers (e.g. AI prompt building). */
export function getSchemaCatalog(): SchemaCatalog | null {
  return catalog;
}

let registered = false;

/** Register the completion provider (idempotent; safe to call once per page load). */
export function registerSqlCompletions(monacoInstance: typeof monaco): void {
  if (registered) return;
  registered = true;

  monacoInstance.languages.registerCompletionItemProvider("sql", {
    // Re-offer suggestions right after a dot (table alias / schema dot).
    triggerCharacters: ["."],
    provideCompletionItems(model, position) {
      try {
        if (!catalog) return { suggestions: [] };

        const word = model.getWordUntilPosition(position);
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn,
        };

        const textUntilPosition = model.getValueInRange({
          startLineNumber: 1,
          startColumn: 1,
          endLineNumber: position.lineNumber,
          endColumn: position.column,
        });

        // `table.` or `"table".` — suggest that table's columns.
        const dotMatch = textUntilPosition.match(/(?:"([^"]+)"|([A-Za-z_][\w$]*))\s*\.\s*$/);
        if (dotMatch) {
          const tableName = dotMatch[1] ?? dotMatch[2];
          const cols = catalog.columns.get(tableName) ?? [];
          return {
            suggestions: cols.map((c) => ({
              label: c.name,
              kind: monacoInstance.languages.CompletionItemKind.Field,
              detail: c.type || "column",
              insertText: c.name,
              sortText: `0${c.name}`,
              range,
            })),
          };
        }

        // Otherwise: tables (ranked first) + keywords.
        const tableSuggestions = catalog.tables.map((t) => ({
          label: t,
          kind: monacoInstance.languages.CompletionItemKind.Class,
          detail: "table",
          insertText: t,
          sortText: `0${t}`,
          range,
        }));
        const keywordSuggestions = SQL_KEYWORDS.map((k) => ({
          label: k,
          kind: monacoInstance.languages.CompletionItemKind.Keyword,
          detail: "keyword",
          insertText: k,
          sortText: `1${k}`,
          range,
        }));
        return { suggestions: [...tableSuggestions, ...keywordSuggestions] };
      } catch (err) {
        console.error("sqlCompletions: completion failed:", err);
        return { suggestions: [] };
      }
    },
  });
}

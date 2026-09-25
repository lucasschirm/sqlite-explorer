// Schema-aware SQL completion for the Monaco SQL editor.
//
// A schema catalog (tables -> columns with types) is captured once per
// database open via PRAGMA table_info, then completion runs fully
// synchronously in memory — no keystroke latency, no worker round-trips.
//
// Dot-completion resolves the identifier before the cursor in every shape:
//
//   "session".     quoted table (stored case)   → columns
//   session.       bare table — matched case-insensitively against the
//                  catalog, so SESSION. works too
//   s.             alias declared via FROM/JOIN <table> [AS] <alias>
//   session.na     partial column after the dot → columns filtered by "na"
//
// Suggestions are inserted unquoted for plain identifier names, and
// double-quoted only when the column name needs it (spaces, reserved
// characters) or when the user already started a quoted partial.
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

const KEYWORD_SET = new Set(SQL_KEYWORDS.flatMap((k) => k.split(" ")));

/**
 * Identifier before the cursor: "name", [name], `name` (all three are valid
 * SQLite quoting) or a bare `name`. Group 4 is set only for the bare form,
 * which lets the provider resolve it case-insensitively instead of
 * requiring an exact catalog match.
 */
const IDENT_BEFORE_DOT =
  /(?:"([^"]*)"|\[([^\]]*)\]|`([^`]*)`|([A-Za-z_][\w$]*))[ \t]*\.[ \t]*(?:([A-Za-z_][\w$]*)|"([^"]*)"|"([^"]*))?$/;

/**
 * FROM/JOIN table declarations, optionally aliased:
 *   FROM session s   FROM "session" AS s   JOIN orders o ON ...
 * The alias clause is optional so `FROM session, orders o` still matches the
 * first table; keyword-shaped "aliases" (WHERE, SET, …) are filtered later.
 */
const TABLE_DECLARATION =
  /\b(?:from|join)\s+(?:"([^"]*)"|\[([^\]]*)\]|`([^`]*)`|([A-Za-z_][\w$]*))(?:[ \t]+(?:as[ \t]+)?([A-Za-z_][\w$]*))?/gi;

/** Escape a string for literal use inside a RegExp. */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Resolve the canonical catalog table for an identifier written before a dot.
 * Tries the table name itself (case-insensitive), then aliases declared in
 * the query prefix (`FROM orders o` → `o` → `orders`).
 */
function resolveTable(
  identifier: string,
  textBefore: string,
  catalog: SchemaCatalog
): string | null {
  const lowered = new Map<string, string>();
  for (const t of catalog.tables) lowered.set(t.toLowerCase(), t);

  const direct = lowered.get(identifier.toLowerCase());
  if (direct) return direct;

  const aliases = new Map<string, string>();

  // FROM/JOIN declarations (covers quoted table names, including ones with
  // spaces that the per-table scan below cannot express).
  TABLE_DECLARATION.lastIndex = 0; // global regex reused across keystrokes
  let m: RegExpExecArray | null;
  while ((m = TABLE_DECLARATION.exec(textBefore)) !== null) {
    const tableName = m[1] ?? m[2] ?? m[3] ?? m[4];
    const alias = m[5];
    if (!tableName) continue;
    const canonical = lowered.get(tableName.toLowerCase());
    if (canonical && alias && !KEYWORD_SET.has(alias.toUpperCase())) {
      aliases.set(alias.toLowerCase(), canonical);
    }
  }

  // Comma-separated FROM lists and other unadorned declarations:
  // for each known table, find `<table> <alias>` anywhere in the prefix.
  for (const t of catalog.tables) {
    if (aliases.size > 0 && [...aliases.values()].includes(t)) continue;
    const re = new RegExp(
      `(?:^|[^\\w$.])${escapeRegExp(t)}[ \\t]+(?:as[ \\t]+)?([A-Za-z_][\\w$]*)`,
      "i"
    );
    const am = re.exec(textBefore);
    const alias = am?.[1];
    if (alias && !KEYWORD_SET.has(alias.toUpperCase())) {
      aliases.set(alias.toLowerCase(), t);
    }
  }

  return aliases.get(identifier.toLowerCase()) ?? null;
}

/** Insert text for a column: bare when it is a plain identifier, else quoted. */
function columnInsertText(name: string, forceQuote: boolean): string {
  if (!forceQuote && /^[\w$]+$/.test(name)) return name;
  return `"${name.replace(/"/g, '""')}"`;
}

let registered = false;

/** Register the completion provider (idempotent; safe to call once per page load). */
export function registerSqlCompletions(monacoInstance: typeof monaco): void {
  if (registered) return;
  registered = true;

  monacoInstance.languages.registerCompletionItemProvider("sql", {
    // Re-offer suggestions right after a dot (table / alias dot completion).
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

        // `table.`, `"table".`, `[table].`, `` `table`. `` or `alias.` —
        // suggest that table's columns. Bare names resolve case-insensitively;
        // a partial column after the dot ("session.na") filters the list.
        const dotMatch = textUntilPosition.match(IDENT_BEFORE_DOT);
        if (dotMatch) {
          const identifier = dotMatch[1] ?? dotMatch[2] ?? dotMatch[3] ?? dotMatch[4];
          const tableName = resolveTable(identifier, textUntilPosition, catalog);
          if (tableName == null) return { suggestions: [] };

          // Partial column after the dot: bare ("na"), closed-quote ("na")
          // or open-quote ("na while typing). Quote forms keep the user's
          // opening quote, so the replacement inserts a bare name.
          const partial = dotMatch[5] ?? dotMatch[6] ?? dotMatch[7] ?? "";
          const partialQuoted = dotMatch[6] != null || dotMatch[7] != null;
          const lowerPartial = partial.toLowerCase();

          const cols = (catalog.columns.get(tableName) ?? []).filter(
            (c) => !lowerPartial || c.name.toLowerCase().startsWith(lowerPartial)
          );
          return {
            suggestions: cols.map((c) => ({
              label: c.name,
              kind: monacoInstance.languages.CompletionItemKind.Field,
              detail: `${tableName}.${c.name} — ${c.type || "column"}`,
              insertText: columnInsertText(c.name, partialQuoted),
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

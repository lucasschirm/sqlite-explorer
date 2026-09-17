// Docs content registry — the single source of truth for the multi-page
// documentation, consumed by three renderers:
//
//   1. src/prerender.tsx           — SSG: writes one static HTML file per page
//   2. src/components/DocsPage.tsx — the client docs app (sidebar + content)
//   3. src/main.tsx                — route resolution when hydrating
//
// URL structure:
//   /docs                            → overview page
//   /docs/:documentation-slug        → top-level page (single-level)
//   /docs/:parent-slug/:child-slug   → sub-page of a parent section
//
// A parent with children renders as an expandable sidebar section (chevron ❯
// rotating 90° when open) with its own content page; every child is a real
// page under /docs/<parent>/<child>.
import type { ReactNode } from "react";
import { Code, Kbd, Section, Shot, SubPages, Table } from "./ui";
import { siteUrl } from "../lib/siteUrl";

export interface DocPage {
  /** URL slug — the last path segment of /docs/<parent>/<child>. */
  slug: string;
  /** Sidebar + heading title. */
  title: string;
  /** Short summary used under the heading and in the overview cards. */
  description: string;
  /** Page content. Only rendered when the page is visited. */
  render: () => ReactNode;
}

export interface DocSection {
  slug: string;
  title: string;
  description: string;
  /** The parent page's own content. */
  render: () => ReactNode;
  /** Optional sub-pages — real pages under /docs/<parent>/<child>. */
  children?: DocPage[];
}

const OVERVIEW_LINKS: { href: string; title: string; description: string }[] = [
  {
    href: "/docs/getting-started",
    title: "Getting started",
    description: "Open your first database — drop a file or load the bundled demo.",
  },
  {
    href: "/docs/explorer",
    title: "The explorer",
    description: "Tables sidebar, Structure tab, record drawer and saved views.",
  },
  {
    href: "/docs/sql-editor",
    title: "SQL editor",
    description: "Run, format and autocomplete queries with schema-aware suggestions.",
  },
  {
    href: "/docs/cli",
    title: "CLI (sqlitexp)",
    description: "Open local databases from your terminal with the sqlitexp command.",
  },
  {
    href: "/docs/performance",
    title: "Large files & performance",
    description: "Why multi-gigabyte databases open instantly and stay read-only.",
  },
  {
    href: "/docs/agent-tools",
    title: "Agent tools (WebMCP)",
    description: "Let AI agents browse the database alongside you.",
  },
  {
    href: "/docs/keyboard",
    title: "Keyboard shortcuts",
    description: "Every shortcut the editor and app respond to.",
  },
];

// Hoisted so the explorer section's render() can link its own children while
// DOC_SECTIONS is still being initialized.
const explorerChildren: DocPage[] = [
  {
    slug: "structure-tab",
    title: "Structure tab",
    description: "Columns and indexes for any table.",
    render: () => (
      <Section title="Columns & indexes">
        <p>Open a table's structure from the sidebar's hover icon (🏗️) to see two grids:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            <strong>Columns</strong> — name, declared type, <Code>NOT NULL</Code> flag, default
            value and primary-key flag (straight from <Code>PRAGMA table_info</Code>).
          </li>
          <li>
            <strong>Indexes</strong> — index name, uniqueness, origin (auto-created for PK/UNIQUE
            vs. explicit) and the indexed columns (from <Code>PRAGMA index_list</Code> +{" "}
            <Code>PRAGMA index_info</Code>).
          </li>
        </ul>
        <Shot name="06-structure" alt="Structure tab — columns grid and indexes grid" />
      </Section>
    ),
  },
  {
    slug: "record-drawer",
    title: "Record drawer",
    description: "One record as a typed, read-only form.",
    render: () => (
      <Section title="Record drawer">
        <p>
          <strong>Double-click any row</strong> in a data grid to open that record in a right-side
          drawer as a form: each column gets a read-only field matching its type — number inputs
          for numeric columns, date/datetime inputs for date columns, a textarea for long text.
          The primary key is badged <Code>PK</Code>. Close it with the × button, clicking the
          backdrop, or <Kbd>Esc</Kbd>.
        </p>
        <p>
          Rows are matched by their actual <Code>rowid</Code> — this works correctly even for
          tables with TEXT primary keys or <Code>WITHOUT ROWID</Code> tables, where the first
          visible column is not the rowid.
        </p>
        <Shot name="07-record-drawer" alt="Record drawer — one record shown as a typed, read-only form" />
      </Section>
    ),
  },
];

export const DOC_SECTIONS: DocSection[] = [
  // ------------------------------------------------------------------ intro
  {
    slug: "getting-started",
    title: "Getting started",
    description: "Open a database — drop a file or load the demo.",
    render: () => (
      <>
        <Section title="Open a database">
          <p>
            Open the app and either <strong>drag a SQLite file anywhere onto the window</strong> or
            click the drop zone to browse for one (<Code>.sqlite</Code>, <Code>.db</Code>,{" "}
            <Code>.sqlite3</Code>, <Code>.db3</Code>). The file is validated by reading its
            16-byte header before anything else happens — non-SQLite files are rejected
            immediately with a clear message.
          </p>
          <p>
            No file handy? The <strong>Load demo database</strong> button opens a bundled sample
            database with <Code>customers</Code>, <Code>orders</Code> and <Code>products</Code>{" "}
            tables.
          </p>
          <p>
            To start over with a different file, click <strong>Load another file</strong> in the
            header.
          </p>
          <Shot name="01-landing" alt="Landing page — drop a file anywhere or load the demo database" />
          <Shot
            name="02-database-open"
            alt="Database opened — tables listed in the left sidebar with row counts"
          />
        </Section>
        <Section title="From the terminal">
          <p>
            The same viewer is available as a CLI: <Code>sqlitexp mydata.db</Code> starts a local
            server and opens the database in your browser. See the{" "}
            <a href={siteUrl("/docs/cli")} className="text-blue-600 hover:underline">
              CLI (sqlitexp)
            </a>{" "}
            section for flags and internals.
          </p>
        </Section>
      </>
    ),
  },

  // -------------------------------------------------------------- explorer
  {
    slug: "explorer",
    title: "The explorer",
    description: "Browsing tables, structure and records.",
    render: () => (
      <>
        <Section title="Tables sidebar">
          <p>
            The left sidebar lists every table in the database with its row count. Clicking a
            table opens a <strong>Data tab</strong> that runs{" "}
            <Code>SELECT * FROM "table" LIMIT 100</Code> by default.
          </p>
          <p>
            Each table row also has a hover shortcut (the 🏗️ icon) that opens the table's
            Structure tab directly.
          </p>
          <Shot name="03-data-tab" alt="Data tab — Monaco editor on top, virtualized data grid below" />
        </Section>
        <Section title="Projects & saved views">
          <p>
            Projects group saved SQL views in the sidebar. Save the query from any SQL editor with{" "}
            <Kbd>Ctrl</Kbd>/<Kbd>⌘</Kbd>+<Kbd>S</Kbd> (or the Save button), name it, and reopen it
            later from the same project — the view runs again exactly as saved.
          </p>
        </Section>
        <SubPages pages={explorerChildren} parentSlug="explorer" />
      </>
    ),
    children: explorerChildren,
  },

  // ------------------------------------------------------------ sql editor
  {
    slug: "sql-editor",
    title: "SQL editor",
    description: "Run, format and autocomplete SQL.",
    render: () => (
      <>
        <Section title="Run & format">
          <p>
            Every Data tab has a full SQL editor at the top. It starts pre-filled with the default
            table query; edit it freely and press <strong>Run</strong> (or{" "}
            <Kbd>Ctrl</Kbd>+<Kbd>Enter</Kbd>) to execute against the open database. The grid below
            shows the result.
          </p>
          <Shot name="04-custom-query" alt="Custom SQL — an aggregated GROUP BY query and its result grid" />
          <p>
            <strong>Formatting.</strong> The <strong>Format</strong> button (or{" "}
            <Kbd>Shift</Kbd>+<Kbd>Alt</Kbd>+<Kbd>F</Kbd>) rewrites your SQL with consistent
            uppercase keywords and indentation via sql-formatter's SQLite dialect. Formatting runs
            through the editor's normal edit stack, so <Kbd>Ctrl</Kbd>+<Kbd>Z</Kbd> undoes it. SQL
            that cannot be parsed shows a format error instead of touching the editor.
          </p>
        </Section>
        <Section title="Schema-aware autocomplete">
          <p>
            While typing, the editor suggests table names from the open database (ranked above
            generic SQL keywords); after a <Code>table.</Code> — quoted or unquoted — it suggests
            that table's columns with their types. The schema catalog is built in the background
            when a database opens — one <Code>PRAGMA table_info</Code> per table.
          </p>
          <Shot name="05-autocomplete" alt="Autocomplete — table suggestions while typing, columns after a dot" />
        </Section>
        <Section title="AI ghost text (local, optional)">
          <p>
            The editor also offers Copilot-style <strong>ghost-text completions</strong> powered
            by Qwen2.5-Coder-1.5B running entirely in your browser via WebLLM — no server, no API
            key, and the model weights are downloaded from a dedicated CDN, not Hugging Face.
          </p>
          <p>
            The AI preloads in the background as soon as the app opens; a small status pill in the
            header shows progress (<Code>loading …%</Code>) until the model is ready. Suggestions
            appear as gray ghost text and are accepted with <Kbd>Tab</Kbd>. The prompt includes
            your database's schema, so completions reference real tables and columns.
          </p>
          <p>
            <strong>Nothing depends on it.</strong> If your browser has no WebGPU, the model fails
            to load, or you close the tab mid-download, the app behaves exactly the same — the
            pill simply disappears and autocomplete falls back to the schema-aware suggestions
            above. The model (~845 MB) is fetched once and cached by the browser; the fetch script
            is <Code>bun run model:fetch</Code>.
          </p>
        </Section>
      </>
    ),
  },

  // --------------------------------------------------------------- cli page
  {
    slug: "cli",
    title: "CLI (sqlitexp)",
    description: "Open local databases from the terminal with sqlitexp.",
    render: () => (
      <>
        <Section title="sqlitexp — SQLite explorer from the terminal">
          <p>
            <Code>sqlitexp</Code> opens any local SQLite database in the browser-based viewer
            straight from your terminal — no drop zone required. It starts a small local server
            (bound to <Code>127.0.0.1</Code>), launches your browser, and serves the prebuilt
            viewer with the database already open.
          </p>
          <div className="my-4 rounded-lg bg-gray-900 text-gray-100 p-4 font-mono text-[13px] leading-relaxed overflow-x-auto">
            <div className="text-gray-400"># install once</div>
            <div>npm install @lucasschirm/sqlite-explorer -g</div>
            <div className="text-gray-400 mt-3"># open a database</div>
            <div>sqlitexp mydata.db</div>
            <div className="text-gray-400 mt-3"># custom port, no browser</div>
            <div>sqlitexp mydata.db --port 8080 --no-open</div>
          </div>
        </Section>
        <Section title="Flags">
          <Table
            head={["Flag", "Default", "What it does"]}
            rows={[
              [<Code key="f1">{"-p, --port <n>"}</Code>, "3000", "Port the local viewer server listens on."],
              [
                <Code key="f2">{"--[no-]open"}</Code>,
                "open",
                "Launch the browser automatically (or suppress it with --no-open).",
              ],
              [<Code key="f3">-h, --help</Code>, "—", "Show the command help."],
              [<Code key="f4">-v, --version</Code>, "—", "Print the installed version."],
            ]}
          />
        </Section>
        <Section title="How it works">
          <p>
            The command serves the prebuilt viewer (<Code>local.html</Code>) with{" "}
            <strong>Fastify</strong> bound to <Code>127.0.0.1</Code> and streams the database file
            over HTTP Range requests. The UI's SQLite worker fetches only the 4 KiB pages a query
            touches — exactly like the drop-zone path, multi-gigabyte files open instantly and are
            never loaded into memory.
          </p>
          <p>
            Nothing leaves your machine: the server never listens on a public interface and stops
            when you press <Kbd>Ctrl</Kbd>+<Kbd>C</Kbd>. If the port is taken, the command exits
            with a hint to pass <Code>--port</Code>.
          </p>
          <p>
            Non-SQLite files fail fast: the CLI validates the 16-byte SQLite magic header before
            starting the server, so a 400 MB video file never wastes a server start.
          </p>
        </Section>
        <Section title="Local development">
          <div className="my-4 rounded-lg bg-gray-900 text-gray-100 p-4 font-mono text-[13px] leading-relaxed overflow-x-auto">
            <div className="text-gray-400"># builds the UI (dist/) and compiles the CLI (cli/)</div>
            <div>bun run build</div>
            <div className="text-gray-400 mt-3"># run your local build</div>
            <div>bun run cli -- public/demo.db --port 4545</div>
          </div>
        </Section>
      </>
    ),
  },

  // ----------------------------------------------------------- performance
  {
    slug: "performance",
    title: "Large files & performance",
    description: "Multi-gigabyte databases, WAL snapshots and read-only guarantees.",
    render: () => (
      <Section title="Built for big files">
        <ul className="list-disc pl-5 space-y-1">
          <li>
            <strong>Multi-gigabyte databases</strong> open instantly: the file is handed to the
            SQLite worker as a blob reference and pages are read from disk on demand — the whole
            file is never loaded into memory.
          </li>
          <li>
            <strong>Virtualized grid</strong> — only visible rows are rendered; scrolling renders
            more on the fly. The page layout stays fixed: only the data grid and the sidebar
            scroll.
          </li>
          <li>
            <strong>WAL-mode databases</strong> open like any other file: the explorer presents
            them as read-only snapshots of the last checkpointed state (a single dropped file
            cannot provide the <Code>-wal</Code>/<Code>-shm</Code> side files).
          </li>
          <li>
            <strong>Read-only everywhere</strong> — the database opens in immutable mode; queries
            cannot modify your file.
          </li>
        </ul>
      </Section>
    ),
  },

  // ----------------------------------------------------------- agent tools
  {
    slug: "agent-tools",
    title: "Agent tools (WebMCP)",
    description: "AI agents explore the database through three read-only tools.",
    render: () => (
      <Section title="WebMCP tools">
        <p>
          The app registers three read-only tools on <Code>document.modelContext</Code> (via the
          WebMCP polyfill), so AI agents with the MCP-B extension (or Chrome's native support, as
          it lands) can explore the database alongside you. Every tool also{" "}
          <strong>reflects its action in the UI</strong>, and SQL errors are returned verbatim
          from SQLite.
        </p>
        <Table
          head={["Tool", "Input", "Behavior"]}
          rows={[
            [
              <Code key="t1">list_tables</Code>,
              "search?",
              "Markdown table of tables + row counts; the sidebar list filters to match.",
            ],
            [
              <Code key="t2">view_table</Code>,
              "table",
              "Columns, indexes and related tables (foreign keys in both directions); opens the table's Structure tab.",
            ],
            [
              <Code key="t3">select_table</Code>,
              "sql, page?",
              "Runs SQL with a hard limit of 1000 records per page; returns a markdown table plus total records, total pages and current page; opens the result as a tab.",
            ],
          ]}
        />
      </Section>
    ),
  },

  // ------------------------------------------------------------- keyboard
  {
    slug: "keyboard",
    title: "Keyboard shortcuts",
    description: "Every shortcut the editor and app respond to.",
    render: () => (
      <Section title="Shortcuts">
        <Table
          head={["Keys", "Action"]}
          rows={[
            [
              <>
                <Kbd>Ctrl</Kbd>+<Kbd>Enter</Kbd> / <Kbd>⌘</Kbd>+<Kbd>Enter</Kbd>
              </>,
              "Run the query in the editor",
            ],
            [
              <>
                <Kbd>Shift</Kbd>+<Kbd>Alt</Kbd>+<Kbd>F</Kbd>
              </>,
              "Format SQL",
            ],
            [
              <>
                <Kbd>Ctrl</Kbd>+<Kbd>S</Kbd> / <Kbd>⌘</Kbd>+<Kbd>S</Kbd>
              </>,
              "Save the query as a view",
            ],
            [
              <>
                <Kbd>Ctrl</Kbd>+<Kbd>Space</Kbd> / <Kbd>⌃</Kbd>+<Kbd>Space</Kbd>
              </>,
              "Trigger autocomplete",
            ],
            [<Kbd key="esc">Esc</Kbd>, "Close the record drawer or dismiss autocomplete"],
          ]}
        />
      </Section>
    ),
  },
];

/** The /docs overview page. */
export function OverviewPage(): ReactNode {
  return (
    <Section title="Where to start">
      <p>
        Everything this app can do today — no aspirational features. Every screenshot is captured
        from the real app with the bundled demo database.
      </p>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {OVERVIEW_LINKS.map((link) => (
          <a
            key={link.href}
            href={siteUrl(link.href)}
            className="group block rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md"
          >
            <p className="font-semibold text-gray-900 group-hover:text-blue-700 transition-colors">
              {link.title}
            </p>
            <p className="mt-1 text-sm text-gray-600">{link.description}</p>
          </a>
        ))}
      </div>
    </Section>
  );
}

/** Find a docs page by its URL path segments (after /docs). */
export function resolveDocPath(
  segments: string[]
): { section: DocSection; page: DocPage | null } | null {
  const [sectionSlug, childSlug] = segments;
  const section = DOC_SECTIONS.find((s) => s.slug === sectionSlug);
  if (!section) return null;
  if (!childSlug) return { section, page: null };
  const page = section.children?.find((c) => c.slug === childSlug) ?? null;
  return page ? { section, page } : null;
}

/** Flat list of every docs route — used by the SSG renderer. */
export function allDocRoutes(): {
  segments: string[];
  page: DocPage | null;
  section: DocSection;
}[] {
  const routes: { segments: string[]; page: DocPage | null; section: DocSection }[] = [];
  for (const section of DOC_SECTIONS) {
    routes.push({ segments: [section.slug], page: null, section });
    for (const child of section.children ?? []) {
      routes.push({ segments: [section.slug, child.slug], page: child, section });
    }
  }
  return routes;
}

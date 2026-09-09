# SQLite Explorer

A fully offline, browser-based SQLite database explorer. Drop a `.sqlite`/`.db` file and browse tables, run custom SQL, inspect schema, and view individual records — nothing is uploaded.

Built with React + Vite + Tailwind CSS + wa-sqlite (WebAssembly SQLite) + @tanstack/react-virtual.

## Features

- **Drop anywhere** — drag a SQLite file onto the window, or click to browse
- **Multi-gigabyte files** — databases of any size open instantly; pages stream from disk on demand and the whole file is never loaded into memory
- **Demo database** — "Load demo database" button loads a bundled sample DB (3 tables with customers, products, orders)
- **Tables sidebar** — row counts per table, click to open a Data tab, hover for the Structure shortcut
- **Data tab** — Monaco SQL editor (defaults to `SELECT * FROM <table> LIMIT 100`) with schema-aware autocomplete (tables, `table.` → columns), SQL formatting (button or Shift+Alt+F), Run button or Ctrl/Cmd+Enter, virtualized read-only grid
- **Structure tab** — columns grid (name, type, notnull, default, pk) and indexes grid (name, unique, origin, columns)
- **Record tab** — double-click any row to open a form view with type-aware read-only fields
- **Feedback everywhere** — busy overlays for actions, toast notifications, `console.error` for failures
- **WebMCP agent tools** — `list_tables`, `view_table` and `select_table` are exposed via `document.modelContext` (WebMCP polyfill), so AI agents can browse the database and drive the UI
- **Docs & About pages** — in-app documentation (`#/docs`) with real screenshots of every feature, and an About page (`#/about`) covering privacy and architecture; both linked from the app header

## Development

```sh
bun install
bun run demo:db     # generate public/demo.db (optional — used by the demo button)
bun run dev         # start dev server
```

## Docs page screenshots

The `#/docs` page embeds real screenshots under `public/screenshots/`, captured from the running app with Playwright. To regenerate them after a UI change:

```sh
bun run build && (bun run preview &) && node scripts/capture-screenshots.mjs
```

A sanity check for the docs/about pages (sections render, images load, TOC anchors scroll) lives in `scripts/verify-docs-pages.mjs`.

## Testing

End-to-end tests use Playwright against the production build (`vite preview`):

```sh
bun run build
bun run test:e2e        # headless
bun run test:e2e:ui     # interactive UI mode
```

The e2e suite loads the demo database and verifies: table listing, custom SQL queries, Structure tab grids, and the Record form view.

## CI / CD

Two GitHub Actions workflows are included:

- **`.github/workflows/ci.yml`** — on push/PR to `main`: typecheck, build, then Playwright e2e tests with browser installation.
- **`.github/workflows/deploy-pages.yml`** — on push to `main` (or manual dispatch): builds with `VITE_BASE=/<repo-name>/` and deploys to GitHub Pages.

### Enabling GitHub Pages

1. Push the repository to GitHub.
2. In the repo settings, go to **Pages** and set **Source** to **GitHub Actions**.
3. The deploy workflow will publish on the next push to `main` (or run it manually from the Actions tab).

## Building for a subpath

GitHub Pages serves projects under `/<repo-name>/`. The deploy workflow handles this via the `VITE_BASE` environment variable, which configures Vite's `base`. For other subpath deployments, set `VITE_BASE` before running `bun run build`.

## WebMCP tools

The app registers three tools on `document.modelContext` (via `@mcp-b/webmcp-polyfill`) when it loads:

| Tool | Input | Behavior |
|---|---|---|
| `list_tables` | `search?` | Markdown table of tables + row counts; the sidebar list is filtered to match. |
| `view_table` | `table` | Columns, indexes and related tables (foreign keys, both directions); opens the table's Structure tab. Fails with the raw SQLite error for unknown tables. |
| `select_table` | `sql`, `page?` | Runs SQL with a hard limit of 1000 records per page. Returns a markdown table plus total records, total pages and current page; the result opens as a tab in the UI. |

All tools are read-only. Errors are returned as the raw SQLite error text (e.g. `no such table: foo`). For testing, the polyfill is initialized with `installTestingShim: true`, exposing `navigator.modelContextTesting` (`listTools()`, `executeTool(name, inputJson)`).

## Local AI (ghost-text completions)

The Monaco editor offers Copilot-style ghost-text SQL completions powered by **Qwen2.5-Coder-1.5B** running fully in-browser via [WebLLM](https://github.com/mlc-ai/web-llm) — no server, no Hugging Face calls at runtime.

- **Model hosting**: weights are fetched with `bun run model:fetch` into `public/models/qwen25-coder-1.5b/` (gitignored, ~845 MB) and served from the app's own origin. WebLLM's `cleanModelUrl()` appends `resolve/main/` unless the URL already has it, so the directory **must** mirror the HuggingFace layout: `public/models/qwen25-coder-1.5b/resolve/main/`.
- **Inference worker**: `src/worker/aiWorker.ts` hosts the MLCEngine so downloads, GPU init and generation never touch the UI thread. The model is preloaded at app boot (fire-and-forget, browser-cached across visits).
- **Graceful degradation**: the status pill in the header shows loading progress; on machines without WebGPU (or any init failure) AI silently stays dormant — the app never blocks or breaks. Verify the pipeline with `node scripts/check-ai-pipeline.mjs` against a running preview (on a WebGPU machine it confirms the model reaches `ready`).

## Notes

- **Architecture**: the SQLite engine (wa-sqlite) runs in a Web Worker. The dropped/picked `File` is handed to the worker as a `Blob` reference (structured clone, zero copy), and a custom VFS (`src/lib/blobVfs.ts`) serves SQLite's page reads straight from that blob using synchronous `FileReaderSync` reads. Queries therefore touch only the 4 KiB pages they need — a 2.5 GB database opens in well under a second and uses a few MB of memory. The UI thread never blocks, since all SQLite work happens in the worker.
- **WAL-mode databases**: databases in WAL journal mode normally require `-wal` and `-shm` side files, which a single dropped/picked file cannot provide. The VFS transparently presents them as legacy-mode read-only snapshots (showing the last checkpointed state), so they open like any other file. Generate a WAL test file with `bun run wal:db`.
- **No uploads**: the file never leaves your machine; all parsing happens in the browser via WebAssembly.
- **Monaco editor**: loaded lazily in its own chunk only after a database is open, with a minimal import set (editor core + SQL grammar — measured 695 KB vs 1.17 MB gzipped for the full `editor.main`) and a locally bundled web worker, keeping the app fully offline.

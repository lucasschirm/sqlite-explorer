# SQLite Viewer

A fully offline, browser-based SQLite database viewer. Drop a `.sqlite`/`.db` file and browse tables, run custom SQL, inspect schema, and view individual records — everything runs in-memory, nothing is uploaded.

Built with React + Vite + Tailwind CSS + sql.js (WebAssembly SQLite) + @tanstack/react-virtual.

## Features

- **Drop anywhere** — drag a SQLite file onto the window, or click to browse
- **Demo database** — "Load demo database" button loads a bundled sample DB (3 tables with customers, products, orders)
- **Tables sidebar** — row counts per table, click to open a Data tab, hover for the Structure shortcut
- **Data tab** — editable SQL editor (defaults to `SELECT * FROM <table> LIMIT 100`), Run button or Ctrl/Cmd+Enter, virtualized read-only grid
- **Structure tab** — columns grid (name, type, notnull, default, pk) and indexes grid (name, unique, origin, columns)
- **Record tab** — double-click any row to open a form view with type-aware read-only fields
- **Feedback everywhere** — progress bar for large file reads, busy overlays for actions, toast notifications, `console.error` for failures

## Development

```sh
bun install
bun run demo:db     # generate public/demo.db (optional — used by the demo button)
bun run dev         # start dev server
```

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

## Notes

- **Large files**: sql.js parses the whole database into browser memory. Files around 1–2 GB may exceed browser memory limits — the app validates the SQLite header up front and surfaces a clear error if parsing fails, but the practical limit depends on the browser/tab.
- **No uploads**: the file never leaves your machine; all parsing happens in the browser via WebAssembly.

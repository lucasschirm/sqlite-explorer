// Minimal, fully-offline Monaco setup.
//
// Imports are deliberately narrow (monaco-editor 0.56 layout):
//   - `editor/editor.api.js` — the editor core (no languages, no editor.main
//     bloat: no LSP client, no 90 other grammars).
//   - `languages/definitions/sql/register.js` — registers only the SQL
//     language; the tokenizer itself lazy-loads on first use.
//
// NOTE on import specifiers: monaco-editor 0.56's `exports` map maps
// `<pkg>/<path>` to `<pkg>/esm/vs/<path>`, so deep imports must OMIT the
// `esm/vs/` prefix. Writing `monaco-editor/esm/vs/...` does not resolve.
//
// Bundle impact vs `editor.main` (measured, minified): 2.68 MB vs 4.49 MB
// raw (695 KB vs 1.17 MB gzipped), with exactly one tokenizer (SQL).
import * as monaco from "monaco-editor/editor/editor.api.js";
// eslint-disable-next-line import/no-unresolved
import EditorWorker from "monaco-editor/editor/editor.worker.js?worker";
// eslint-disable-next-line import/no-unresolved
import "monaco-editor/languages/definitions/sql/register.js";

// Editor features must be wired explicitly when bypassing editor.main
// (editor.api alone has no suggest widget, snippets, clipboard or find).
// eslint-disable-next-line import/no-unresolved
import "monaco-editor/editor/contrib/suggest/browser/suggestController.js";
// eslint-disable-next-line import/no-unresolved
import "monaco-editor/editor/contrib/inlineCompletions/browser/inlineCompletions.contribution.js";
// eslint-disable-next-line import/no-unresolved
import "monaco-editor/editor/contrib/snippet/browser/snippetController2.js";
// eslint-disable-next-line import/no-unresolved
import "monaco-editor/editor/contrib/clipboard/browser/clipboard.js";
// eslint-disable-next-line import/no-unresolved
import "monaco-editor/editor/contrib/format/browser/formatActions.js";
// eslint-disable-next-line import/no-unresolved
import "monaco-editor/editor/contrib/find/browser/findController.js";

// Serve Monaco's base worker locally (no CDN): tokenization/model diffing run
// in a worker bundled by Vite's `?worker` pipeline, which also handles the
// GitHub Pages subpath (VITE_BASE) asset URL prefixing.
self.MonacoEnvironment = {
  getWorker() {
    return new EditorWorker();
  },
};

// SQL is the only language; drop unused built-in features to trim surface area.
monaco.editor.defineTheme("sqlite-explorer", {
  base: "vs",
  inherit: true,
  rules: [
    { token: "comment", foreground: "6b7280", fontStyle: "italic" },
    { token: "keyword", foreground: "1d4ed8" },
    { token: "string", foreground: "047857" },
    { token: "number", foreground: "b45309" },
    { token: "identifier", foreground: "111827" },
  ],
  colors: {
    "editor.background": "#ffffff",
    "editorLineNumber.foreground": "#9ca3af",
  },
});

export { monaco };

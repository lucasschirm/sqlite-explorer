// Copies the wa-sqlite WASM binary into public/sqlite/ so it can be served
// as a static asset (dev server, Freebuff preview, GitHub Pages). The app
// loads it via locateFile(`${BASE}sqlite/wa-sqlite.wasm`).
// Run automatically by `predev` and `prebuild` scripts.
import { copyFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "node_modules", "wa-sqlite", "dist", "wa-sqlite.wasm");
const destDir = join(root, "public", "sqlite");
const dest = join(destDir, "wa-sqlite.wasm");

mkdirSync(destDir, { recursive: true });

// Skip copying when the committed copy is already current (keeps dev startup fast).
try {
  if (existsSync(dest) && readFileSync(dest).equals(readFileSync(src))) {
    process.exit(0);
  }
} catch {
  // fall through and copy
}

copyFileSync(src, dest);
console.log("Copied wa-sqlite.wasm -> public/sqlite/wa-sqlite.wasm");

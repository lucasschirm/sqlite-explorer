// sqlitexp local server: serves the prebuilt viewer UI (dist/local.html) and
// streams the database file to the browser. The UI's SQLite worker reads
// pages on demand via HTTP Range requests against /api/db, so the whole file
// is never loaded into memory on either side.
import { createReadStream, openSync, readSync, closeSync, statSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Cheap SQLite magic-header check so the CLI can fail fast with a clean
 * error instead of serving a 400 MB "database" the viewer will reject.
 */
export function looksLikeSqliteFile(filePath: string): boolean {
  let fd: number | null = null;
  try {
    fd = openSync(filePath, "r");
    const header = Buffer.alloc(16);
    const read = readSync(fd, header, 0, 16, 0);
    if (read < 16) return false;
    return header.toString("latin1", 0, 15) === "SQLite format 3";
  } catch {
    return false;
  } finally {
    if (fd != null) closeSync(fd);
  }
}

export interface ServeOptions {
  file: string;
  port: number;
  open: boolean;
}

/** Start the server; resolves with the local URL once it is listening. */
export async function startServer(opts: ServeOptions): Promise<string> {
  const filePath = resolve(opts.file);
  const fileName = basename(filePath);
  const fileSize = statSync(filePath).size;

  // The prebuilt UI ships in dist/ — one level up from the compiled cli/.
  // (bin/sqlitexp.js → cli/commands/index.js → cli/server.js → ../dist/)
  // Same layout in dev and in the published package.
  const distDir = resolve(__dirname, "..", "dist");

  const app = Fastify({ logger: false });

  await app.register(fastifyStatic, {
    root: distDir,
    // Wildcard serving for /local.html and hashed /assets/*; no index so
    // GET / falls through to our redirect below. Unknown paths 404.
    index: false,
  });

  // Nice default: / → the CLI entry.
  app.get("/", async (_req, reply) => reply.redirect("/local.html"));

  // Prerendered static pages (SSG post-build step) ship inside dist/. The
  // viewer header links to /docs and /about; serve those files so the links
  // keep working offline (index: false above disables directory indexing).
  // Every docs page is its own static file — /docs/<route>/index.html;
  // unknown docs routes fall back to the overview.
  app.get("/docs", async (_req, reply) => reply.sendFile("docs/index.html"));
  app.get("/docs/*", async (req, reply) => {
    const route = (req.params as { "*": string })["*"]
      .replace(/\/+$/, "")
      .replace(/\.html$/, "");
    const sent = reply.sendFile(`docs/${route}/index.html`);
    return sent;
  });
  app.get("/about", async (_req, reply) => reply.sendFile("about/index.html"));

  // Boot info for the local.html entry (App cliMode).
  app.get("/api/boot", async () => ({ name: fileName, url: "/api/db" }));

  // The database itself. Range requests are the whole point: the UI's
  // SQLite worker fetches only the 4 KiB pages a query touches.
  app.get("/api/db", async (req, reply) => {
    reply.header("Accept-Ranges", "bytes");
    reply.header("Content-Type", "application/octet-stream");
    reply.header("Cache-Control", "no-store");

    const range = req.headers.range;
    if (typeof range !== "string") {
      reply.header("Content-Length", fileSize);
      return reply.send(createReadStream(filePath));
    }

    const m = /^bytes=(\d*)-(\d*)$/.exec(range);
    let start: number;
    let end: number;
    if (!m) {
      start = 0;
      end = fileSize - 1;
    } else if (m[1] === "" && m[2] !== "") {
      // Suffix range: bytes=-N → the last N bytes.
      start = Math.max(0, fileSize - Number(m[2]));
      end = fileSize - 1;
    } else {
      start = Number(m[1]);
      end = m[2] === "" ? fileSize - 1 : Math.min(Number(m[2]), fileSize - 1);
    }

    if (!Number.isInteger(start) || start < 0 || start >= fileSize || end < start) {
      reply.code(416).header("Content-Range", `bytes */${fileSize}`);
      return reply.send();
    }

    reply.code(206);
    reply.header("Content-Range", `bytes ${start}-${end}/${fileSize}`);
    reply.header("Content-Length", end - start + 1);
    return reply.send(createReadStream(filePath, { start, end }));
  });

  try {
    await app.listen({ port: opts.port, host: "127.0.0.1" });
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "EADDRINUSE") {
      throw new Error(`Port ${opts.port} is already in use — try --port with another value.`);
    }
    throw err;
  }

  const addr = app.server.address();
  const port = typeof addr === "object" && addr !== null ? addr.port : opts.port;
  const url = `http://localhost:${port}/local.html`;

  if (opts.open) {
    const { default: open } = await import("open");
    await open(url).catch(() => {
      // Best-effort only: printing the URL is enough when no browser exists.
    });
  }

  return url;
}

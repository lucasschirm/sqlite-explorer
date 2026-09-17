// Static-site generation (SSG) for every docs page (/docs, /docs/:slug and
// /docs/:parent/:child — the route list comes from src/docs/registry.tsx),
// /about and the / landing shell. Runs as a post-build step
// (`vite build && node scripts/prerender.mjs`):
//
//   1. Build an SSR bundle of src/prerender.tsx into .prerender/ (Vite SSR
//      build — no HTML emitted, externals resolved from node_modules).
//   2. Render each route with React's streaming SSR (renderToPipeableStream —
//      unlike the legacy renderToStaticMarkup it emits <!-- --> separators
//      between adjacent text nodes, which hydration needs to stay in sync).
//   3. Inject the markup into the built template's #root and write the pages
//      as dist/<route>/index.html (dist/index.html for /), giving every page
//      clean-path URLs.
//   4. Hydration is handled by src/main.tsx on the client.
//
// The script deletes .prerender/ when done.
import { build } from "vite";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { renderToPipeableStream } from "react-dom/server";
import { Writable } from "node:stream";

/** Windows-safe file:// URL for a filesystem path (cross-platform import). */
function pathToFileURL(p) {
  return new URL(`file://${p.startsWith("/") ? "" : "/"}${p}`);
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const distDir = join(root, "dist");
const ssrOutDir = join(root, ".prerender");

// Route metadata lives next to the rendered components (src/prerender.tsx).
// listRoutes() enumerates "/", "/about", "/docs" and one path per docs page.

/** Minimal HTML-escaping for head tags interpolated into the template. */
function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Render one element tree to static markup via the streaming SSR API. The
 * pipe resolves on 'finish'; errors reject the returned promise so the build
 * fails loudly instead of emitting a broken page.
 */
function renderToHtml(element) {
  return new Promise((resolvePromise, reject) => {
    const chunks = [];
    const stream = renderToPipeableStream(element, {
      onShellReady() {
        stream.pipe(
          new Writable({
            write(chunk, _enc, cb) {
              chunks.push(chunk);
              cb();
            },
            destroy(err, cb) {
              cb(err);
            },
          })
        );
      },
      onShellError(error) {
        reject(error);
      },
      onError(error) {
        reject(error);
      },
      onAllReady() {
        resolvePromise(Buffer.concat(chunks).toString());
      },
    });
  });
}

console.log("[prerender] building SSR bundle…");
await build({
  root,
  logLevel: "warn",
  configFile: join(root, "vite.config.ts"),
  build: {
    ssr: "src/prerender.tsx",
    outDir: ssrOutDir,
    emptyOutDir: true,
    // Never emit into dist/: keep the deployment output static-only.
    copyPublicDir: false,
  },
});

const { renderRoute, listRoutes } = await import(
  new URL("prerender.js", pathToFileURL(join(ssrOutDir, "/"))).href
);

const template = await readFile(join(distDir, "index.html"), "utf8");

const ROUTES = listRoutes();

for (const url of ROUTES) {
  // The docs app reads window.location to pick its page; during SSG the
  // route is injected via context instead (see src/prerender.tsx).
  const docsPathOverride =
    url === "/docs" ? "" : url.startsWith("/docs/") ? url.slice("/docs/".length) : undefined;
  const { element, title, description } = renderRoute(url, docsPathOverride);
  const html = await renderToHtml(element);

  // Inject the server markup into the template's #root.
  const withContent = template.replace(
    '<div id="root"></div>',
    `<div id="root">${html}</div>`
  );
  if (withContent === template) {
    throw new Error("[prerender] could not find #root in the built template");
  }

  // Inject per-route title + description into <head>. The template carries
  // the shared tags (viewport, favicon, gtag snippet) for every page.
  const described = withContent.replace(
    "</title>",
    `</title>\n    <meta name="description" content="${escapeHtml(description)}">`
  );
  const pageHtml = described.replace(
    /<title>.*?<\/title>/,
    `<title>${escapeHtml(title)}</title>`
  );

  // Every non-root route goes to <route>/index.html (clean URLs, served
  // as-is); / overwrites the template itself.
  if (url === "/") {
    await writeFile(join(distDir, "index.html"), pageHtml);
  } else {
    const outDir = join(distDir, url.slice(1));
    await mkdir(outDir, { recursive: true });
    await writeFile(join(outDir, "index.html"), pageHtml);
  }
  console.log(`[prerender] rendered ${url} (${(pageHtml.length / 1024).toFixed(1)} kB)`);
}

// Remove the temporary SSR bundle.
await rm(ssrOutDir, { recursive: true, force: true });
console.log("[prerender] done");

// Build-time prerender entry (SSG). Bundled by scripts/prerender.mjs via a
// Vite SSR build and executed in Node — never shipped to the browser.
//
// Every docs page (/docs plus /docs/:slug and /docs/:parent/:child from
// src/docs/registry.tsx) and /about are fully rendered here, plus the /
// landing shell, so the browser receives complete HTML and src/main.tsx
// hydrates it in place with zero re-render or flash.
//
// This module only describes WHAT to render (element trees + metadata); the
// HTML rendering itself happens in scripts/prerender.mjs with React 19's
// streaming SSR (renderToPipeableStream), which — unlike the legacy
// renderToStaticMarkup — emits <!-- --> separators between adjacent text
// nodes. Without them the browser merges adjacent text nodes and hydration
// fails with error #418, forcing a full client re-render (losing the static
// benefit and any scroll position).
import { StrictMode } from "react";
import type { ReactNode } from "react";
import { DocsPage } from "./components/DocsPage";
import { AboutPage } from "./components/AboutPage";
import { FileDropZone } from "./components/FileDropZone";
import { StaticPageShell } from "./components/StaticPageShell";
import { siteUrl } from "./lib/siteUrl";
import { allDocRoutes, resolveDocPath } from "./docs/registry";
import { createContext, useContext } from "react";

/**
 * During SSG there is no window.location; scripts/prerender.mjs passes the
 * route being rendered through this context so DocsPage can resolve which
 * registry page to render. Null in the browser (reads window.location).
 */
export const DocsPathContext = createContext<string | null>(null);
/** Hook used by DocsPage to learn the current docs path ("cli", "explorer/structure-tab", …). */
export function useDocsPath(): string {
  const injected = useContext(DocsPathContext);
  if (injected !== null) return injected;
  // Browser: parse window.location (base-path aware).
  const base = (import.meta.env.BASE_URL ?? "/").replace(/\/?$/, "/");
  const path = window.location.pathname.startsWith(base)
    ? `/${window.location.pathname.slice(base.length)}`
    : window.location.pathname;
  const parts = path.replace(/\/+$/, "").split("/").filter(Boolean);
  return parts[0] === "docs" ? parts.slice(1).join("/") : "";
}

interface PrerenderPage {
  title: string;
  description: string;
  render: () => ReactNode;
}

// The / page's static header — identical markup to App's `!hasDb` branch so
// the first client render matches and hydration stays quiet.
function HomeHeader() {
  return (
    <header className="px-6 py-3 bg-gray-900 text-white flex items-center gap-3 shrink-0">
      <span className="text-lg">🗄️</span>
      <h1 className="text-sm font-semibold">SQLite Explorer</h1>
      <nav className="ml-auto flex items-center gap-4 text-xs">
        <a href={siteUrl("/docs")} className="text-gray-300 hover:text-white transition-colors">
          Docs
        </a>
        <a href={siteUrl("/about")} className="text-gray-300 hover:text-white transition-colors">
          About
        </a>
      </nav>
    </header>
  );
}

const PAGES: Record<string, PrerenderPage> = {
  "/": {
    title: "SQLite Explorer — drop a SQLite file and explore it",
    description:
      "A fully offline, browser-based SQLite explorer. Drop a .sqlite/.db file, browse tables, run SQL, inspect structure and records — nothing is uploaded.",
    render: () => (
      <div className="h-screen w-screen flex flex-col bg-gray-50">
        <HomeHeader />
        <FileDropZone onPickFile={() => {}} onDemo={() => {}} isLoading={false} />
      </div>
    ),
  },
  "/about": {
    title: "About — SQLite Explorer",
    description:
      "A fully offline, browser-based SQLite explorer. Your data never leaves your machine.",
    render: () => <AboutPage />,
  },
};

// Every docs page shares the DocsPage component; the page component reads the
// URL itself (window.location in the browser, injected override in Node) to
// pick the section/child to render from the registry.
const DOCS_ROOT: PrerenderPage = {
  title: "Documentation — SQLite Explorer",
  description:
    "Drop a SQLite file, browse tables, run SQL, inspect structure and records — every feature documented with real screenshots.",
  render: () => <DocsPage />,
};

/**
 * List every URL that must be prerendered: the fixed pages plus one route per
 * docs page (overview, sections and children).
 */
export function listRoutes(): string[] {
  return [
    ...Object.keys(PAGES),
    "/docs",
    ...allDocRoutes().map(({ segments }) =>
      segments.length === 1 ? `/docs/${segments[0]}` : `/docs/${segments.join("/")}`
    ),
  ];
}

/** Metadata for a docs URL path ("", "getting-started", "cli/flags" …). */
function docsMeta(docsSubPath: string): { title: string; description: string } {
  if (docsSubPath === "") return DOCS_ROOT;
  const segments = docsSubPath.split("/").filter(Boolean);
  const resolved = resolveDocPath(segments);
  if (!resolved) return DOCS_ROOT;
  const page = resolved.page ?? resolved.section;
  return { title: `${page.title} — SQLite Explorer`, description: page.description };
}

/**
 * Build one route's element tree + metadata. Called from scripts/prerender.mjs,
 * which turns the element into HTML with the streaming SSR API.
 *
 * `docsPathOverride` stands in for window.location during SSG — the docs app
 * reads the URL to decide which registry page to render.
 */
export function renderRoute(
  url: string,
  docsPathOverride?: string
): {
  element: ReactNode;
  title: string;
  description: string;
} {
  let page: PrerenderPage;
  if (url === "/docs" || url.startsWith("/docs/")) {
    page = DOCS_ROOT;
  } else {
    page = PAGES[url];
    if (!page) throw new Error(`prerender: no page defined for ${url}`);
  }

  const meta =
    url === "/docs" || url.startsWith("/docs/")
      ? docsMeta(url.slice("/docs".length).replace(/^\//, ""))
      : page;
  const element = (
    <StrictMode>
      {url === "/" ? (
        page.render()
      ) : (
        <StaticPageShell page={url === "/about" ? "about" : "docs"}>
          <DocsPathContext.Provider value={docsPathOverride ?? null}>
            {page.render()}
          </DocsPathContext.Provider>
        </StaticPageShell>
      )}
    </StrictMode>
  );

  return { element, title: meta.title, description: meta.description };
}

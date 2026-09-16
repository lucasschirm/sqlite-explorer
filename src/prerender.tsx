// Build-time prerender entry (SSG). Bundled by scripts/prerender.mjs via a
// Vite SSR build and executed in Node — never shipped to the browser.
//
// /docs and /about are fully rendered here, plus the / landing shell, so the
// browser receives complete HTML and src/main.tsx hydrates it in place with
// zero re-render or flash.
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
  "/docs": {
    title: "Documentation — SQLite Explorer",
    description:
      "Drop a SQLite file, browse tables, run SQL, inspect structure and records — every feature documented with real screenshots.",
    render: () => <DocsPage />,
  },
  "/about": {
    title: "About — SQLite Explorer",
    description:
      "A fully offline, browser-based SQLite explorer. Your data never leaves your machine.",
    render: () => <AboutPage />,
  },
};

/**
 * Build one route's element tree + metadata. Called from scripts/prerender.mjs,
 * which turns the element into HTML with the streaming SSR API.
 */
export function renderRoute(url: string): {
  element: ReactNode;
  title: string;
  description: string;
} {
  const page = PAGES[url];
  if (!page) throw new Error(`prerender: no page defined for ${url}`);

  const element = (
    <StrictMode>
      {url === "/" ? (
        page.render()
      ) : (
        <StaticPageShell page={url === "/docs" ? "docs" : "about"}>
          {page.render()}
        </StaticPageShell>
      )}
    </StrictMode>
  );

  return { element, title: page.title, description: page.description };
}

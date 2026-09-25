// Shared layout for the /docs and /about pages. Both are prerendered at
// build time (see vite.config.ts + prerender.tsx) and hydrated client-side,
// so this shell must render identically on the server and in the browser.
import type { ReactNode } from "react";
import { siteUrl } from "../lib/siteUrl";

const navLink =
  "transition-colors text-gray-300 hover:text-white font-normal no-underline";

export function StaticPageShell({
  page,
  children,
}: {
  page: "docs" | "about";
  children: ReactNode;
}) {
  return (
    <div className="h-screen flex flex-col bg-white">
      <header className="px-6 py-3 bg-gray-900 text-white flex items-center gap-3 shrink-0 z-10">
        <a
          href={siteUrl("/")}
          className="flex items-center gap-3 text-white hover:opacity-90 transition-opacity"
        >
          <span className="text-lg">🗄️</span>
          <h1 className="text-sm font-semibold">SQLite Explorer</h1>
        </a>
        <nav className="ml-auto flex items-center gap-4 text-xs">
          <a
            href={siteUrl("/docs")}
            className={page === "docs" ? "text-white font-semibold" : navLink}
          >
            Docs
          </a>
          <a
            href={siteUrl("/about")}
            className={page === "about" ? "text-white font-semibold" : navLink}
          >
            About
          </a>
          <a
            href={siteUrl("/")}
            className="bg-gray-700 hover:bg-gray-600 px-3 py-1 rounded transition-colors"
          >
            ← Back to app
          </a>
        </nav>
      </header>
      <main id="page-scroll" className="flex-1 overflow-y-auto min-h-0">
        {children}
      </main>
    </div>
  );
}

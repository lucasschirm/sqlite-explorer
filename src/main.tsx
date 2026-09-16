// Entry for the site's URLs. Every /docs page (overview, /docs/:slug and
// /docs/:parent/:child) and /about are prerendered at build time
// (scripts/prerender.mjs + src/prerender.tsx) and hydrated here; / boots the
// interactive explorer (it needs drag & drop + the SQLite worker, so there is
// no useful static markup for it). The entry also redirects legacy URLs
// (#/docs, #/docs?<anchor>, #/about and the old /docs?<anchor> deep links).
import { StrictMode } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { DocsPage } from "./components/DocsPage";
import { AboutPage } from "./components/AboutPage";
import { StaticPageShell } from "./components/StaticPageShell";
import { siteUrl } from "./lib/siteUrl";

type StaticPage = "docs" | "about";

function staticPageForPath(pathname: string): StaticPage | null {
  // GitHub Pages deploys serve under VITE_BASE (e.g. /repo/); ignore that
  // prefix when matching the static routes. Hosts like Firebase Hosting
  // normalize /docs → /docs/ (301), so the trailing slash must not break
  // the match — otherwise the explorer boots over the prerendered page.
  const base = (import.meta.env.BASE_URL ?? "/").replace(/\/?$/, "/");
  const path = pathname.startsWith(base) ? `/${pathname.slice(base.length)}` : pathname;
  const normalized = path.replace(/\/+$/, "") || "/";
  if (normalized === "/docs" || normalized.startsWith("/docs/")) return "docs";
  return normalized === "/about" ? "about" : null;
}

function StaticApp({ page }: { page: StaticPage }) {
  return (
    <StaticPageShell page={page}>
      {page === "docs" ? <DocsPage /> : <AboutPage />}
    </StaticPageShell>
  );
}

/**
 * Legacy anchor deep links: /docs?section-id scrolled a single-page doc.
 * Map the old anchors to their new pages; /docs/about privacy anchor
 * unchanged. Runs after hydration.
 */
const LEGACY_ANCHOR_MAP: Record<string, string> = {
  "getting-started": "/docs/getting-started",
  "browsing-tables": "/docs/explorer",
  "sql-editor": "/docs/sql-editor",
  "ai-completions": "/docs/sql-editor",
  "structure-tab": "/docs/explorer/structure-tab",
  "record-drawer": "/docs/explorer/record-drawer",
  performance: "/docs/performance",
  "agent-tools": "/docs/agent-tools",
  keyboard: "/docs/keyboard",
};

function redirectLegacyAnchor(): boolean {
  const { search, hash } = window.location;
  // Old-style /docs?record-drawer and #/docs?record-drawer
  const anchor =
    search.startsWith("?") && search.length > 1 && !search.includes("=")
      ? search.slice(1)
      : hash.startsWith("#/docs?")
        ? hash.slice("#/docs?".length)
        : null;
  if (!anchor) return false;
  const target = LEGACY_ANCHOR_MAP[anchor];
  if (!target) return false;
  window.location.replace(siteUrl(target));
  return true;
}

// Legacy hash URLs (#/docs, #/docs?<anchor>, #/about) redirect to the real
// pages, preserving deep-link anchors. Runs before React so the redirect
// replaces the URL in the same navigation.
(function redirectLegacyHash(): void {
  const hash = window.location.hash;
  if (!hash.startsWith("#/docs") && !hash.startsWith("#/about")) return;
  const target = hash.startsWith("#/docs") ? "/docs" : "/about";
  const anchor = hash.startsWith("#/docs?") ? hash.slice("#/docs?".length) : null;
  if (anchor && LEGACY_ANCHOR_MAP[anchor]) {
    window.location.replace(siteUrl(LEGACY_ANCHOR_MAP[anchor]));
    return;
  }
  window.location.replace(siteUrl(anchor ? `${target}?${anchor}` : target));
})();

const page = staticPageForPath(window.location.pathname);

if (page) {
  // Prerendered page: hydrate the server-rendered markup in place.
  // Unmapped ?anchor queries still scroll to a matching id if one exists.
  if (window.location.search && !redirectLegacyAnchor()) {
    const anchor = window.location.search.slice(1);
    requestAnimationFrame(() => {
      document.getElementById(anchor)?.scrollIntoView({ block: "start" });
    });
  }
  hydrateRoot(
    document.getElementById("root")!,
    <StrictMode>
      <StaticApp page={page} />
    </StrictMode>
  );
} else {
  // Explorer: client-rendered.
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}

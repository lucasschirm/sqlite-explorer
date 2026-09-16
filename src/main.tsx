// Entry for the site's URLs. /docs and /about are prerendered at build time
// (scripts/prerender.mjs + src/prerender.tsx) and hydrated here; / boots the
// interactive explorer (it needs drag & drop + the SQLite worker, so there is
// no useful static markup for it). The entry also redirects legacy hash URLs
// (#/docs, #/docs?<anchor>, #/about) to their new /docs and /about pages.
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
  return normalized === "/docs" ? "docs" : normalized === "/about" ? "about" : null;
}

function StaticApp({ page }: { page: StaticPage }) {
  return (
    <StaticPageShell page={page}>
      {page === "docs" ? <DocsPage /> : <AboutPage />}
    </StaticPageShell>
  );
}

/**
 * Scroll to the section anchor carried by /docs?section (also accepted as
 * #/docs?section by the legacy-hash redirect). Runs after hydration and on
 * hashchange; rAF waits one frame so layout exists before measuring.
 */
function handleAnchor(): void {
  const { search, hash } = window.location;
  const anchor = search.startsWith("?") && search.length > 1
    ? search.slice(1)
    : hash.startsWith("#/docs?")
      ? hash.slice("#/docs?".length)
      : null;
  if (!anchor || anchor.includes("=")) return;
  requestAnimationFrame(() => {
    document.getElementById(anchor)?.scrollIntoView({ block: "start" });
  });
}

// Legacy hash URLs (#/docs, #/docs?<anchor>, #/about) redirect to the real
// /docs and /about pages, preserving deep-link anchors. Runs before React so
// the redirect replaces the URL in the same navigation.
(function redirectLegacyHash(): void {
  const hash = window.location.hash;
  if (!hash.startsWith("#/docs") && !hash.startsWith("#/about")) return;
  const target = hash.startsWith("#/docs") ? "/docs" : "/about";
  const anchor = hash.startsWith("#/docs?") ? hash.slice("#/docs?".length) : null;
  window.location.replace(siteUrl(anchor ? `${target}?${anchor}` : target));
})();

const page = staticPageForPath(window.location.pathname);

if (page) {
  // Prerendered page: hydrate the server-rendered markup in place.
  window.addEventListener("hashchange", handleAnchor);
  if (window.location.search) handleAnchor();
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

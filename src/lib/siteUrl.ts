// Prefix app-internal paths with the deployed base URL (import.meta.env.BASE_URL).
// Plain absolute paths like "/docs" break on subpath deploys (GitHub Pages with
// VITE_BASE=/repo/); this keeps internal links and redirects correct for both.
export function siteUrl(path: string): string {
  const base = (import.meta.env.BASE_URL ?? "/").replace(/\/?$/, "/");
  return `${base}${path.replace(/^\//, "")}`;
}

/**
 * Base-path-aware parse of the current location: strips the deploy prefix
 * (import.meta.env.BASE_URL, e.g. "/repo/" on GitHub Pages) and returns the
 * app-internal path, e.g. "/explorer". Mirror of main.tsx's staticPageForPath.
 */
export function sitePathname(): string {
  const base = (import.meta.env.BASE_URL ?? "/").replace(/\/?$/, "/");
  const path = window.location.pathname.startsWith(base)
    ? `/${window.location.pathname.slice(base.length)}`
    : window.location.pathname;
  return path || "/";
}

/**
 * pushState/replaceState to an app-internal path, prefixing it with the
 * deployed base URL so subpath deploys (VITE_BASE) keep working.
 */
export function sitePushState(path: string, replace = false): void {
  const url = siteUrl(path);
  if (replace) window.history.replaceState(null, "", url);
  else window.history.pushState(null, "", url);
}

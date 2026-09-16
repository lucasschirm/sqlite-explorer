// Prefix app-internal paths with the deployed base URL (import.meta.env.BASE_URL).
// Plain absolute paths like "/docs" break on subpath deploys (GitHub Pages with
// VITE_BASE=/repo/); this keeps internal links and redirects correct for both.
export function siteUrl(path: string): string {
  const base = (import.meta.env.BASE_URL ?? "/").replace(/\/?$/, "/");
  return `${base}${path.replace(/^\//, "")}`;
}

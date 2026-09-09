// Resolve an app asset path against the deployed base URL (works for root
// deploys and GitHub Pages subpath deploys alike).
export const assetUrl = (name: string): string =>
  `${(import.meta.env.BASE_URL ?? "/").replace(/\/?$/, "/")}${name}`;

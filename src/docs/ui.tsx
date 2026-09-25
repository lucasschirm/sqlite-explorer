// Shared building blocks for the docs pages (src/docs/registry.tsx renders
// its content with these). Kept apart from the layout in DocsPage.tsx so the
// registry stays readable.
import type { ReactNode } from "react";
import { assetUrl } from "../lib/assetUrl";
import { siteUrl } from "../lib/siteUrl";
import type { DocPage } from "./registry";

/** Inline code chip. */
export function Code({ children }: { children: ReactNode }) {
  return (
    <code className="px-1.5 py-0.5 rounded bg-gray-100 border border-gray-200 font-mono text-[12px] text-gray-800">
      {children}
    </code>
  );
}

/** Keyboard key chip. */
export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="px-1.5 py-0.5 rounded border border-gray-300 border-b-2 bg-gray-50 font-mono text-[11px] text-gray-700">
      {children}
    </kbd>
  );
}

/** Real app screenshot (public/screenshots/, captured by Playwright). */
export function Shot({ name, alt }: { name: string; alt: string }) {
  return (
    <figure className="my-6">
      {/* Explicit dimensions reserve layout space before the lazy image
          loads (prevents CLS and keeps anchor scrolling correct). All
          screenshots are captured at 1440×900 (capture-screenshots.mjs). */}
      <img
        src={assetUrl(`screenshots/${name}.png`)}
        alt={alt}
        width={1440}
        height={900}
        loading="lazy"
        className="w-full rounded-lg border border-gray-200 shadow-sm"
      />
      <figcaption className="mt-1.5 text-xs text-gray-400">{alt}</figcaption>
    </figure>
  );
}

/** A titled block of prose inside a docs page. */
export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-xl font-bold text-gray-900 mt-10 mb-3">{title}</h2>
      <div className="space-y-3 text-sm leading-relaxed text-gray-700">{children}</div>
    </section>
  );
}

/** Callout listing a parent page's sub-pages (rendered at the bottom). */
export function SubPages({
  pages,
  parentSlug,
}: {
  pages: DocPage[];
  parentSlug: string;
}) {
  if (pages.length === 0) return null;
  return (
    <div className="mt-10 rounded-lg border border-blue-100 bg-blue-50/60 p-5">
      <p className="text-xs font-semibold uppercase tracking-wider text-blue-700">
        Continue reading
      </p>
      <ul className="mt-3 space-y-2">
        {pages.map((child) => (
          <li key={child.slug} className="text-sm">
            <a
              href={siteUrl(`/docs/${parentSlug}/${child.slug}`)}
              className="font-medium text-blue-700 hover:underline"
            >
              {child.title}
            </a>
            <span className="ml-2 text-gray-600">— {child.description}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Simple two/three-column definition table used by a few docs pages. */
export function Table({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wider text-gray-500 border-b border-gray-200">
            {head.map((h) => (
              <th key={h} className="py-2 pr-4">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 align-top">
          {rows.map((cells, i) => (
            <tr key={i}>
              {cells.map((cell, j) => (
                <td key={j} className="py-2 pr-4">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

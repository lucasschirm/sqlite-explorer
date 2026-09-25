// Documentation app — a multi-page docs site rendered from the single-source
// registry in src/docs/registry.tsx.
//
// The whole tree is prerendered at build time (SSG; see scripts/prerender.mjs)
// and hydrated by src/main.tsx. Navigation is plain <a href> links, so every
// page is a real URL — /docs, /docs/:slug and /docs/:parent/:child — with the
// left navigation tracking the active section via window.location.
//
// Left navigation: each section with children renders as a dropdown item.
// Clicking the section header navigates to its page AND toggles it open so
// the sub-items expand below. Sections with children show a "❯" chevron that
// rotates 90° when expanded; clicking the chevron (or a child) also expands
// without navigating away from the currently open page when it belongs to
// another section.
import { useState } from "react";
import { DOC_SECTIONS, OverviewPage, resolveDocPath } from "../docs/registry";
import type { DocSection } from "../docs/registry";
import { siteUrl } from "../lib/siteUrl";
import { useDocsPath } from "../prerender";

interface NavItemProps {
  section: DocSection;
  activeSegments: string[];
  expanded: Set<string>;
  toggle: (slug: string) => void;
}

/** One sidebar section: link row (+ chevron when it has children) + children. */
function NavSectionItem({ section, activeSegments, expanded, toggle }: NavItemProps) {
  const isOpen = expanded.has(section.slug);
  const isActive = activeSegments[0] === section.slug;
  const childSlug = activeSegments[1];
  const hasChildren = (section.children?.length ?? 0) > 0;

  return (
    <li>
      <div className="flex items-stretch">
        <a
          href={siteUrl(`/docs/${section.slug}`)}
          className={`flex-1 min-w-0 px-3 py-1.5 rounded-md text-sm transition-colors truncate ${
            isActive
              ? "bg-blue-50 text-blue-700 font-semibold"
              : "text-gray-700 hover:bg-gray-100 hover:text-gray-900"
          }`}
        >
          {section.title}
        </a>
        {hasChildren && (
          <button
            type="button"
            onClick={() => toggle(section.slug)}
            aria-expanded={isOpen}
            aria-label={`Toggle ${section.title}`}
            className="w-7 shrink-0 flex items-center justify-center rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
          >
            {/* Chevron rotates 90° when the section is expanded. */}
            <span
              className={`inline-block text-xs transition-transform duration-200 ${
                isOpen ? "rotate-90" : ""
              }`}
            >
              ❯
            </span>
          </button>
        )}
      </div>
      {hasChildren && isOpen && (
        <ul className="mt-0.5 mb-1 ml-3 border-l border-gray-200 pl-2 space-y-0.5">
          {section.children!.map((child) => {
            const childActive = isActive && childSlug === child.slug;
            return (
              <li key={child.slug}>
                <a
                  href={siteUrl(`/docs/${section.slug}/${child.slug}`)}
                  className={`block px-3 py-1 rounded-md text-[13px] transition-colors truncate ${
                    childActive
                      ? "bg-blue-50 text-blue-700 font-medium"
                      : "text-gray-500 hover:bg-gray-100 hover:text-gray-800"
                  }`}
                >
                  {child.title}
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
}

export function DocsPage() {
  // Current docs path ("", "cli", "explorer/structure-tab", …) — from the
  // SSG-injected context during prerender, from window.location in browser.
  const docsPath = useDocsPath();
  const segments = docsPath.split("/").filter(Boolean);
  const resolved = resolveDocPath(segments);

  // Sections expanded in the sidebar. Defaults: every section containing the
  // active page (a deep link to a child opens its parent automatically).
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    if (resolved) initial.add(resolved.section.slug);
    return initial;
  });

  const toggle = (slug: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) {
        next.delete(slug);
      } else {
        next.add(slug);
      }
      return next;
    });
  };

  // What to render: a child page, a section page, the overview, or 404.
  let title: string;
  let description: string;
  let content;
  if (resolved) {
    if (resolved.page) {
      title = resolved.page.title;
      description = resolved.page.description;
      content = resolved.page.render();
    } else {
      title = resolved.section.title;
      description = resolved.section.description;
      content = resolved.section.render();
    }
  } else if (segments.length === 0) {
    title = "Documentation";
    description = "Everything this app can do today — no aspirational features.";
    content = OverviewPage();
  } else {
    title = "Page not found";
    description = "This documentation page does not exist.";
    content = (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">
        <p className="font-semibold">This documentation page does not exist.</p>
        <p className="mt-1">
          Pick a page from the left navigation or head back to the{" "}
          <a href={siteUrl("/docs")} className="underline">
            docs overview
          </a>
          .
        </p>
      </div>
    );
  }

  const breadcrumb = resolved
    ? resolved.page
      ? [
          { label: "Docs", href: siteUrl("/docs") },
          { label: resolved.section.title, href: siteUrl(`/docs/${resolved.section.slug}`) },
        ]
      : [
          { label: "Docs", href: siteUrl("/docs") },
        ]
    : [];

  return (
    <div className="max-w-6xl mx-auto px-6 py-10 flex gap-8 items-start">
      {/* Left navigation — sticky, dropdown-style sections */}
      <nav className="hidden lg:block w-60 shrink-0 sticky top-10" aria-label="Docs navigation">
        <a
          href={siteUrl("/docs")}
          className={`block px-3 py-1.5 rounded-md text-sm font-semibold transition-colors ${
            segments.length === 0
              ? "bg-blue-50 text-blue-700"
              : "text-gray-900 hover:bg-gray-100"
          }`}
        >
          Documentation
        </a>
        <ul className="mt-2 space-y-0.5">
          {DOC_SECTIONS.map((section) => (
            <NavSectionItem
              key={section.slug}
              section={section}
              activeSegments={segments}
              expanded={expanded}
              toggle={toggle}
            />
          ))}
        </ul>
      </nav>

      {/* Content column */}
      <article className="min-w-0 flex-1 max-w-3xl">
        <nav className="flex items-center gap-1.5 text-xs text-gray-400" aria-label="Breadcrumb">
          {breadcrumb.map((crumb, i) => (
            <span key={crumb.href} className="flex items-center gap-1.5">
              {i > 0 && <span aria-hidden>❯</span>}
              <a href={crumb.href} className="hover:text-gray-700 transition-colors">
                {crumb.label}
              </a>
            </span>
          ))}
          <span aria-hidden>❯</span>
          <span className="text-gray-600">{title}</span>
        </nav>

        <h1 className="text-3xl font-bold text-gray-900 mt-2">{title}</h1>
        <p className="mt-2 text-gray-600">{description}</p>

        {content}
      </article>
    </div>
  );
}

import { test, expect, type Page } from "@playwright/test";

// The multi-page docs site (/docs plus /docs/:slug and /docs/:parent/:child)
// and /about are prerendered at build time (scripts/prerender.mjs +
// src/prerender.tsx) and hydrated by src/main.tsx. These tests lock in the
// SSG behavior: static content per URL, working navigation across real pages,
// sidebar dropdown expansion with the ❯ chevron, legacy #/ hash redirects,
// and hydration that completes without React errors.

function trackConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(String(err)));
  return errors;
}

test.describe("Static pages (SSG)", () => {
  test("landing header links navigate to the prerendered /docs and /about", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "SQLite Explorer" })).toBeVisible();

    await page.getByRole("link", { name: "Docs" }).click();
    await expect(page).toHaveURL(/\/docs$/);
    await expect(page.getByRole("heading", { name: "Documentation", level: 1 })).toBeVisible();
    // Overview links to every docs section
    await expect(page.getByRole("link", { name: /CLI \(sqlitexp\)/ }).first()).toBeVisible();

    await page.getByRole("link", { name: "About" }).click();
    await expect(page).toHaveURL(/\/about$/);
    await expect(page.getByText("Your data never leaves your machine")).toBeVisible();

    await page.getByRole("link", { name: "Back to app" }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByTestId("load-demo")).toBeVisible();
  });

  test("/docs/:slug renders its own prerendered page", async ({ page }) => {
    const errors = trackConsoleErrors(page);
    await page.goto("/docs/cli");
    await expect(page.getByRole("heading", { name: "CLI (sqlitexp)", level: 1 })).toBeVisible();
    await expect(page.getByText("npm install @lucasschirm/sqlite-explorer -g")).toBeVisible();
    // Left navigation marks the section active
    await expect(
      page.locator("nav[aria-label='Docs navigation']").getByRole("link", { name: "CLI (sqlitexp)" })
    ).toHaveClass(/bg-blue-50/);
    expect(errors).toEqual([]);
  });

  test("/docs/:parent/:child renders the sub-page and auto-expands the sidebar", async ({
    page,
  }) => {
    const errors = trackConsoleErrors(page);
    await page.goto("/docs/explorer/structure-tab");
    await expect(page.getByRole("heading", { name: "Structure tab", level: 1 })).toBeVisible();

    // The parent section's chevron is expanded (rotated) on a deep link.
    const chevron = page
      .locator("nav[aria-label='Docs navigation'] button[aria-expanded='true']")
      .first();
    await expect(chevron).toBeVisible();
    await expect(chevron.locator("span").first()).toHaveClass(/rotate-90/);
    // And the child list shows the active sub-page.
    await expect(
      page.locator("nav[aria-label='Docs navigation']").getByRole("link", { name: "Structure tab" })
    ).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("sidebar chevron expands and collapses on click", async ({ page }) => {
    await page.goto("/docs");
    const explorerToggle = page.locator(
      "nav[aria-label='Docs navigation'] button[aria-label='Toggle The explorer']"
    );
    await expect(explorerToggle).toBeVisible();

    // Clicking the chevron expands the sub-items without navigating.
    await explorerToggle.click();
    await expect(explorerToggle).toHaveAttribute("aria-expanded", "true");
    await expect(
      page.locator("nav[aria-label='Docs navigation']").getByRole("link", { name: "Record drawer" })
    ).toBeVisible();

    // Clicking again collapses.
    await explorerToggle.click();
    await expect(explorerToggle).toHaveAttribute("aria-expanded", "false");
  });

  test("/docs deep-link scroll fallback and legacy hash redirects", async ({ page }) => {
    // Old-style single-page deep links redirect to the new pages.
    await page.goto("/#/docs");
    await expect(page).toHaveURL(/\/docs$/);
    await expect(page.getByRole("heading", { name: "Documentation", level: 1 })).toBeVisible();

    await page.goto("/#/docs?record-drawer");
    await expect(page).toHaveURL(/\/docs\/explorer\/record-drawer$/);
    await expect(page.getByRole("heading", { name: "Record drawer", level: 1 })).toBeVisible();

    await page.goto("/#/about");
    await expect(page).toHaveURL(/\/about$/);
    await expect(page.getByText("Your data never leaves your machine")).toBeVisible();
  });

  test("trailing-slash URLs hydrate the static page, not the explorer", async ({ page }) => {
    // Firebase Hosting normalizes /docs → /docs/ (301); the entry must still
    // recognize the static route instead of booting the explorer over it.
    const errors = trackConsoleErrors(page).filter(
      (e) => !e.includes("WebGPU") && !e.includes("GPU")
    );
    await page.goto("/docs/");
    await expect(page.getByRole("heading", { name: "Documentation", level: 1 })).toBeVisible();
    expect(errors).toEqual([]);

    await page.goto("/docs/keyboard/");
    await expect(
      page.getByRole("heading", { name: "Keyboard shortcuts", level: 1 })
    ).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("hydrated docs pages are interactive and error-free", async ({ page }) => {
    const errors = trackConsoleErrors(page);
    await page.goto("/docs");
    await expect(page.getByRole("heading", { name: "Documentation", level: 1 })).toBeVisible();

    // Navigation happens via plain links between prerendered pages.
    await page.getByRole("link", { name: "Getting started" }).first().click();
    await expect(page).toHaveURL(/\/docs\/getting-started$/);
    await expect(
      page.getByRole("heading", { name: "Getting started", level: 1 })
    ).toBeVisible();

    // From a section page, follow a "Continue reading" link to its sub-page.
    await page.goto("/docs/explorer");
    await page.getByRole("link", { name: /Structure tab/ }).last().click();
    await expect(page).toHaveURL(/\/docs\/explorer\/structure-tab$/);
    expect(errors).toEqual([]);
  });
});

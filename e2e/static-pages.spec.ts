import { test, expect, type Page } from "@playwright/test";

// The /docs and /about pages are prerendered at build time
// (scripts/prerender.mjs + src/prerender.tsx) and hydrated by src/main.tsx.
// These tests lock in the SSG behavior: static content in the source, working
// navigation, anchor scrolling, legacy #/ hash URL redirects, and hydration
// that completes without React errors.

function trackConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(String(err)));
  return errors;
}

test.describe("Static pages (SSG)", () => {
  test("landing header links navigate to the prerendered /docs and /about", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "SQLite Explorer" })).toBeVisible();

    await page.getByRole("link", { name: "Docs" }).click();
    await expect(page).toHaveURL(/\/docs$/);
    await expect(page.getByRole("heading", { name: "Documentation" })).toBeVisible();
    // Full static content: all nine sections render
    await expect(page.locator("h2")).toHaveCount(9);

    await page.getByRole("link", { name: "About" }).click();
    await expect(page).toHaveURL(/\/about$/);
    await expect(page.getByText("Your data never leaves your machine")).toBeVisible();

    await page.getByRole("link", { name: "Back to app" }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByTestId("load-demo")).toBeVisible();
  });

  test("/docs deep link scrolls to the requested section", async ({ page }) => {
    const errors = trackConsoleErrors(page);
    await page.goto("/docs?record-drawer");
    await expect(page.getByRole("heading", { name: "Record drawer" })).toBeVisible();
    await expect
      .poll(async () => page.evaluate(() => document.getElementById("page-scroll")?.scrollTop ?? 0))
      .toBeGreaterThan(100);
    expect(errors).toEqual([]);

    // Screenshots are lazy-loaded but must actually resolve (dimensions
    // reserved via width/height attributes).
    await expect(page.locator("img").first()).toHaveJSProperty("naturalWidth", 1440, {
      timeout: 15_000,
    });
  });

  test("legacy #/docs and #/about hash URLs redirect to the clean pages", async ({ page }) => {
    await page.goto("/#/docs");
    await expect(page).toHaveURL(/\/docs$/);
    await expect(page.getByRole("heading", { name: "Documentation" })).toBeVisible();

    // Deep-link variant preserves the anchor as a query param and scrolls.
    await page.goto("/#/docs?structure-tab");
    await expect(page).toHaveURL(/\/docs\?structure-tab$/);
    await expect
      .poll(async () => page.evaluate(() => document.getElementById("page-scroll")?.scrollTop ?? 0))
      .toBeGreaterThan(100);

    await page.goto("/#/about");
    await expect(page).toHaveURL(/\/about$/);
    await expect(page.getByText("Your data never leaves your machine")).toBeVisible();
  });

  test("trailing-slash URLs hydrate the static page, not the explorer", async ({ page }) => {
    // Firebase Hosting normalizes /docs → /docs/ (301); the entry must still
    // recognize the static route instead of booting the explorer over it.
    const errors = trackConsoleErrors(page).filter((e) => !e.includes("WebGPU") && !e.includes("GPU"));
    await page.goto("/docs/");
    await expect(page.getByRole("heading", { name: "Documentation", level: 1 })).toBeVisible();
    await expect(page.locator("h2")).toHaveCount(9);
    expect(errors).toEqual([]);
  });

  test("hydrated /docs page is interactive and error-free", async ({ page }) => {
    const errors = trackConsoleErrors(page);
    await page.goto("/docs");
    await expect(page.getByRole("heading", { name: "Documentation" })).toBeVisible();

    // Interaction only works after hydration: the TOC link scrolls the page.
    await page.getByRole("link", { name: "Record drawer" }).click();
    await expect(page).toHaveURL(/\/docs\?record-drawer$/);
    await expect
      .poll(async () => page.evaluate(() => document.getElementById("page-scroll")?.scrollTop ?? 0))
      .toBeGreaterThan(100);
    expect(errors).toEqual([]);
  });
});

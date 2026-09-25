import { test, expect, type Page } from "@playwright/test";

// The demo database has FKs (orders → customers, orders → products), so the
// ERD includes relationship edges as well as one node per table.
async function loadDemo(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "SQLite Explorer" })).toBeVisible();
  await page.getByTestId("load-demo").click();
  const sidebar = page.locator("aside, .w-60").first();
  await sidebar.getByText("customers").waitFor({ timeout: 15_000 });
}

async function openDiagram(page: Page): Promise<void> {
  await page.getByTestId("sidebar-section-diagram").click();
  await expect(page).toHaveURL(/#\/visualize$/);
  // The ERD canvas mounts once the schema is parsed (sqlite-erd's own WASM
  // SQLite parses the DDL; the canvas is a React Flow instance).
  await expect(page.locator(".react-flow__node")).not.toHaveCount(0, { timeout: 30_000 });
}

// Tabs render their icon and title in separate spans, so text matching is
// brittle — select via the tab bar's data-tab-id wrapper instead.
function tab(page: Page, name: string) {
  return page.locator("[data-tab-id]").filter({ hasText: name });
}

test.describe("ERD diagram page (/visualize)", () => {
  test("sidebar shows Data | Diagram switcher and Diagram opens /visualize", async ({ page }) => {
    await loadDemo(page);

    const sections = page.getByTestId("sidebar-sections");
    await expect(sections).toBeVisible();
    await expect(sections.getByText("Data", { exact: true })).toBeVisible();
    await expect(sections.getByText("Diagram", { exact: true })).toBeVisible();

    await openDiagram(page);
    // The ERD renders the demo tables as nodes
    await expect(page.locator(".react-flow__node", { hasText: "customers" })).toBeVisible();
    await expect(page.locator(".react-flow__node", { hasText: "orders" })).toBeVisible();
    await expect(page.locator(".react-flow__node", { hasText: "products" })).toBeVisible();
  });

  test("diagram shows the open database's file name", async ({ page }) => {
    await loadDemo(page);
    await openDiagram(page);
    await expect(page.getByTestId("erd-filename")).toHaveText("demo.db");
  });

  test("clicking a table on the diagram returns to the explorer with its Data tab", async ({ page }) => {
    await loadDemo(page);
    await openDiagram(page);

    await page.locator(".react-flow__node", { hasText: "orders" }).click();

    // Back on the explorer (#/), the orders Data tab is open with its query
    await expect(page).toHaveURL(/#\/$|\/$/);
    await expect(tab(page, "orders")).toBeVisible({ timeout: 15_000 });
    await expect(page.locator(".monaco-editor .view-lines")).toContainText(
      'SELECT * FROM "orders" LIMIT 100',
      { timeout: 15_000 }
    );
  });

  test("diagram keeps the left sidebar for direct table navigation", async ({ page }) => {
    await loadDemo(page);
    await openDiagram(page);

    const sidebar = page.locator("aside, .w-60").first();
    await expect(sidebar.getByText("Tables (")).toBeVisible();

    // Clicking a table in the sidebar switches back to Data and opens the tab
    await sidebar.getByText("customers").click();
    await expect(page).toHaveURL(/#\/$|\/$/);
    await expect(tab(page, "customers")).toBeVisible({ timeout: 15_000 });
  });

  test("Data switcher returns to the explorer keeping tabs intact", async ({ page }) => {
    await loadDemo(page);
    const sidebar = page.locator("aside, .w-60").first();
    await sidebar.getByText("customers").click();
    await expect(tab(page, "customers")).toBeVisible();

    await page.getByTestId("sidebar-section-diagram").click();
    await expect(page).toHaveURL(/#\/visualize$/);
    await page.getByTestId("sidebar-section-data").click();
    await expect(page).toHaveURL(/#\/$|\/$/);
    // Tab survives the round trip
    await expect(tab(page, "customers")).toBeVisible();
  });

  test("direct navigation to #/visualize without a database shows the empty state", async ({ page }) => {
    await page.goto("/#/visualize");
    await expect(page.getByText("No database open")).toBeVisible({ timeout: 15_000 });
    await page.getByText("← Back to the explorer").click();
    await expect(page).toHaveURL(/#\/$|\/$/);
    await expect(page.getByTestId("load-demo")).toBeVisible();
  });
});

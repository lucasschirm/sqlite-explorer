import { test, expect } from "@playwright/test";

test.describe("SQLite Viewer", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "SQLite Viewer" })).toBeVisible();
  });

  test("shows demo button and drops file validation UI on the landing page", async ({ page }) => {
    await expect(page.getByTestId("load-demo")).toBeVisible();
    await expect(page.getByText("Drop a SQLite file anywhere")).toBeVisible();
  });

  test("loads the demo database and browses tables", async ({ page }) => {
    await page.getByTestId("load-demo").click();

    // Sidebar should list the demo tables with row counts
    const sidebar = page.locator("aside, .w-60").first();
    await expect(sidebar.getByText("customers")).toBeVisible({ timeout: 15_000 });
    await expect(sidebar.getByText("orders")).toBeVisible();
    await expect(sidebar.getByText("products")).toBeVisible();

    // Success toast
    await expect(page.getByText(/Loaded "demo\.db"/)).toBeVisible();

    // Open the customers table (Data tab)
    await sidebar.getByText("customers").click();
    await expect(page.getByText('SELECT * FROM "customers" LIMIT 100')).toBeVisible();
    await expect(page.getByText("Customer 1", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("50 rows")).toBeVisible();

    // Run a custom SQL query from the editor
    const editor = page.getByPlaceholder("Enter SQL query...");
    await editor.fill("SELECT city, COUNT(*) AS n FROM customers GROUP BY city ORDER BY n DESC");
    await page.getByRole("button", { name: "Run" }).click();

    // Aggregated rows appear
    await expect(page.getByText(/rows$/)).toBeVisible();
    await expect(page.getByText("Lisbon")).toBeVisible();
  });

  test("opens Structure tab with columns and indexes grids", async ({ page }) => {
    await page.getByTestId("load-demo").click();
    const sidebar = page.locator("aside, .w-60").first();
    await expect(sidebar.getByText("customers")).toBeVisible({ timeout: 15_000 });

    // Hover the orders row to reveal its structure button, then click it
    const row = sidebar.getByText("orders");
    await row.hover();
    await row.locator("xpath=ancestor::div[1]").getByTitle("Structure").click();

    await expect(page.getByText("Columns (")).toBeVisible();
    await expect(page.getByText("Indexes (")).toBeVisible();
    await expect(page.getByText("idx_orders_customer")).toBeVisible();
  });

  test("double-click a row opens the Record tab as a form", async ({ page }) => {
    await page.getByTestId("load-demo").click();
    const sidebar = page.locator("aside, .w-60").first();
    await expect(sidebar.getByText("customers")).toBeVisible({ timeout: 15_000 });

    await sidebar.getByText("customers").click();
    await expect(page.getByText("Customer 1", { exact: true }).first()).toBeVisible();

    // Double-click the first row (contains "Customer 1")
    await page.getByText("Customer 1", { exact: true }).first().dblclick();

    // Record tab opens with a form-style view
    await expect(page.getByText(/Record \d+/)).toBeVisible();
    await expect(page.getByText("email")).toBeVisible();
    await expect(page.getByText("city")).toBeVisible();
  });
});

import { test, expect } from "@playwright/test";
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";

// Generate the WAL-mode fixture lazily (gitignored artifacts stay out of the
// repo); the generator writes a database whose header declares WAL journal
// mode — the regression that previously failed with SQLITE_CANTOPEN.
const walDbPath = "/tmp/wal-test.db";
function ensureWalDb(): string {
  if (!existsSync(walDbPath)) {
    execSync("bun scripts/make-wal-test-db.js", { cwd: process.cwd(), stdio: "ignore" });
  }
  return walDbPath;
}

test.describe("SQLite Explorer", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "SQLite Explorer" })).toBeVisible();
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
    // Monaco ships as a lazy chunk; under parallel workers it can take a
    // moment beyond the default 5s assertion timeout.
    await expect(page.getByText('SELECT * FROM "customers" LIMIT 100')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Customer 1", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("50 rows")).toBeVisible();

    // Run a custom SQL query from the Monaco editor
    const editor = page.getByTestId("sql-editor");
    await editor.click();
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.insertText("SELECT city, COUNT(*) AS n FROM customers GROUP BY city ORDER BY n DESC");
    await page.getByRole("button", { name: "Run" }).click();

    // Aggregated rows appear
    await expect(page.getByText(/rows$/)).toBeVisible();
    await expect(page.getByText("Lisbon")).toBeVisible();
  });

  test("loads a database file picked via the file picker", async ({ page }) => {
    // Exercises the hidden file input path (same chunked reader as drops).
    await page.setInputFiles('input[type="file"]', "public/demo.db");

    const sidebar = page.locator("aside, .w-60").first();
    await expect(sidebar.getByText("customers")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/Loaded "demo\.db"/)).toBeVisible();

    await sidebar.getByText("customers").click();
    await expect(page.getByText("Customer 1", { exact: true }).first()).toBeVisible();
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

  test("double-click a row opens the record drawer", async ({ page }) => {
    await page.getByTestId("load-demo").click();
    const sidebar = page.locator("aside, .w-60").first();
    await expect(sidebar.getByText("customers")).toBeVisible({ timeout: 15_000 });

    await sidebar.getByText("customers").click();
    await expect(page.getByText("Customer 1", { exact: true }).first()).toBeVisible();

    // Double-click the first row (contains "Customer 1")
    await page.getByText("Customer 1", { exact: true }).first().dblclick();

    // Drawer opens with a form-style view
    const drawer = page.getByRole("dialog", { name: "Record from customers" });
    await expect(drawer).toBeVisible();
    await expect(drawer.getByText("email")).toBeVisible();
    await expect(drawer.getByText("city")).toBeVisible();
    // Field values live in readonly inputs (id, name, email, city, created_at)
    const fields = drawer.locator("input, textarea");
    await expect(fields.nth(0)).toHaveValue("1");
    await expect(fields.nth(1)).toHaveValue("Customer 1");
    await expect(fields.nth(2)).toHaveValue("customer1@example.com");

    // Close via the × button
    await page.getByRole("button", { name: "Close record drawer" }).click();
    await expect(drawer).toBeHidden();
  });

  test("opens a record drawer for a table with a TEXT primary key", async ({ page }) => {
    // Regression: tables whose first column is a TEXT PK (e.g. slug names) —
    // the row's first cell is NOT the rowid and must never be used in
    // `WHERE rowid = ...`.
    const textPkDb = "/tmp/text-pk.db";
    execSync("bun scripts/make-text-pk-db.js", { cwd: process.cwd(), stdio: "ignore" });

    await page.setInputFiles('input[type="file"]', textPkDb);
    const sidebar = page.locator("aside, .w-60").first();
    await expect(sidebar.getByText("sessions")).toBeVisible({ timeout: 15_000 });

    await sidebar.getByText("sessions").click();
    await expect(page.getByText("bubbly-elephant").first()).toBeVisible();

    await page.getByText("bubbly-elephant").first().dblclick();

    // Drawer must show the actual record (id=bubbly-elephant), not an error
    const drawer = page.getByRole("dialog", { name: "Record from sessions" });
    await expect(drawer).toBeVisible();
    // Field order: id (TEXT PK), model, tokens
    const fields = drawer.locator("input, textarea");
    await expect(fields.nth(0)).toHaveValue("bubbly-elephant");
    await expect(fields.nth(1)).toHaveValue("gpt-x");
    await expect(fields.nth(2)).toHaveValue("1234");
    await expect(drawer.getByText("Record not found")).toBeHidden();
  });

  test("formats SQL and offers schema-aware autocomplete in the editor", async ({ page }) => {
    await page.getByTestId("load-demo").click();
    const sidebar = page.locator("aside, .w-60").first();
    await expect(sidebar.getByText("customers")).toBeVisible({ timeout: 15_000 });

    await sidebar.getByText("customers").click();
    await expect(page.getByText("Customer 1", { exact: true }).first()).toBeVisible();

    const editor = page.getByTestId("sql-editor");
    await editor.click();
    const suggest = page.locator(".suggest-widget");
    const rows = suggest.locator(".monaco-list-row");

    // Typing an identifier offers table names from the schema catalog
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.insertText("SELECT * FROM cust");
    await page.keyboard.press("ControlOrMeta+Space");
    await expect(suggest).toBeVisible();
    await expect(rows.filter({ hasText: "customers" }).first()).toBeVisible();

    // Accept the table completion, then a dot offers that table's columns
    await page.keyboard.press("Enter");
    await page.keyboard.insertText(".");
    await page.keyboard.press("ControlOrMeta+Space");
    await expect(suggest).toBeVisible();
    await expect(rows.filter({ hasText: "email" }).first()).toBeVisible();
    await page.keyboard.press("Escape");

    // Format rewrites messy SQL (sql-formatter, sqlite dialect)
    await editor.click();
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.insertText("select city,count(*) as n from customers group by city order by n desc");
    await page.getByRole("button", { name: "Format" }).click();
    await expect(editor.getByText("GROUP BY")).toBeVisible();
    await expect(editor.getByText("COUNT(*) AS n")).toBeVisible();
  });

  test("opens a WAL-journal-mode database file", async ({ page }) => {
    // WAL databases need -wal/-shm side files, which a single dropped/picked
    // file cannot provide. The explorer must present them as legacy snapshots.
    const walDb = ensureWalDb();
    await page.setInputFiles('input[type="file"]', walDb);

    const sidebar = page.locator("aside, .w-60").first();
    await expect(sidebar.getByText("customers")).toBeVisible({ timeout: 15_000 });

    await sidebar.getByText("customers").click();
    await expect(page.getByText("WAL Customer 1", { exact: true }).first()).toBeVisible();
  });
});

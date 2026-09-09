import { test, expect, type Page } from "@playwright/test";

async function loadDemo(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "SQLite Explorer" })).toBeVisible();
  await page.getByTestId("load-demo").click();
  const sidebar = page.locator("aside, .w-60").first();
  await sidebar.getByText("customers").waitFor({ timeout: 15_000 });
}

/** Call a registered tool through the polyfill's testing shim. */
function callTool(page: Page, name: string, inputJson: string): Promise<unknown> {
  return page.evaluate(
    async ({ name, inputJson }) => {
      const testing = (
        navigator as Navigator & {
          modelContextTesting?: { executeTool: (n: string, json: string) => Promise<string | null> };
        }
      ).modelContextTesting;
      if (!testing) throw new Error("modelContextTesting shim unavailable");
      return testing.executeTool(name, inputJson);
    },
    { name, inputJson }
  );
}

test.describe("WebMCP tools", () => {
  test("registers the three tools and lists tables", async ({ page }) => {
    await loadDemo(page);

    const tools = await page.evaluate(() => {
      const testing = (
        navigator as Navigator & {
          modelContextTesting?: { listTools: () => { name: string }[] };
        }
      ).modelContextTesting;
      return testing ? testing.listTools().map((t) => t.name).sort() : [];
    });
    expect(tools).toEqual(["list_tables", "select_table", "view_table"]);

    const result = await callTool(page, "list_tables", "{}");
    expect(String(result)).toContain("customers");
    expect(String(result)).toContain("orders");
    expect(String(result)).toContain("products");
    expect(String(result)).toContain("|");
  });

  test("list_tables search filters the sidebar", async ({ page }) => {
    await loadDemo(page);
    const result = await callTool(page, "list_tables", '{"search":"cust"}');
    expect(String(result)).toContain("customers");
    expect(String(result)).not.toContain("orders");

    // UI reflection: sidebar shows only the matching table, with a count hint
    const sidebar = page.locator("aside, .w-60").first();
    await expect(sidebar.getByText("orders")).toBeHidden();
    await expect(sidebar.getByText(/of 4/)).toBeVisible();
  });

  test("view_table returns columns, indexes, related tables and opens Structure tab", async ({ page }) => {
    await loadDemo(page);
    const result = await callTool(page, "view_table", '{"table":"orders"}');
    const text = String(result);
    expect(text).toContain("customer_id");
    expect(text).toContain("idx_orders_customer");
    expect(text).toContain("customers");
    expect(text).toContain("products");

    // UI reflection: the orders Structure tab opened
    await expect(page.getByText("orders — Structure")).toBeVisible();
    await expect(page.getByText("Columns (")).toBeVisible();
  });

  test("view_table surfaces the raw SQLite error for unknown tables", async ({ page }) => {
    await loadDemo(page);
    const result = await callTool(page, "view_table", '{"table":"nope"}');
    expect(String(result)).toMatch(/no such table/i);
  });

  test("select_table pages, totals, and reflects the query in a tab", async ({ page }) => {
    await loadDemo(page);
    const result = await callTool(page, "select_table", '{"sql":"SELECT id, name FROM customers"}');
    const text = String(result);
    expect(text).toContain("Customer 1");
    expect(text).toContain("Total records: 50");
    expect(text).toContain("Total pages: 1");
    expect(text).toContain("Current page: 1");

    // UI reflection: a tab opened with the same SQL (Monaco splits text into
    // token spans, so assert on the editor's view-lines content)
    await expect(page.getByText("SQL 1")).toBeVisible();
    // Monaco's lazy chunk can exceed the default 5s timeout under parallel workers.
    await expect(page.locator(".monaco-editor .view-lines")).toContainText("SELECT id, name FROM customers", {
      timeout: 15_000,
    });

    // Page 2 of the ordered set shows page-two rows
    const paged = await callTool(page, "select_table", '{"sql":"SELECT id FROM customers ORDER BY id","page":2}');
    expect(String(paged)).toContain("Current page: 2");
    expect(String(paged)).not.toContain("Customer 1\n");
  });

  test("select_table returns the raw SQL error for bad queries", async ({ page }) => {
    await loadDemo(page);
    const result = await callTool(page, "select_table", '{"sql":"SELECT * FROM missing_table"}');
    expect(String(result)).toMatch(/no such table/i);
  });
});

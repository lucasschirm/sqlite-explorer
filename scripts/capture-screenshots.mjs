// Captures real screenshots of the app for the Docs page. Everything shown
// comes from actual interaction with the demo database — nothing is mocked.
//
// Usage: bun run build && (bun run preview &) ; node scripts/capture-screenshots.mjs
// Output: public/screenshots/*.png (committed; referenced by the Docs page)
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const base = process.env.BASE_URL ?? "http://localhost:4173";
const outDir = "public/screenshots";
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

async function shot(name) {
  await page.waitForTimeout(400); // settle animations/toasts
  await page.screenshot({ path: `${outDir}/${name}.png` });
  console.log("captured", name);
}

const sidebar = page.locator("aside, .w-60").first();

// 1. Landing page (drop zone + demo button)
await page.goto(base);
await page.waitForSelector("[data-testid='load-demo']");
await shot("01-landing");

// 2. Load demo DB, open customers table
await page.getByTestId("load-demo").click();
await sidebar.getByText("customers").waitFor({ timeout: 15000 });
await page.getByText(/Loaded "demo\.db"/).waitFor({ timeout: 5000 }).catch(() => {});
await shot("02-database-open");

// 3. Data tab with default SELECT
await sidebar.getByText("customers").click();
await page.locator(".monaco-editor .view-lines").waitFor({ timeout: 15000 });
await page.getByText("Customer 1", { exact: true }).first().waitFor({ timeout: 10000 });
await shot("03-data-tab");

// 4. Custom SQL + run (aggregated result)
await page.getByTestId("sql-editor").click();
await page.keyboard.press("ControlOrMeta+a");
await page.keyboard.insertText("SELECT city, COUNT(*) AS customers_per_city FROM customers GROUP BY city ORDER BY customers_per_city DESC");
await page.getByRole("button", { name: "Run" }).click();
await page.getByText("Lisbon").first().waitFor({ timeout: 10000 });
await shot("04-custom-query");

// 5. Autocomplete suggest widget (tables)
await page.getByTestId("sql-editor").click();
await page.keyboard.press("ControlOrMeta+a");
await page.keyboard.insertText("SELECT * FROM cust");
await page.keyboard.press("ControlOrMeta+Space");
await page.locator(".suggest-widget").waitFor({ timeout: 5000 });
await page.waitForTimeout(300);
await shot("05-autocomplete");

// 6. Structure tab (columns + indexes grids)
const row = sidebar.getByText("orders");
await row.hover();
await row.locator("xpath=ancestor::div[1]").getByTitle("Structure").click();
await page.getByText("Columns (").waitFor({ timeout: 10000 });
await page.getByText("idx_orders_customer").waitFor({ timeout: 5000 });
await shot("06-structure");

// 7. Record drawer (double-click a row)
// Switch back to the customers data tab (step 6 left the structure tab active)
// and reset its query to the full table (step 4/5 left partial SQL there).
await page.locator("[data-tab-id]", { hasText: "customers" }).click();
await page.getByTestId("sql-editor").waitFor({ timeout: 10000 });
await page.getByTestId("sql-editor").click();
await page.keyboard.press("ControlOrMeta+a");
await page.keyboard.insertText("SELECT * FROM customers ORDER BY id LIMIT 100");
await page.getByRole("button", { name: "Run" }).click();
await page.getByText("Customer 1", { exact: true }).first().waitFor({ timeout: 10000 });
await page.getByText("Customer 3", { exact: true }).first().dblclick();
const drawer = page.getByRole("dialog", { name: "Record from customers" });
await drawer.waitFor({ timeout: 10000 });
await shot("07-record-drawer");

// 8. Full workspace with multiple tabs open
await page.getByRole("button", { name: "Close record drawer" }).click();
const products = sidebar.getByText("products");
await products.hover();
await products.locator("xpath=ancestor::div[1]").getByTitle("Structure").click();
await page.getByText("products — Structure").waitFor({ timeout: 10000 });
await shot("08-tabs");

await browser.close();
console.log("Done:", outDir);

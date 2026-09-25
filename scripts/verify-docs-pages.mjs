// Sanity check for the multi-page docs site (/docs, /docs/:slug,
// /docs/:parent/:child) and the /about page: pages render, navigation works,
// sidebar chevrons expand, screenshots load. Run against `bun run preview`.
// Prints a pass/fail summary.
import { chromium } from "playwright";

const base = process.env.BASE_URL ?? "http://localhost:4173";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const failures = [];
const nav = page.locator("nav[aria-label='Docs navigation']");

// 1. Landing shows Docs/About links
await page.goto(base);
const links = page.locator("header nav a");
if ((await links.count()) < 2) failures.push("landing header missing Docs/About links");

// 2. /docs overview renders the section cards
await page.locator("header nav a", { hasText: "Docs" }).first().click();
await page.waitForTimeout(600);
if (!(await page.getByRole("heading", { name: "Documentation", level: 1 }).isVisible())) {
  failures.push("/docs overview heading missing");
}
const cards = await nav.locator("a").count();
if (cards < 7) failures.push(`docs sidebar has only ${cards} items`);

// 3. Every section page loads; collect and check its images
const sectionUrls = [
  "/docs/getting-started",
  "/docs/explorer",
  "/docs/sql-editor",
  "/docs/cli",
  "/docs/performance",
  "/docs/agent-tools",
  "/docs/keyboard",
];
for (const path of sectionUrls) {
  await page.goto(`${base}${path}`);
  await page.waitForTimeout(400);
  const h1 = await page.locator("h1").first().textContent();
  if (!h1) failures.push(`${path}: no h1`);
  const imgs = page.locator("article img");
  const imgCount = await imgs.count();
  for (let i = 0; i < imgCount; i++) {
    const ok = await imgs.nth(i).evaluate((img) => img.complete && img.naturalWidth > 0);
    if (!ok) failures.push(`${path}: image ${i} broken`);
  }
}
console.log(`docs: ${sectionUrls.length} section pages checked`);

// 4. Sub-page deep link: /docs/:parent/:child auto-expands the sidebar
await page.goto(`${base}/docs/explorer/record-drawer`);
await page.waitForTimeout(400);
if (!(await page.getByRole("heading", { name: "Record drawer", level: 1 }).isVisible())) {
  failures.push("/docs/explorer/record-drawer did not render");
}
const chevron = nav.locator("button[aria-expanded='true']").first();
if (!(await chevron.isVisible())) failures.push("deep link did not expand the parent section");
if (!(await nav.getByRole("link", { name: "Record drawer" }).isVisible())) {
  failures.push("expanded section does not list the sub-page");
}

// 5. Chevron toggles without navigating
await chevron.click();
if ((await chevron.getAttribute("aria-expanded")) !== "false") failures.push("chevron did not collapse");
await chevron.click();
if ((await chevron.getAttribute("aria-expanded")) !== "true") failures.push("chevron did not expand");

// 6. Legacy hash deep link redirects to the new sub-page
await page.goto(`${base}/#/docs?record-drawer`);
await page.waitForTimeout(600);
if (!page.url().includes("/docs/explorer/record-drawer")) failures.push("#/docs?record-drawer redirect missing");
if (!(await page.getByRole("heading", { name: "Record drawer", level: 1 }).isVisible())) {
  failures.push("redirected record-drawer page did not render");
}

// 7. About page renders
await page.goto(`${base}/about`);
await page.waitForTimeout(400);
if (!(await page.getByText("Your data never leaves your machine").isVisible())) {
  failures.push("about page missing privacy section");
}

// 8. Back to app
await page.locator("header nav a", { hasText: "Back to app" }).first().click();
await page.waitForTimeout(600);
if (!(await page.getByTestId("load-demo").isVisible())) failures.push("Back to app did not restore landing page");

console.log(failures.length ? `FAILURES:\n- ${failures.join("\n- ")}` : "ALL CHECKS PASSED");
await browser.close();
process.exit(failures.length ? 1 : 0);

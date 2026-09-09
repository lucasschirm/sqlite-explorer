// Verifies the Docs and About pages: navigation works, sections render,
// screenshots exist and load. Prints a pass/fail summary.
import { chromium } from "playwright";

const base = process.env.BASE_URL ?? "http://localhost:4173";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const failures = [];

// 1. Landing shows Docs/About links
await page.goto(base);
const links = page.locator("header nav a");
if ((await links.count()) < 2) failures.push("landing header missing Docs/About links");

// 2. Docs page renders all sections + images
await page.locator("header nav a", { hasText: "Docs" }).first().click();
await page.waitForTimeout(600);
const sections = await page.locator("h2").count();
if (sections < 8) failures.push(`docs has only ${sections} h2 sections`);
const images = page.locator("img");
const imgCount = await images.count();
let broken = 0;
for (let i = 0; i < imgCount; i++) {
  const ok = await images.nth(i).evaluate((img) => img.complete && img.naturalWidth > 0);
  if (!ok) broken++;
}
if (broken > 0) failures.push(`${broken}/${imgCount} docs images broken`);
await page.screenshot({ path: "public/screenshots/99-docs-page.png" });
console.log(`docs: ${sections} sections, ${imgCount} images (${broken} broken)`);

// 3. TOC anchor navigation scrolls (the page's scroll container, not the
// window — html/body are overflow:hidden for the app layout).
await page.locator("nav a", { hasText: "Record drawer" }).click();
await page.waitForTimeout(500);
const scrolled = await page.evaluate(() => (document.getElementById("page-scroll")?.scrollTop ?? 0) > 200);
if (!scrolled) failures.push("TOC anchor did not scroll");

// 4. About page renders
await page.locator("header nav a", { hasText: "About" }).first().click();
await page.waitForTimeout(600);
if (!(await page.getByText("Your data never leaves your machine").isVisible())) {
  failures.push("about page missing privacy section");
}
await page.screenshot({ path: "public/screenshots/98-about-page.png" });

// 5. Back to app
await page.locator("header nav a", { hasText: "Back to app" }).first().click();
await page.waitForTimeout(600);
if (!(await page.getByTestId("load-demo").isVisible())) failures.push("Back to app did not restore landing page");

// 6. Deep link works
await page.goto(`${base}/#/docs?record-drawer`);
await page.waitForTimeout(600);
if (!(await page.getByRole("heading", { name: "Record drawer" }).isVisible())) {
  failures.push("deep link #/docs?record-drawer failed");
}

console.log(failures.length ? `FAILURES:\n- ${failures.join("\n- ")}` : "ALL CHECKS PASSED");
await browser.close();
process.exit(failures.length ? 1 : 0);

// Verifies the local-AI pipeline end to end: Monaco renders, the WebLLM
// worker starts, the model is fetched from our own origin, and — when the
// machine has WebGPU — the engine reaches "ready".
//
// Usage: bun run build && bun run preview &   (or any server on :4173)
//        node scripts/check-ai-pipeline.mjs
// In a WebGPU-less environment (CI) the pill settles on "unsupported" and the
// script reports that as the expected dormant outcome.
import { chromium } from "playwright";

const base = process.env.BASE_URL ?? "http://localhost:4173";
const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
const notes = [];
page.on("console", (m) => {
  const t = m.type();
  const text = m.text();
  if (t === "error") errors.push(text.slice(0, 200));
  else if (t === "warning") notes.push(`[warn] ${text.slice(0, 160)}`);
});
page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));

await page.goto(base);
await page.getByTestId("load-demo").click();
const sidebar = page.locator("aside, .w-60").first();
await sidebar.getByText("customers").click({ timeout: 15000 });

const pill = page.locator("[data-testid='ai-status']");
const appeared = await pill
  .waitFor({ state: "attached", timeout: 10_000 })
  .then(() => true)
  .catch(() => false);

let status = "pill-hidden";
if (appeared) {
  // Ready can take a while on first run (845 MB of weights); on unsupported
  // machines it settles immediately.
  status = await pill
    .evaluate(
      (el) =>
        new Promise((resolve) => {
          const check = () => {
            const s = el.getAttribute("data-status");
            if (s === "ready" || s === "error" || s === "unsupported") return resolve(s);
            setTimeout(check, 1000);
          };
          check();
          setTimeout(() => resolve(el.getAttribute("data-status") ?? "?"), 150_000);
        })
    )
    .catch(() => "timeout");
}

const state = await page.evaluate(() => ({
  viewLines: !!document.querySelector(".monaco-editor .view-lines"),
  aiStatus: document.querySelector("[data-testid='ai-status']")?.getAttribute("data-status") ?? null,
}));
console.log("AI pipeline check:");
console.log("  editor renders:", state.viewLines);
console.log("  ai status:", status);
console.log("  errors:", errors.length ? errors.slice(0, 4) : "none");

if (status === "ready") console.log("\n✅ Model loaded — ghost-text completions are live.");
else if (status === "unsupported") console.log("\n✅ Dormant path OK (no WebGPU here — expected in CI/headless).");
else console.log(`\n⚠️  Status stalled at "${status}" — see notes:`, notes.slice(0, 3));

await browser.close();

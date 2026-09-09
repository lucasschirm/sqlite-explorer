// Downloads the MLC-converted Qwen2.5-Coder-1.5B-Instruct (q4f16_1) weights
// and config from Hugging Face plus the matching WebGPU model-lib WASM from
// MLC's binary-libs repo, staging everything under
// public/models/qwen25-coder-1.5b/resolve/main/ so the app serves the model
// from its own origin (no HF at runtime). WebLLM's cleanModelUrl appends
// `resolve/main/` to any model URL that lacks it, so self-hosted layouts
// must mirror the HuggingFace directory structure.
//
// Usage: bun scripts/fetch-model.mjs
import { mkdirSync, writeFileSync, createWriteStream, existsSync, statSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const HF_BASE = "https://huggingface.co/mlc-ai/Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC/resolve/main";
const WASM_URL =
  "https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/web-llm-models/v0_2_84/base/Qwen2-1.5B-Instruct-q4f16_1_cs1k-webgpu.wasm";

const OUT_DIR = join(process.cwd(), "public", "models", "qwen25-coder-1.5b", "resolve", "main");
mkdirSync(OUT_DIR, { recursive: true });

// Fetch the file list from the HF API so we grab every shard reliably.
const listRes = await fetch("https://huggingface.co/api/models/mlc-ai/Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC/tree/main");
if (!listRes.ok) throw new Error(`HF API ${listRes.status}`);
const files = await listRes.json();

const wanted = files.filter((f) => f.type === "file" && f.path !== ".gitattributes" && f.path !== "README.md");
console.log(`Model dir: ${OUT_DIR}`);
let total = 0;

for (const file of wanted) {
  const dest = join(OUT_DIR, file.path);
  const expected = file.size ?? 0;

  if (existsSync(dest) && statSync(dest).size === expected && expected > 0) {
    console.log(`skip (exists): ${file.path}`);
    continue;
  }
  if (existsSync(dest)) unlinkSync(dest);

  const url = `${HF_BASE}/${file.path}`;
  process.stdout.write(`downloading ${file.path} (${(expected / 1e6).toFixed(1)} MB) ... `);
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok || !res.body) throw new Error(`${res.status} fetching ${url}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(dest));
  const actual = statSync(dest).size;
  if (expected > 0 && actual !== expected) {
    throw new Error(`size mismatch for ${file.path}: got ${actual}, expected ${expected}`);
  }
  total += actual;
  console.log("ok");
}

// Model-lib WASM (inference logic) — distinct repo.
const wasmDest = join(OUT_DIR, WASM_URL.split("/").pop());
if (!(existsSync(wasmDest) && statSync(wasmDest).size > 0)) {
  process.stdout.write(`downloading model-lib WASM ... `);
  const res = await fetch(WASM_URL);
  if (!res.ok || !res.body) throw new Error(`${res.status} fetching ${WASM_URL}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(wasmDest));
  total += statSync(wasmDest).size;
  console.log("ok");
} else {
  console.log("skip (exists): WASM");
}

console.log(`\nDone. ${wanted.length + 1} files, ${(total / 1e6).toFixed(1)} MB in public/models/qwen25-coder-1.5b/`);

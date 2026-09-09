// WebLLM inference worker. Owns the MLCEngine so model download, GPU init
// and generation never touch the UI thread. The engine is created lazily on
// the first "init" message and reuses the browser cache across reloads.
//
// The model is served from this app's own origin (public/models/...) —
// never HuggingFace — via a custom AppConfig model record.
import * as webllm from "@mlc-ai/web-llm";

// Must match scripts/fetch-model.mjs.
const MODEL_ID = "Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC-local";
// WebLLM's cleanModelUrl() appends `resolve/main/` unless the URL already has
// it (HuggingFace layout) — self-hosted model dirs must mirror that structure.
const MODEL_DIR = "models/qwen25-coder-1.5b/resolve/main";
const MODEL_LIB = "Qwen2-1.5B-Instruct-q4f16_1_cs1k-webgpu.wasm";

const appConfig: webllm.AppConfig = {
  model_list: [
    {
      model: MODEL_DIR, // resolved against the app origin at init
      model_id: MODEL_ID,
      model_lib: `${MODEL_DIR}/${MODEL_LIB}`,
      vram_required_MB: 1630,
      low_resource_required: false,
      overrides: { context_window_size: 4096 },
    },
  ],
};

// WebLLM builds `new URL(modelUrl, baseUrl)` internally, which throws for
// relative bases ("/" or "/repo/"). Resolve whatever the app passed against
// the worker's own location — always same-origin with the app, and correct
// for GitHub Pages subpath deploys where the app base is "/<repo>/".
function withBase(path: string, baseUrl: string): string {
  const base = new URL(baseUrl, self.location.href).href;
  return new URL(path.replace(/^\//, ""), base).href;
}

let engine: webllm.MLCEngine | null = null;
let initPromise: Promise<void> | null = null;

async function ensureEngine(baseUrl: string): Promise<webllm.MLCEngine> {
  if (engine) return engine;
  const cfg: webllm.AppConfig = {
    model_list: [
      {
        ...appConfig.model_list[0],
        model: withBase(MODEL_DIR, baseUrl),
        model_lib: withBase(`${MODEL_DIR}/${MODEL_LIB}`, baseUrl),
      },
    ],
  };
  engine = new webllm.MLCEngine({ appConfig: cfg });
  engine.setInitProgressCallback((report: webllm.InitProgressReport) => {
    self.postMessage({ type: "progress", text: report.text, progress: report.progress });
  });
  await engine.reload(MODEL_ID);
  return engine;
}

async function init(baseUrl: string): Promise<void> {
  if (initPromise) return initPromise;
  initPromise = ensureEngine(baseUrl)
    .then(() => {
      self.postMessage({ type: "ready" });
    })
    .catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      // No compatible GPU adapter = this device can never run the model;
      // surface it as a permanent "unsupported" rather than a transient error.
      if (/compatible gpu|webgpu/i.test(message)) {
        console.warn("aiWorker: WebGPU unavailable:", message);
        self.postMessage({ type: "unsupported", message });
      } else {
        console.error("aiWorker: engine init failed:", err);
        self.postMessage({ type: "error", message });
      }
      engine = null;
      initPromise = null;
    });
  return initPromise;
}

self.onmessage = async (e: MessageEvent) => {
  const msg = e.data as { type: string; baseUrl?: string; requestId?: number; prompt?: string; maxTokens?: number; stop?: string[]; temperature?: number };
  try {
    if (msg.type === "init") {
      await init(msg.baseUrl ?? "/");
      return;
    }
    if (msg.type === "generate") {
      const eng = await ensureEngine(msg.baseUrl ?? "/");
      const out = await eng.completions.create({
        prompt: msg.prompt ?? "",
        max_tokens: msg.maxTokens ?? 48,
        temperature: msg.temperature ?? 0.1,
        stop: msg.stop ?? ["\n"],
        stream: false,
      });
      const text = out.choices[0]?.text ?? "";
      self.postMessage({ type: "generate:ok", requestId: msg.requestId, text });
      return;
    }
    if (msg.type === "interrupt") {
      engine?.interruptGenerate();
      return;
    }
    if (msg.type === "unload") {
      await engine?.unload();
      engine = null;
      initPromise = null;
      self.postMessage({ type: "unloaded" });
      return;
    }
  } catch (err) {
    console.error("aiWorker: message handling failed:", err);
    self.postMessage({
      type: "generate:error",
      requestId: msg.requestId,
      message: err instanceof Error ? err.message : String(err),
    });
  }
};

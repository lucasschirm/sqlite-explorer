// Main-thread client for the WebLLM AI worker. Fire-and-forget preload at
// app boot; never blocks or breaks the app — every failure surfaces as
// status state + console.error only. Ghost-text completion consumes it via
// a promise-based API with in-flight interruption.
import type { AiStatus } from "./aiTypes";

// Must match src/worker/aiWorker.ts and scripts/fetch-model.mjs.
export const AI_MODEL_ID = "Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC-local";

type Listener = (status: AiStatus, progressText: string) => void;

class AiClient {
  private worker: Worker | null = null;
  private status: AiStatus = "idle";
  private progressText = "";
  private listeners = new Set<Listener>();
  private initStarted = false;
  private pending = new Map<number, { resolve: (text: string) => void; reject: (err: Error) => void }>();
  private seq = 0;

  getStatus(): AiStatus {
    return this.status;
  }

  getProgressText(): string {
    return this.progressText;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.status, this.progressText);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private setStatus(status: AiStatus, progressText = this.progressText): void {
    this.status = status;
    this.progressText = progressText;
    for (const l of this.listeners) l(status, progressText);
  }

  /** WebGPU availability decides whether AI features can ever work. */
  static isSupported(): boolean {
    return typeof navigator !== "undefined" && "gpu" in navigator;
  }

  /**
   * Fire-and-forget engine start. Safe to call repeatedly and at boot;
   * downloads are cached by the browser, so repeat visits init quickly.
   */
  preload(baseUrl: string): void {
    if (!AiClient.isSupported()) {
      this.setStatus("unsupported", "WebGPU unavailable in this browser");
      return;
    }
    if (this.initStarted) return;
    this.initStarted = true;
    this.setStatus("loading", "starting");
    try {
      this.ensureWorker().postMessage({ type: "init", baseUrl });
    } catch (err) {
      console.error("aiClient: preload failed:", err);
      this.setStatus("error", err instanceof Error ? err.message : String(err));
      this.initStarted = false;
    }
  }

  private ensureWorker(): Worker {
    if (this.worker) return this.worker;
    this.worker = new Worker(new URL("../worker/aiWorker.ts", import.meta.url), {
      type: "module",
      name: "webllm-ai-worker",
    });
    this.worker.onmessage = (e: MessageEvent) => {
      const msg = e.data as
        | { type: "progress"; text: string; progress?: number }
        | { type: "ready" }
        | { type: "error"; message: string }
        | { type: "unsupported"; message: string }
        | { type: "generate:ok"; requestId: number; text: string }
        | { type: "generate:error"; requestId: number; message: string };
      if (msg.type === "progress") {
        this.setStatus("loading", msg.text);
        return;
      }
      if (msg.type === "ready") {
        this.setStatus("ready", "");
        return;
      }
      if (msg.type === "unsupported") {
        console.warn("aiClient: WebGPU unsupported:", msg.message);
        this.setStatus("unsupported", msg.message);
        this.initStarted = false;
        return;
      }
      if (msg.type === "error") {
        console.error("aiClient: worker init error:", msg.message);
        this.setStatus("error", msg.message);
        this.initStarted = false;
        return;
      }
      if (msg.type === "generate:ok") {
        const p = this.pending.get(msg.requestId);
        this.pending.delete(msg.requestId);
        p?.resolve(msg.text);
        return;
      }
      if (msg.type === "generate:error") {
        const p = this.pending.get(msg.requestId);
        this.pending.delete(msg.requestId);
        p?.reject(new Error(msg.message));
      }
    };
    this.worker.onerror = (e) => {
      console.error("aiClient: worker crashed:", e.message ?? e);
      this.failPending(new Error("AI worker crashed"));
      this.worker = null;
      this.initStarted = false;
      if (this.status === "loading") this.setStatus("error", "AI worker crashed");
    };
    return this.worker;
  }

  private failPending(error: Error): void {
    for (const p of this.pending.values()) p.reject(error);
    this.pending.clear();
  }

  /** True once the engine finished loading and can answer completions. */
  isReady(): boolean {
    return this.status === "ready";
  }

  /**
   * Generate a completion for `prompt`. Resolves "" while not ready, on
   * interruption, or on any failure — ghost text treats all as "no suggestion".
   */
  async generate(prompt: string, opts: { maxTokens?: number; stop?: string[]; signal?: AbortSignal } = {}): Promise<string> {
    if (!this.isReady()) return "";
    const worker = this.ensureWorker();
    const id = ++this.seq;
    const promise = new Promise<string>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
    worker.postMessage({
      type: "generate",
      requestId: id,
      prompt,
      maxTokens: opts.maxTokens ?? 48,
      stop: opts.stop ?? ["\n"],
    });
    // Wire the abort signal to engine interruption + promise rejection.
    const onAbort = () => {
      worker.postMessage({ type: "interrupt" });
      const p = this.pending.get(id);
      this.pending.delete(id);
      p?.resolve("");
    };
    opts.signal?.addEventListener("abort", onAbort, { once: true });
    try {
      return await promise;
    } catch (err) {
      console.error("aiClient: generation failed:", err);
      return "";
    } finally {
      opts.signal?.removeEventListener("abort", onAbort);
    }
  }
}

export const aiClient = new AiClient();

// Tiny header pill showing local-AI status. Purely informational: the app
// never waits on it, and it disappears entirely when WebGPU is unsupported.
import { useAiStatus } from "../hooks/useAiStatus";

const LABEL: Record<string, string> = {
  idle: "AI off",
  loading: "AI loading",
  ready: "AI ready",
  error: "AI off",
  unsupported: "",
};

export function AiStatusPill() {
  const { status, progressText } = useAiStatus();
  const label = LABEL[status] ?? "";
  if (!label) return null;

  const title =
    status === "loading"
      ? `Loading local SQL model… ${progressText}`
      : status === "ready"
        ? "Local SQL suggestions active (Qwen2.5-Coder via WebGPU)"
        : "Local AI unavailable — the app works fully without it";

  return (
    <span
      title={title}
      data-testid="ai-status"
      data-status={status}
      className={`
        text-[10px] px-2 py-0.5 rounded-full border transition-colors
        ${
          status === "ready"
            ? "border-emerald-500/40 text-emerald-300 bg-emerald-500/10"
            : status === "loading"
              ? "border-blue-400/40 text-blue-300 bg-blue-500/10 animate-pulse"
              : "border-gray-600 text-gray-500 bg-gray-800"
        }
      `}
    >
      {label}
      {status === "loading" && progressText ? ` · ${Math.round(parseFloat(progressText) * 100) || ""}` : ""}
    </span>
  );
}

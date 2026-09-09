// Subscribes components to the AI client's status via useSyncExternalStore.
import { useSyncExternalStore } from "react";
import { aiClient } from "../lib/aiClient";
import type { AiStatus } from "../lib/aiTypes";

export function useAiStatus(): { status: AiStatus; progressText: string } {
  const snapshot = useSyncExternalStore(
    (onChange) => aiClient.subscribe(() => onChange()),
    () => `${aiClient.getStatus()}\u0000${aiClient.getProgressText()}`,
    () => "idle\u0000"
  );
  const [status, progressText] = snapshot.split("\u0000");
  return { status: status as AiStatus, progressText };
}

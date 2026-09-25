// AI-powered view name suggestion for the save-view flow. Asks the local
// WebLLM model (Qwen2.5-Coder) for a short human-readable name derived from
// the SQL. Every failure resolves to a graceful fallback so saving never
// depends on the model.

import { aiClient } from "./aiClient";

/** Extract the first returned name and sanity-check it for use as a label. */
function sanitize(raw: string, fallback: string): string {
  const name = raw
    .split("\n")[0]
    .replace(/^["'`\s]+|["'`\s.]+$/g, "")
    .trim();
  // Cap length and strip anything that looks like code or prose.
  if (!name || name.length > 48 || /[{};]|<\/?(s>|code)/i.test(name)) return fallback;
  return name;
}

/** First meaningful line of the SQL, used as both prompt context and fallback. */
function sqlNameFallback(sql: string): string {
  const line = sql
    .split("\n")
    .map((l) => l.replace(/--.*$/, "").trim())
    .find((l) => l.length > 0);
  if (!line) return "View";
  return line.slice(0, 40);
}

/**
 * Suggest a view name for `sql`. Returns immediately with the fallback when
 * the AI is not ready (offline model, WebGPU unavailable, still loading).
 */
export async function suggestViewName(sql: string): Promise<string> {
  const fallback = sqlNameFallback(sql);
  if (!sql.trim() || !aiClient.isReady()) return fallback;
  const prompt =
    `Suggest a very short name (2-4 words, Title Case, no quotes) for this SQL view. ` +
    `Answer with the name only.\n\n${sql.slice(0, 600)}\n\nName:`;
  try {
    const text = await aiClient.generate(prompt, { maxTokens: 16, stop: ["\n", "."] });
    return sanitize(text, fallback);
  } catch {
    return fallback;
  }
}

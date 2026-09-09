// Copilot-style ghost text for the Monaco SQL editor, powered by the
// origin-hosted Qwen2.5-Coder model via WebLLM (see src/worker/aiWorker.ts).
//
// Design constraints:
// - Never blocks or breaks the editor: while the model loads (or if it
//   errored/unsupported), the provider returns { items: [] } immediately.
// - One in-flight request: new keystrokes abort the previous generation
//   (Monaco context token + AbortController + engine.interruptGenerate).
// - Prompt carries the schema catalog (tables/columns/types) so suggestions
//   reference real database objects.
import type { monaco } from "./monacoSetup";
import { aiClient } from "./aiClient";
import { getSchemaCatalog } from "./sqlCompletions";

const DEBOUNCE_MS = 350;
const MAX_SCHEMA_CHARS = 6000;
const MAX_PROMPT_CHARS = 4000;

/** Render the catalog as a compact schema block for the prompt. */
export function buildSchemaPrompt(): string {
  const catalog = getSchemaCatalog();
  if (!catalog || catalog.tables.length === 0) return "";
  const lines: string[] = [];
  for (const table of catalog.tables) {
    const cols = catalog.columns.get(table) ?? [];
    lines.push(`${table}(${cols.map((c) => `${c.name} ${c.type}`.trim()).join(", ")})`);
    if (lines.join("\n").length > MAX_SCHEMA_CHARS) break;
  }
  return lines.join("\n");
}

function buildPrompt(textBeforeCursor: string, schemaBlock: string): string {
  const trimmed =
    textBeforeCursor.length > MAX_PROMPT_CHARS
      ? textBeforeCursor.slice(-MAX_PROMPT_CHARS)
      : textBeforeCursor;
  // SQLCoder-style wrapper: task, schema context, then the partial query.
  const schema = schemaBlock ? `### Database Schema\n${schemaBlock}\n\n` : "";
  return `${schema}### Task\nContinue the SQL query. Output only SQL.\n\n### Answer\n${trimmed}`;
}

let registered = false;

/** Register the AI inline-completions provider (idempotent). */
export function registerAiInlineCompletions(monacoInstance: typeof monaco): void {
  if (registered) return;
  registered = true;

  monacoInstance.languages.registerInlineCompletionsProvider(
    "sql",
    {
      provideInlineCompletions: async (model, position, _context, token) => {
        // Dormant until the engine is ready — instant empty result otherwise.
        if (!aiClient.isReady()) return { items: [] };

        // Skip when the cursor sits mid-identifier (noisy mid-word ghosts).
        const line = model.getLineContent(position.lineNumber);
        const beforeCursor = line.slice(0, position.column - 1);
        if (/[\w"]$/.test(beforeCursor)) return { items: [] };

        const textBefore = model.getValueInRange({
          startLineNumber: 1,
          startColumn: 1,
          endLineNumber: position.lineNumber,
          endColumn: position.column,
        });
        // Nothing meaningful to continue.
        if (textBefore.trim().length < 4) return { items: [] };

        const controller = new AbortController();
        token.onCancellationRequested(() => controller.abort());

        // Debounce: wait briefly; a newer keystroke cancels this request.
        await new Promise((r) => setTimeout(r, DEBOUNCE_MS));
        if (token.isCancellationRequested) return { items: [] };

        const raw = await aiClient.generate(buildPrompt(textBefore, buildSchemaPrompt()), {
          maxTokens: 48,
          stop: ["\n", ";", "###"],
          signal: controller.signal,
        });

        const text = raw.trim();
        if (!text || token.isCancellationRequested) return { items: [] };

        return {
          items: [{ insertText: text, range: undefined }],
          enableForwardStability: true,
        };
      },
      handleItemDidShow: () => {
        /* no telemetry */
      },
      disposeInlineCompletions: () => {
        /* nothing cached */
      },
    }
  );
}

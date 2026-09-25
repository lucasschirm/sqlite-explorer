// Cross-window database handover over postMessage. Another site (host page,
// dashboard, wrapper app...) opens this explorer in a popup or iframe and
// hands over an in-memory database as a Blob — the same object a dropped file
// would produce, so the explorer opens it with zero extra copying (the blob
// is structured-cloned by reference and SQLite pages are read on demand).
//
// Sender side (see examples/sqlite-handover):
//   targetWindow.postMessage(
//     { type: "sqlite-explorer:handover", name, blob },
//     "https://explorer.example"   // exact origin of the explorer
//   );
//
// The receiver is deliberately strict:
//   - only exact-origin messages are accepted (never "*")
//   - only the documented message shape is accepted
//   - only data starting with the 16-byte SQLite file header is accepted

import { looksLikeSqlite } from "./readFile";

/** Message type sent by a host page to hand a database to the explorer. */
export const HANDOVER_MESSAGE_TYPE = "sqlite-explorer:handover";

/** Reply posted back to the sending window once the handover was accepted. */
export const HANDOVER_ACK_TYPE = "sqlite-explorer:handover:ack";

/** Reply posted back to the sending window when the handover was rejected. */
export const HANDOVER_NACK_TYPE = "sqlite-explorer:handover:nack";

interface HandoverPayload {
  type: typeof HANDOVER_MESSAGE_TYPE;
  /** File name shown in the explorer header (e.g. "report.sqlite"). */
  name: string;
  /** Raw SQLite database bytes. A File is a Blob, so files work too. */
  blob: Blob;
}

function isHandoverPayload(data: unknown): data is HandoverPayload {
  if (typeof data !== "object" || data === null) return false;
  const candidate = data as Record<string, unknown>;
  return (
    candidate.type === HANDOVER_MESSAGE_TYPE &&
    typeof candidate.name === "string" &&
    candidate.name.length > 0 &&
    candidate.name.length <= 256 &&
    candidate.blob instanceof Blob
  );
}

/**
 * Listen for database handovers from other windows.
 *
 * @param onHandover Called with the validated blob and its name. May return a
 *   promise; rejection is reported to the sender as a nack.
 * @param options.allowedOrigins Exact origins allowed to send handovers.
 *   Defaults to the explorer's own origin only. Pass e.g.
 *   ["https://partner-site.example"] to let that site hand over databases.
 * @returns A cleanup function that removes the listener.
 */
export function initHandoverReceiver(
  onHandover: (blob: Blob, name: string) => void | Promise<void>,
  options: { allowedOrigins?: string[] } = {}
): () => void {
  const allowedOrigins = options.allowedOrigins ?? [window.location.origin];

  const onMessage = (event: MessageEvent) => {
    // Exact-origin check: other origins (and "*" senders) are ignored.
    if (!allowedOrigins.includes(event.origin)) return;
    if (!isHandoverPayload(event.data)) return;

    const respond = (ok: boolean, reason?: string) => {
      // Reply to the window that sent the message, targeted at its origin.
      event.source?.postMessage(
        { type: ok ? HANDOVER_ACK_TYPE : HANDOVER_NACK_TYPE, name: event.data.name, reason },
        { targetOrigin: event.origin }
      );
    };

    // Peek the 16-byte SQLite header before accepting: cheap even for
    // multi-GB blobs, and keeps non-database data out of the explorer.
    void event.data.blob.slice(0, 16).arrayBuffer().then(
      (header) => {
        if (!looksLikeSqlite(header)) {
          respond(false, "Data does not start with the SQLite file header");
          return;
        }
        Promise.resolve(onHandover(event.data.blob, event.data.name)).then(
          () => respond(true),
          (err) => {
            console.error("handover: failed to open handed-over database:", err);
            respond(false, err instanceof Error ? err.message : String(err));
          }
        );
      },
      (err) => {
        console.error("handover: failed to read handed-over blob header:", err);
        respond(false, err instanceof Error ? err.message : String(err));
      }
    );
  };

  window.addEventListener("message", onMessage);
  return () => window.removeEventListener("message", onMessage);
}

/**
 * Origins allowed to hand over databases: the explorer's own origin plus any
 * origins listed in the `handoverOrigins` query parameter (comma-separated;
 * full URLs or bare origins both work). Lets a deployment opt partner sites
 * in without a rebuild, e.g.:
 *
 *   https://explorer.example/?handoverOrigins=https://partner.example
 *
 * file:// pages report the origin "null" and cannot be allowlisted — serve
 * senders over http(s) (see examples/sqlite-handover).
 */
export function allowedOriginsFromLocation(
  loc: { origin: string; search: string } = window.location
): string[] {
  const origins = new Set<string>([loc.origin]);
  const raw = new URLSearchParams(loc.search).get("handoverOrigins");
  if (raw) {
    for (const part of raw.split(",")) {
      const value = part.trim();
      if (!value) continue;
      try {
        origins.add(new URL(value).origin);
      } catch {
        console.warn(`handover: ignoring invalid origin "${value}"`);
      }
    }
  }
  return [...origins];
}

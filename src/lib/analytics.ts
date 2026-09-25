// Shared GA4 event dispatch. index.html loads the gtag.js snippet whose
// inline bootstrap defines window.gtag before any module code runs, so
// events queued here are replayed by gtag.js even while it is still
// downloading. local.html (the sqlitexp CLI viewer) ships no analytics
// snippet — calls there are a silent no-op.

/** GA4 event parameters (gtag.js accepts strings, numbers and booleans). */
export type AnalyticsParams = Record<string, string | number | boolean | undefined>;

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

/**
 * Dispatch one analytics event to GA4 through the shared gtag queue. Every
 * product event (create project, open table, execute SQL, …) goes through
 * this single function so event plumbing stays consistent app-wide.
 */
export function trackEvent(eventName: string, params: AnalyticsParams = {}): void {
  try {
    if (typeof window === "undefined") return;
    const gtag = window.gtag;
    if (typeof gtag !== "function") return; // no snippet (CLI viewer or blocked)
    gtag("event", eventName, params);
  } catch (err) {
    // Analytics must never break the app.
    console.error(`analytics: failed to dispatch "${eventName}":`, err);
  }
}

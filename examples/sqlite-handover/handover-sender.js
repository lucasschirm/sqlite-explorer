// Sender side of the SQLite Explorer database handover (Option 1 in the
// README): build a SQLite database in memory, then postMessage it to the
// explorer running in an iframe.
//
// The interesting part is sendHandover() — everything above it just builds
// the demo database and wires up the tiny UI in index.html. The demo database
// is generated with sql.js (a dev dependency of this repo, loaded from a CDN
// below); in a real host page the Blob could come from anywhere: sql.js, an
// in-memory WASM SQLite export, an IndexedDB-backed blob, or a fetch() of an
// in-memory report.

const SQLJS_VERSION = "1.14.2"; // keep in sync with the sql.js devDependency
const SQLJS_CDN = `https://cdn.jsdelivr.net/npm/sql.js@${SQLJS_VERSION}/dist`;

/** Load sql.js in the browser (UMD build → window.initSqlJs). */
function loadSqlJs() {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `${SQLJS_CDN}/sql-wasm.js`;
    script.onload = () => resolve(window.initSqlJs);
    script.onerror = () => reject(new Error(`Failed to load sql.js from ${script.src}`));
    document.head.appendChild(script);
  });
}

const HANDOVER_MESSAGE_TYPE = "sqlite-explorer:handover";
const HANDOVER_ACK_TYPE = "sqlite-explorer:handover:ack";
const HANDOVER_NACK_TYPE = "sqlite-explorer:handover:nack";

// ------------------------------------------------------------- demo DB ----

/** Build a small SQLite database fully in memory and return it as a Blob. */
async function buildDemoDatabaseBlob() {
  const initSqlJs = await loadSqlJs();
  const SQL = await initSqlJs({ locateFile: (file) => `${SQLJS_CDN}/${file}` });

  const db = new SQL.Database();
  db.run(`
    CREATE TABLE products (id INTEGER PRIMARY KEY, name TEXT NOT NULL, price REAL NOT NULL);
    INSERT INTO products VALUES (1, 'Keyboard', 49.9), (2, 'Mouse', 25.0), (3, 'Monitor', 189.0);
  `);

  // Export the whole database as one Uint8Array and wrap it in a Blob —
  // exactly what a dropped file would give the explorer.
  const bytes = db.export();
  db.close();
  return new Blob([bytes], { type: "application/octet-stream" });
}

// ------------------------------------------------------------- handover -----

/**
 * Open `explorerUrl` in an iframe and hand over `blob` via postMessage.
 *
 * Resolves once the explorer ACKs the handover (the database is open in its
 * UI), rejects with the explorer's reason on NACK or timeout.
 *
 * @param {string} explorerUrl Full URL of the running explorer.
 * @param {string} name        File name shown in the explorer header.
 * @param {Blob}   blob        Raw SQLite database bytes.
 */
async function sendHandover(explorerUrl, name, blob) {
  // postMessage requires an exact origin as targetOrigin — derive it once.
  const explorerOrigin = new URL(explorerUrl).origin;

  const iframe = document.createElement("iframe");
  iframe.src = explorerUrl;
  iframe.style.width = "100%";
  iframe.style.aspectRatio = "16 / 10";
  iframe.style.border = "1px solid #cbd5e1";
  iframe.style.borderRadius = "0.5rem";
  iframe.title = "SQLite Explorer";
  document.body.appendChild(iframe);

  // Wait for the explorer frame to actually load before posting, so the
  // receiver's window.addEventListener is guaranteed to be registered.
  await new Promise((resolve, reject) => {
    iframe.addEventListener("load", resolve, { once: true });
    iframe.addEventListener("error", () => reject(new Error("Explorer iframe failed to load")), { once: true });
  });

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      window.removeEventListener("message", onMessage);
      reject(new Error("Handover timed out — is the explorer URL correct and does it allow this origin?"));
    }, 10_000);

    const onMessage = (event) => {
      if (event.origin !== explorerOrigin) return; // exact-origin check
      const data = event.data ?? {};
      if (data.type !== HANDOVER_ACK_TYPE && data.type !== HANDOVER_NACK_TYPE) return;

      clearTimeout(timeout);
      window.removeEventListener("message", onMessage);
      if (data.type === HANDOVER_ACK_TYPE) {
        resolve();
      } else {
        reject(new Error(`Explorer rejected the handover: ${data.reason ?? "unknown reason"}`));
      }
    };
    window.addEventListener("message", onMessage);

    // The handover itself: one message, one Blob. The browser transfers the
    // blob by reference — even multi-GB databases arrive with no copying,
    // and the explorer reads pages on demand just like a dropped file.
    iframe.contentWindow.postMessage(
      { type: HANDOVER_MESSAGE_TYPE, name, blob },
      explorerOrigin // never "*": the explorer validates the sender origin too
    );
  });
}

// -------------------------------------------------------------- UI wiring ---

const form = {
  url: document.getElementById("explorerUrl"),
  button: document.getElementById("openBtn"),
  status: document.getElementById("status"),
};

form.url.value = new URLSearchParams(window.location.search).get("explorer") ?? "http://localhost:5173";

function setStatus(kind, text) {
  form.status.className = kind;
  form.status.textContent = text;
}

form.button.addEventListener("click", async () => {
  form.button.disabled = true;
  try {
    setStatus("wait", "Building demo database in memory…");
    const blob = await buildDemoDatabaseBlob();
    setStatus("wait", `Handing over ${(blob.size / 1024).toFixed(1)} KB to ${form.url.value}…`);

    await sendHandover(form.url.value.trim(), "demo.db", blob);
    setStatus("ok", "Handover accepted — the explorer should now show the products table.");
  } catch (err) {
    console.error(err);
    setStatus("err", `Handover failed: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    form.button.disabled = false;
  }
});

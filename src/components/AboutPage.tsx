// About page — what the app is, how it handles your data, and what it's
// built with. Everything stated here reflects the actual implementation.
export function AboutPage() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-10">
      <h1 className="text-3xl font-bold text-gray-900">About SQLite Explorer</h1>
      <p className="mt-3 text-gray-600 leading-relaxed">
        A fully offline, browser-based explorer for SQLite databases. Drop a{" "}
        <code className="px-1.5 py-0.5 rounded bg-gray-100 border border-gray-200 font-mono text-[13px]">
          .sqlite
        </code>{" "}
        file onto the page and browse its tables, run SQL, inspect structure and view records —
        nothing is uploaded anywhere.
      </p>

      <h2 className="text-xl font-bold text-gray-900 mt-10 mb-3">Your data never leaves your machine</h2>
      <p className="text-sm leading-relaxed text-gray-700">
        This is the core promise of the app. The file you drop or pick is opened by a SQLite
        engine compiled to WebAssembly that runs inside your browser, in a web worker. Queries
        read pages straight from the local file on demand. There is no backend, no account, no
        telemetry endpoint — the app works with the network cable unplugged (the only exception
        being the optional AI model download described below).
      </p>

      <h2 className="text-xl font-bold text-gray-900 mt-10 mb-3">What it is good at</h2>
      <ul className="list-disc pl-5 text-sm leading-relaxed text-gray-700 space-y-1">
        <li>Instantly opening databases of any size — multi-gigabyte files included</li>
        <li>Exploring tables, structure and individual records read-only</li>
        <li>Writing and running arbitrary SQL with an editor that knows your schema</li>
        <li>Formatting messy SQL with one keystroke</li>
        <li>Letting AI agents browse the database through WebMCP tools, with every action mirrored in the UI</li>
      </ul>
      <p className="text-sm leading-relaxed text-gray-700 mt-3">
        It is a <strong>read-only explorer</strong>: the database opens in read-only mode and your file is
        never modified. For editing, use your normal SQLite tooling.
      </p>

      <h2 className="text-xl font-bold text-gray-900 mt-10 mb-3">How it works</h2>
      <ul className="list-disc pl-5 text-sm leading-relaxed text-gray-700 space-y-1">
        <li>
          <strong>wa-sqlite</strong> (WebAssembly SQLite) runs in a web worker; a custom blob VFS
          serves page reads directly from the dropped file, so memory use stays at a few
          megabytes regardless of file size.
        </li>
        <li>
          <strong>Monaco</strong> (the VS Code editor) provides the SQL editor, loaded lazily so
          the landing page stays instant.
        </li>
        <li>
          <strong>@tanstack/react-virtual</strong> renders only the grid rows in view.
        </li>
        <li>
          <strong>WebLLM + Qwen2.5-Coder-1.5B</strong> power optional ghost-text completions,
          running on your GPU via WebGPU. The model is served from this site and cached by your
          browser; on machines without WebGPU it simply stays off.
        </li>
      </ul>

      <h2 className="text-xl font-bold text-gray-900 mt-10 mb-3">Open source</h2>
      <p className="text-sm leading-relaxed text-gray-700">
        The source lives at{" "}
        <a
          href="https://github.com/lucasschirm/sqlite-explorer"
          className="text-blue-600 hover:underline"
          target="_blank"
          rel="noreferrer"
        >
          github.com/lucasschirm/sqlite-explorer
        </a>
        .
      </p>
    </div>
  );
}

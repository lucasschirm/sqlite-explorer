// Creates /tmp/text-pk.db — a table whose primary key is TEXT (slug-style ids).
// Regression fixture: the first column value is NOT the rowid, so the viewer
// must resolve the real rowid before opening a record.
import initSqlJs from "sql.js";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const SQL = await initSqlJs({
  locateFile: (f) => join(root, "node_modules", "sql.js", "dist", f),
});
const db = new SQL.Database();
db.exec("CREATE TABLE sessions (id TEXT PRIMARY KEY, model TEXT, tokens INTEGER);");
const ins = db.prepare("INSERT INTO sessions VALUES (?, ?, ?)");
ins.run(["bubbly-elephant", "gpt-x", 1234]);
ins.run(["quiet-moon", "gpt-y", 99]);
ins.free();

const data = db.export();
writeFileSync("/tmp/text-pk.db", Buffer.from(data));
console.log(`Wrote /tmp/text-pk.db (${data.length} bytes)`);
db.close();

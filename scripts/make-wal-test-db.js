// Creates /tmp/wal-test.db — a database in WAL journal mode (header bytes 18-19 = 2).
// Used to reproduce/verify WAL handling in the blob VFS.
import initSqlJs from "sql.js";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const SQL = await initSqlJs({
  locateFile: (f) => join(root, "node_modules", "sql.js", "dist", f),
});
const db = new SQL.Database();
db.exec("PRAGMA journal_mode=WAL;");
db.exec("CREATE TABLE customers (id INTEGER PRIMARY KEY, name TEXT);");
const ins = db.prepare("INSERT INTO customers (name) VALUES (?)");
for (let i = 1; i <= 20; i++) ins.run([`WAL Customer ${i}`]);
ins.free();

// Export while still in WAL mode — the file keeps journal bytes = 2.
const data = db.export();
writeFileSync("/tmp/wal-test.db", Buffer.from(data));
console.log(`Wrote /tmp/wal-test.db (${data.length} bytes)`);
console.log("header bytes 18-19:", data[18], data[19], data[18] === 2 ? "(WAL)" : "(not WAL)");
db.close();

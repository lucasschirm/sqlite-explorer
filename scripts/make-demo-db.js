// Generates public/demo.db — a small demo SQLite database for testing.
// Run: bun scripts/make-demo-db.js   (or node scripts/make-demo-db.js)
import initSqlJs from "sql.js";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const SQL = await initSqlJs({
  locateFile: (f) => join(root, "node_modules", "sql.js", "dist", f),
});
const db = new SQL.Database();

db.run(`
  CREATE TABLE customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    city TEXT,
    created_at TEXT
  );
  CREATE TABLE products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    price REAL NOT NULL DEFAULT 0,
    stock INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL REFERENCES customers(id),
    product_id INTEGER NOT NULL REFERENCES products(id),
    quantity INTEGER NOT NULL,
    ordered_at TEXT
  );
  CREATE INDEX idx_orders_customer ON orders(customer_id);
  CREATE INDEX idx_orders_product ON orders(product_id);
  CREATE UNIQUE INDEX idx_products_name ON products(name);
`);

const cities = ["Lisbon", "Porto", "Madrid", "Berlin", "Paris"];
const insCustomer = db.prepare(
  "INSERT INTO customers (name, email, city, created_at) VALUES (?, ?, ?, ?)"
);
for (let i = 1; i <= 50; i++) {
  insCustomer.run([
    `Customer ${i}`,
    `customer${i}@example.com`,
    cities[i % cities.length],
    `2024-0${(i % 9) + 1}-1${i % 9}`,
  ]);
}
insCustomer.free();

const productNames = ["Widget", "Gadget", "Gizmo", "Sprocket", "Flange", "Bolt", "Nut", "Washer"];
const insProduct = db.prepare(
  "INSERT INTO products (name, price, stock) VALUES (?, ?, ?)"
);
for (let i = 0; i < productNames.length; i++) {
  insProduct.run([`${productNames[i]} Mk${i + 1}`, (i + 1) * 9.99, (i + 3) * 10]);
}
insProduct.free();

const insOrder = db.prepare(
  "INSERT INTO orders (customer_id, product_id, quantity, ordered_at) VALUES (?, ?, ?, ?)"
);
for (let i = 1; i <= 200; i++) {
  insOrder.run([(i % 50) + 1, (i % 8) + 1, (i % 5) + 1, `2024-06-${(i % 28) + 1}`]);
}
insOrder.free();

const data = db.export();
mkdirSync(join(root, "public"), { recursive: true });
writeFileSync(join(root, "public", "demo.db"), Buffer.from(data));
console.log(`Wrote public/demo.db (${data.length} bytes)`);
db.close();

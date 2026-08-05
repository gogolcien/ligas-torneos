const fs = require("fs");
const path = require("path");
const pool = require("../src/data/db");

async function main() {
  const sql = fs.readFileSync(path.join(__dirname, "..", "src", "data", "schema.sql"), "utf-8");
  await pool.query(sql);
  console.log("Tablas creadas correctamente.");
  await pool.end();
}

main().catch((err) => {
  console.error("Error creando las tablas:", err);
  process.exit(1);
});
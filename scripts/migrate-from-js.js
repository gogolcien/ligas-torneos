const fs = require("fs");
const path = require("path");
const pool = require("../src/data/db");

const DB_PATH = path.join(__dirname, "..", "data", "db.json");

async function main() {
  if (!fs.existsSync(DB_PATH)) {
    console.log("No se encontró data/db.json, nada que migrar.");
    return;
  }

  const raw = fs.readFileSync(DB_PATH, "utf-8");
  const db = JSON.parse(raw);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // --- Admin PIN ---
    if (db.adminPinHash) {
      await client.query(
        `INSERT INTO admin_settings (id, pin_salt, pin_hash) VALUES (1, $1, $2)
         ON CONFLICT (id) DO UPDATE SET pin_salt = $1, pin_hash = $2`,
        [db.adminPinHash.salt, db.adminPinHash.hash]
      );
      console.log("PIN de administrador migrado.");
    }

    // --- Ligas, torneos y participantes ---
    const leagues = Object.values(db.leagues || {});
    for (const league of leagues) {
      await client.query(
        `INSERT INTO leagues (id, name, top_n) VALUES ($1, $2, $3)
         ON CONFLICT (id) DO UPDATE SET name = $2, top_n = $3`,
        [league.id, league.name, league.topN]
      );

      for (const t of league.tournaments || []) {
        await client.query(
          `INSERT INTO tournaments (id, league_id, name, date) VALUES ($1, $2, $3, $4)
           ON CONFLICT (id) DO UPDATE SET name = $3, date = $4`,
          [t.id, league.id, t.name, t.date]
        );

        await client.query("DELETE FROM participants WHERE tournament_id = $1", [t.id]);
        for (const p of t.participants || []) {
          await client.query(
            `INSERT INTO participants (tournament_id, name, deck, position, points, is_new)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [t.id, p.name, p.deck ?? null, p.position, p.points, !!p.isNew]
          );
        }
      }
      console.log(`Liga migrada: ${league.name} (${(league.tournaments || []).length} torneos)`);
    }

    await client.query("COMMIT");
    console.log("Migración completa.");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Error en la migración:", err);
  process.exit(1);
});
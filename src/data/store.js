const pool = require("./db");

/* ---------------- Utilidad interna ---------------- */

// Construye el objeto `players` (derivado) a partir de los torneos ya
// cargados de la liga, igual que antes se mantenía a mano en db.json.
function buildPlayersFromTournaments(tournaments) {
  const players = {};
  tournaments.forEach((t) => {
    t.participants.forEach((p) => {
      if (!players[p.name]) players[p.name] = { results: [] };
      players[p.name].results.push({
        tournamentId: t.id,
        tournamentName: t.name,
        date: t.date,
        points: p.points,
        deck: p.deck,
      });
    });
  });
  return players;
}

async function loadFullLeague(id) {
  const leagueRes = await pool.query(
    "SELECT id, name, top_n AS \"topN\" FROM leagues WHERE id = $1",
    [id]
  );
  if (leagueRes.rows.length === 0) return null;
  const league = leagueRes.rows[0];

  const tournamentsRes = await pool.query(
    "SELECT id, name, to_char(date, 'YYYY-MM-DD') AS date FROM tournaments WHERE league_id = $1 ORDER BY date, id",
    [id]
  );

  const tournaments = [];
  for (const t of tournamentsRes.rows) {
    const participantsRes = await pool.query(
      `SELECT name, deck, position, points, is_new AS "isNew"
       FROM participants WHERE tournament_id = $1 ORDER BY position`,
      [t.id]
    );
    tournaments.push({ ...t, participants: participantsRes.rows });
  }

  league.tournaments = tournaments;
  league.players = buildPlayersFromTournaments(tournaments);
  return league;
}

/* ---------------- Setup ---------------- */

async function init() {
  // Las tablas ya se crean con scripts/init-db.js.
  // Se deja esta función para no romper la llamada en server.js.
  return true;
}

/* ---------------- Admin ---------------- */

async function getAdminPinHash() {
  const res = await pool.query("SELECT pin_salt AS salt, pin_hash AS hash FROM admin_settings WHERE id = 1");
  if (res.rows.length === 0 || !res.rows[0].hash) return null;
  return res.rows[0];
}

async function setAdminPinHash(pinHash) {
  await pool.query(
    `INSERT INTO admin_settings (id, pin_salt, pin_hash) VALUES (1, $1, $2)
     ON CONFLICT (id) DO UPDATE SET pin_salt = $1, pin_hash = $2`,
    [pinHash.salt, pinHash.hash]
  );
  return true;
}

/* ---------------- Ligas ---------------- */

async function listLeagues() {
  const res = await pool.query('SELECT id, name, top_n AS "topN" FROM leagues ORDER BY name');
  return res.rows;
}

async function createLeague({ id, name, topN }) {
  await pool.query("INSERT INTO leagues (id, name, top_n) VALUES ($1, $2, $3)", [id, name, topN]);
  return loadFullLeague(id);
}

async function getLeague(id) {
  return loadFullLeague(id);
}

async function updateLeagueTopN(id, topN) {
  const res = await pool.query(
    'UPDATE leagues SET top_n = $2 WHERE id = $1 RETURNING id, name, top_n AS "topN"',
    [id, topN]
  );
  if (res.rows.length === 0) return null;
  return res.rows[0];
}

// Actualiza el nombre y/o el topN de una liga. `name` es opcional: si no
// se envía, se conserva el nombre actual (COALESCE evita sobreescribirlo).
async function updateLeagueSettings(id, { name, topN }) {
  const res = await pool.query(
    'UPDATE leagues SET name = COALESCE($2, name), top_n = $3 WHERE id = $1 RETURNING id, name, top_n AS "topN"',
    [id, name || null, topN]
  );
  if (res.rows.length === 0) return null;
  return res.rows[0];
}

// Reemplaza por completo los torneos (y por lo tanto los participantes)
// de una liga con los que vengan en leagueData.tournaments. `players` no
// se guarda: se recalcula siempre a partir de los torneos al leer.
async function saveLeague(id, leagueData) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const existing = await client.query("SELECT id FROM leagues WHERE id = $1", [id]);
    if (existing.rows.length === 0) {
      await client.query("ROLLBACK");
      return null;
    }

    if (Array.isArray(leagueData.tournaments)) {
      // Borra torneos (y en cascada sus participantes) que ya no vienen
      // en la lista nueva, para reflejar ediciones/eliminaciones.
      const keepIds = leagueData.tournaments.map((t) => t.id);
      await client.query(
        `DELETE FROM tournaments WHERE league_id = $1 AND id <> ALL($2::uuid[])`,
        [id, keepIds.length ? keepIds : []]
      );

      for (const t of leagueData.tournaments) {
        await client.query(
          `INSERT INTO tournaments (id, league_id, name, date) VALUES ($1, $2, $3, $4)
           ON CONFLICT (id) DO UPDATE SET name = $3, date = $4`,
          [t.id, id, t.name, t.date]
        );

        // Reemplaza los participantes de este torneo por completo.
        await client.query("DELETE FROM participants WHERE tournament_id = $1", [t.id]);
        for (const p of t.participants) {
          await client.query(
            `INSERT INTO participants (tournament_id, name, deck, position, points, is_new)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [t.id, p.name, p.deck ?? null, p.position, p.points, !!p.isNew]
          );
        }
      }
    }

    await client.query("COMMIT");
    return loadFullLeague(id);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  init,
  getAdminPinHash,
  setAdminPinHash,
  listLeagues,
  createLeague,
  getLeague,
  updateLeagueTopN,
  updateLeagueSettings,
  saveLeague,
};
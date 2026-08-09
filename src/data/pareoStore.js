const pool = require("./db");

/* ---------------- Carga completa de un torneo de pareos ---------------- */

async function loadFullPareoTournament(id) {
  const tRes = await pool.query(
    `SELECT id, name, status, created_at AS "createdAt" FROM pareo_tournaments WHERE id = $1`,
    [id]
  );
  if (tRes.rows.length === 0) return null;
  const tournament = tRes.rows[0];

  const playersRes = await pool.query(
    `SELECT id, name, enabled, seq FROM pareo_players WHERE tournament_id = $1 ORDER BY seq, id`,
    [id]
  );
  tournament.players = playersRes.rows;

  const roundsRes = await pool.query(
    `SELECT id, round_number AS "roundNumber" FROM pareo_rounds WHERE tournament_id = $1 ORDER BY round_number`,
    [id]
  );

  const rounds = [];
  for (const r of roundsRes.rows) {
    const matchesRes = await pool.query(
      `SELECT id, table_number AS "tableNumber", player_a_id AS "playerAId",
              player_b_id AS "playerBId", result
       FROM pareo_matches WHERE round_id = $1 ORDER BY table_number`,
      [r.id]
    );
    rounds.push({ id: r.id, roundNumber: r.roundNumber, matches: matchesRes.rows });
  }
  tournament.rounds = rounds;

  return tournament;
}

/* ---------------- Torneos ---------------- */

async function listPareoTournaments() {
  const res = await pool.query(
    `SELECT id, name, status, created_at AS "createdAt" FROM pareo_tournaments ORDER BY created_at DESC`
  );
  return res.rows;
}

async function createPareoTournament({ id, name }) {
  await pool.query(`INSERT INTO pareo_tournaments (id, name, status) VALUES ($1, $2, 'active')`, [id, name]);
  return loadFullPareoTournament(id);
}

async function getPareoTournament(id) {
  return loadFullPareoTournament(id);
}

async function setPareoTournamentStatus(id, status) {
  await pool.query(`UPDATE pareo_tournaments SET status = $2 WHERE id = $1`, [id, status]);
  return loadFullPareoTournament(id);
}

async function deleteTournament(id) {
  await pool.query(`DELETE FROM pareo_tournaments WHERE id = $1`, [id]);
}

/* ---------------- Jugadores ---------------- */

// Agrega un jugador. Si el torneo ya tiene rondas creadas, se le
// asigna automáticamente un AUTOWIN en la ronda más reciente (llegó
// tarde y no participó en el pareo de esa ronda).
async function addPlayer(tournamentId, name) {
  const seqRes = await pool.query(
    `SELECT COALESCE(MAX(seq), 0) + 1 AS next FROM pareo_players WHERE tournament_id = $1`,
    [tournamentId]
  );
  const seq = seqRes.rows[0].next;

  const insertRes = await pool.query(
    `INSERT INTO pareo_players (tournament_id, name, enabled, seq) VALUES ($1, $2, true, $3) RETURNING id`,
    [tournamentId, name, seq]
  );
  const playerId = insertRes.rows[0].id;

  const roundRes = await pool.query(
    `SELECT id FROM pareo_rounds WHERE tournament_id = $1 ORDER BY round_number DESC LIMIT 1`,
    [tournamentId]
  );
  if (roundRes.rows.length) {
    const roundId = roundRes.rows[0].id;
    const tableRes = await pool.query(
      `SELECT COALESCE(MAX(table_number), 0) + 1 AS next FROM pareo_matches WHERE round_id = $1`,
      [roundId]
    );
    await pool.query(
      `INSERT INTO pareo_matches (round_id, tournament_id, table_number, player_a_id, player_b_id, result)
       VALUES ($1, $2, $3, $4, NULL, 'bye_win')`,
      [roundId, tournamentId, tableRes.rows[0].next, playerId]
    );
  }

  return loadFullPareoTournament(tournamentId);
}

async function updatePlayer(tournamentId, playerId, { name, enabled }) {
  const fields = [];
  const values = [playerId, tournamentId];
  if (name != null) {
    values.push(name);
    fields.push(`name = $${values.length}`);
  }
  if (enabled != null) {
    values.push(enabled);
    fields.push(`enabled = $${values.length}`);
  }
  if (!fields.length) return loadFullPareoTournament(tournamentId);
  await pool.query(
    `UPDATE pareo_players SET ${fields.join(", ")} WHERE id = $1 AND tournament_id = $2`,
    values
  );
  return loadFullPareoTournament(tournamentId);
}

async function deletePlayer(tournamentId, playerId) {
  await pool.query(`DELETE FROM pareo_players WHERE id = $1 AND tournament_id = $2`, [playerId, tournamentId]);
  return loadFullPareoTournament(tournamentId);
}

/* ---------------- Rondas y pareos ---------------- */

// Crea la siguiente ronda con los pares ya calculados por swiss.js.
// pairs: [{ playerAId, playerBId }] (playerBId null = AUTOWIN)
async function createRoundWithPairs(tournamentId, pairs) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const numRes = await client.query(
      `SELECT COALESCE(MAX(round_number), 0) + 1 AS next FROM pareo_rounds WHERE tournament_id = $1`,
      [tournamentId]
    );
    const roundNumber = numRes.rows[0].next;
    const roundRes = await client.query(
      `INSERT INTO pareo_rounds (tournament_id, round_number) VALUES ($1, $2) RETURNING id`,
      [tournamentId, roundNumber]
    );
    const roundId = roundRes.rows[0].id;

    let table = 1;
    for (const p of pairs) {
      const result = p.playerBId == null ? "bye_win" : null;
      await client.query(
        `INSERT INTO pareo_matches (round_id, tournament_id, table_number, player_a_id, player_b_id, result)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [roundId, tournamentId, table, p.playerAId, p.playerBId, result]
      );
      table += 1;
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
  return loadFullPareoTournament(tournamentId);
}

// Reemplaza por completo los pareos de una ronda (pareo manual). Solo
// tiene sentido usarlo mientras ningún resultado real se haya
// registrado todavía en esa ronda (se valida en la ruta).
async function replaceRoundPairs(tournamentId, roundId, pairs) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`DELETE FROM pareo_matches WHERE round_id = $1`, [roundId]);
    let table = 1;
    for (const p of pairs) {
      const result = p.playerBId == null ? "bye_win" : null;
      await client.query(
        `INSERT INTO pareo_matches (round_id, tournament_id, table_number, player_a_id, player_b_id, result)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [roundId, tournamentId, table, p.playerAId, p.playerBId, result]
      );
      table += 1;
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
  return loadFullPareoTournament(tournamentId);
}

async function setMatchResult(tournamentId, matchId, result) {
  await pool.query(`UPDATE pareo_matches SET result = $3 WHERE id = $1 AND tournament_id = $2`, [
    matchId,
    tournamentId,
    result,
  ]);
  return loadFullPareoTournament(tournamentId);
}

// Borra los resultados de todas las partidas "reales" (con ambos
// jugadores) de una ronda, para poder repetir el pareo manual. Las
// mesas de AUTOWIN/AUTOLOSE no se tocan (no tienen rival, no bloquean
// el pareo manual).
async function clearRoundResults(tournamentId, roundId) {
  await pool.query(
    `UPDATE pareo_matches SET result = NULL
     WHERE round_id = $1 AND tournament_id = $2 AND player_b_id IS NOT NULL`,
    [roundId, tournamentId]
  );
  return loadFullPareoTournament(tournamentId);
}

module.exports = {
  listPareoTournaments,
  createPareoTournament,
  getPareoTournament,
  setPareoTournamentStatus,
  deleteTournament,
  addPlayer,
  updatePlayer,
  deletePlayer,
  createRoundWithPairs,
  replaceRoundPairs,
  setMatchResult,
  clearRoundResults,
};

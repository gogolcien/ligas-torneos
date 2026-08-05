const express = require("express");
const crypto = require("crypto");
const store = require("../data/store");
const { computeTournamentResults, computeStandings } = require("../utils/points");
const { normalize } = require("../utils/match");
const { requireAdmin } = require("./admin");

const router = express.Router();

// GET /api/leagues -> lista ligera de ligas
router.get("/", async (req, res) => {
  const leagues = await store.listLeagues();
  res.json(leagues);
});

// POST /api/leagues -> crear liga (admin)
router.post("/", requireAdmin, async (req, res) => {
  const { name, topN } = req.body || {};
  if (!name || !String(name).trim()) return res.status(400).json({ error: "El nombre es obligatorio." });
  const league = await store.createLeague({
    id: crypto.randomUUID(),
    name: String(name).trim(),
    topN: Math.max(1, Number(topN) || 5),
  });
  res.status(201).json({ id: league.id, name: league.name, topN: league.topN });
});

// GET /api/leagues/:id -> datos completos + clasificación calculada
router.get("/:id", async (req, res) => {
  const league = await store.getLeague(req.params.id);
  if (!league) return res.status(404).json({ error: "Liga no encontrada." });
  const standings = computeStandings(league, league.topN);
  res.json({ ...league, standings });
});

// PUT /api/leagues/:id -> actualizar topN (admin)
router.put("/:id", requireAdmin, async (req, res) => {
  const { topN } = req.body || {};
  const league = await store.updateLeagueTopN(req.params.id, Math.max(1, Number(topN) || 5));
  if (!league) return res.status(404).json({ error: "Liga no encontrada." });
  res.json({ id: league.id, name: league.name, topN: league.topN });
});

// POST /api/leagues/:id/tournaments -> agregar torneo (admin)
router.post("/:id/tournaments", requireAdmin, async (req, res) => {
  const league = await store.getLeague(req.params.id);
  if (!league) return res.status(404).json({ error: "Liga no encontrada." });

  const { name, date, participants } = req.body || {};
  const clean = (participants || []).filter((p) => p && p.name && String(p.name).trim());
  if (!clean.length) return res.status(400).json({ error: "Se necesita al menos un jugador." });

  const results = computeTournamentResults(clean);
  const tournamentId = crypto.randomUUID();

  const tournamentRecord = {
    id: tournamentId,
    name: (name && String(name).trim()) || "Torneo sin nombre",
    date: date || new Date().toISOString().slice(0, 10),
    participants: results.map((r) => ({
      ...r,
      isNew: !league.players[r.name],
    })),
  };

  results.forEach((r) => {
    if (!league.players[r.name]) league.players[r.name] = { results: [] };
    league.players[r.name].results.push({
      tournamentId,
      tournamentName: tournamentRecord.name,
      date: tournamentRecord.date,
      points: r.points,
      deck: r.deck,
    });
  });

  league.tournaments.push(tournamentRecord);
  await store.saveLeague(league.id, { tournaments: league.tournaments, players: league.players });

  res.status(201).json(tournamentRecord);
});

// POST /api/leagues/:id/players/rename -> corregir el nombre de un
// jugador y reflejarlo en todo su historial de torneos (admin).
// Si el nuevo nombre coincide (sin acentos/mayúsculas) con otro
// jugador ya existente, ambos se fusionan en uno solo.
router.post("/:id/players/rename", requireAdmin, async (req, res) => {
  const league = await store.getLeague(req.params.id);
  if (!league) return res.status(404).json({ error: "Liga no encontrada." });

  const oldName = (req.body?.oldName || "").trim();
  const newNameRaw = (req.body?.newName || "").trim();
  if (!oldName || !newNameRaw) {
    return res.status(400).json({ error: "Faltan datos para renombrar al jugador." });
  }
  if (!league.players[oldName]) {
    return res.status(404).json({ error: "Ese jugador no existe en la liga." });
  }

  const otherKeys = Object.keys(league.players).filter((k) => k !== oldName);
  const matchKey = otherKeys.find((k) => normalize(k) === normalize(newNameRaw));
  const finalName = matchKey || newNameRaw;

  if (finalName === oldName) {
    return res.json({ ok: true, name: finalName });
  }

  if (league.players[finalName]) {
    // Ya existía un jugador con ese nombre: se fusionan resultados.
    const merged = [...(league.players[finalName].results || []), ...(league.players[oldName].results || [])];
    league.players[finalName] = { results: merged };
    delete league.players[oldName];
  } else {
    league.players[finalName] = league.players[oldName];
    delete league.players[oldName];
  }

  // Actualiza el nombre en el historial de cada torneo donde aparece.
  league.tournaments.forEach((t) => {
    t.participants.forEach((p) => {
      if (p.name === oldName) p.name = finalName;
    });
  });

  // Recalcula la etiqueta "Nuevo en la liga": solo la primera aparición
  // cronológica de este jugador (ya fusionado) debe conservarla.
  let seen = false;
  league.tournaments.forEach((t) => {
    t.participants.forEach((p) => {
      if (p.name === finalName) {
        p.isNew = !seen;
        seen = true;
      }
    });
  });

  await store.saveLeague(league.id, { tournaments: league.tournaments, players: league.players });
  res.json({ ok: true, name: finalName });
});

// PUT /api/leagues/:id/tournaments/:tournamentId -> corregir nombre y
// fecha de un torneo ya guardado (admin). También actualiza esos datos
// en el historial de puntos de cada jugador que participó.
router.put("/:id/tournaments/:tournamentId", requireAdmin, async (req, res) => {
  const league = await store.getLeague(req.params.id);
  if (!league) return res.status(404).json({ error: "Liga no encontrada." });

  const tournament = league.tournaments.find((t) => t.id === req.params.tournamentId);
  if (!tournament) return res.status(404).json({ error: "Torneo no encontrado." });

  const { name, date } = req.body || {};
  const newName = (name && String(name).trim()) || tournament.name;
  const newDate = (date && String(date).trim()) || tournament.date;

  tournament.name = newName;
  tournament.date = newDate;

  Object.values(league.players).forEach((player) => {
    (player.results || []).forEach((r) => {
      if (r.tournamentId === tournament.id) {
        r.tournamentName = newName;
        r.date = newDate;
      }
    });
  });

  await store.saveLeague(league.id, { tournaments: league.tournaments, players: league.players });
  res.json(tournament);
});

// PUT /api/leagues/:id/tournaments/:tournamentId/participants -> editar la
// lista de participantes de un torneo ya guardado (admin): corregir nombres,
// cambiar el orden/posición, o agregar/quitar jugadores. El body espera
// `participants`: el arreglo COMPLETO y en el orden final deseado
// (posición 0 = primer lugar). Se recalculan los puntos de cada quien y se
// actualiza el historial de todos los jugadores afectados (los que estaban
// antes y los que quedan ahora), incluyendo la etiqueta "Nuevo en la liga".
router.put("/:id/tournaments/:tournamentId/participants", requireAdmin, async (req, res) => {
  const league = await store.getLeague(req.params.id);
  if (!league) return res.status(404).json({ error: "Liga no encontrada." });

  const tournament = league.tournaments.find((t) => t.id === req.params.tournamentId);
  if (!tournament) return res.status(404).json({ error: "Torneo no encontrado." });

  const raw = req.body?.participants;
  if (!Array.isArray(raw)) return res.status(400).json({ error: "Formato de participantes inválido." });
  const clean = raw.filter((p) => p && p.name && String(p.name).trim());
  if (!clean.length) return res.status(400).json({ error: "Se necesita al menos un jugador." });

  const results = computeTournamentResults(clean);

  // Jugadores afectados: los que tenían un resultado en este torneo antes,
  // más los que lo tienen ahora (para poder recalcular a ambos grupos).
  const previousNames = new Set(tournament.participants.map((p) => p.name));
  const newNames = new Set(results.map((r) => r.name));
  const affected = new Set([...previousNames, ...newNames]);

  // Quita de cada jugador afectado el resultado que tenía en este torneo.
  affected.forEach((name) => {
    if (league.players[name]) {
      league.players[name].results = (league.players[name].results || []).filter(
        (r) => r.tournamentId !== tournament.id
      );
    }
  });

  // Agrega los resultados recalculados a los jugadores que quedaron en el torneo.
  results.forEach((r) => {
    if (!league.players[r.name]) league.players[r.name] = { results: [] };
    league.players[r.name].results.push({
      tournamentId: tournament.id,
      tournamentName: tournament.name,
      date: tournament.date,
      points: r.points,
      deck: r.deck,
    });
  });

  // Si un jugador se quedó sin ningún resultado en toda la liga, se elimina.
  affected.forEach((name) => {
    if (league.players[name] && league.players[name].results.length === 0) {
      delete league.players[name];
    }
  });

  tournament.participants = results.map((r) => ({ ...r, isNew: false }));

  // Recalcula "Nuevo en la liga" para cada jugador afectado: solo su
  // primera aparición cronológica (entre todos los torneos) la conserva.
  affected.forEach((name) => {
    let seen = false;
    league.tournaments.forEach((t) => {
      t.participants.forEach((p) => {
        if (p.name === name) {
          p.isNew = !seen;
          seen = true;
        }
      });
    });
  });

  await store.saveLeague(league.id, { tournaments: league.tournaments, players: league.players });
  res.json(tournament);
});

module.exports = router;

const express = require("express");
const crypto = require("crypto");
const store = require("../data/pareoStore");
const swiss = require("../utils/swiss");
const { requireAdmin } = require("./admin");
const asyncHandler = require("../utils/asyncHandler");

const router = express.Router();

function serialize(tournament) {
  const standings = swiss.computeStandings(tournament);
  const standingsById = {};
  standings.forEach((s) => {
    standingsById[s.id] = s;
  });

  return {
    id: tournament.id,
    name: tournament.name,
    status: tournament.status,
    createdAt: tournament.createdAt,
    players: tournament.players.map((p) => ({
      ...p,
      points: standingsById[p.id]?.points || 0,
      opPercent: standingsById[p.id]?.opPercent || 0,
      oopPercent: standingsById[p.id]?.oopPercent || 0,
      sl: standingsById[p.id]?.sl || 0,
    })),
    rounds: tournament.rounds.map((r) => ({
      id: r.id,
      roundNumber: r.roundNumber,
      matches: r.matches.map((m) => ({
        ...m,
        playerAName: tournament.players.find((p) => p.id === m.playerAId)?.name || "?",
        playerBName: m.playerBId != null ? tournament.players.find((p) => p.id === m.playerBId)?.name || "?" : null,
      })),
    })),
    standings,
  };
}

function findTournamentOr404(res, tournament) {
  if (!tournament) {
    res.status(404).json({ error: "Torneo de pareos no encontrado." });
    return false;
  }
  return true;
}

// GET /api/pareos -> lista de torneos
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const tournaments = await store.listPareoTournaments();
    res.json(tournaments);
  })
);

// POST /api/pareos -> crear torneo (admin)
router.post(
  "/",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { name } = req.body || {};
    if (!name || !String(name).trim()) return res.status(400).json({ error: "El nombre es obligatorio." });
    const tournament = await store.createPareoTournament({ id: crypto.randomUUID(), name: String(name).trim() });
    res.status(201).json(serialize(tournament));
  })
);

// GET /api/pareos/:id -> torneo completo con standings calculados
router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const tournament = await store.getPareoTournament(req.params.id);
    if (!findTournamentOr404(res, tournament)) return;
    res.json(serialize(tournament));
  })
);

// DELETE /api/pareos/:id -> eliminar torneo completo (admin)
router.delete(
  "/:id",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const existing = await store.getPareoTournament(req.params.id);
    if (!findTournamentOr404(res, existing)) return;
    await store.deleteTournament(req.params.id);
    res.json({ ok: true });
  })
);

// POST /api/pareos/:id/players -> agregar jugador (admin)
router.post(
  "/:id/players",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { name } = req.body || {};
    if (!name || !String(name).trim()) return res.status(400).json({ error: "El nombre es obligatorio." });
    const existing = await store.getPareoTournament(req.params.id);
    if (!findTournamentOr404(res, existing)) return;
    const tournament = await store.addPlayer(req.params.id, String(name).trim());
    res.status(201).json(serialize(tournament));
  })
);

// PUT /api/pareos/:id/players/:playerId -> renombrar / inhabilitar / rehabilitar (admin)
router.put(
  "/:id/players/:playerId",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { name, enabled } = req.body || {};
    if (name != null && !String(name).trim()) {
      return res.status(400).json({ error: "El nombre no puede quedar vacío." });
    }
    const existing = await store.getPareoTournament(req.params.id);
    if (!findTournamentOr404(res, existing)) return;
    const tournament = await store.updatePlayer(req.params.id, Number(req.params.playerId), {
      name: name != null ? String(name).trim() : undefined,
      enabled: typeof enabled === "boolean" ? enabled : undefined,
    });
    res.json(serialize(tournament));
  })
);

// DELETE /api/pareos/:id/players/:playerId -> eliminar jugador (admin)
// Solo permitido antes de que exista la ronda 1 (ya pareada).
router.delete(
  "/:id/players/:playerId",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const existing = await store.getPareoTournament(req.params.id);
    if (!findTournamentOr404(res, existing)) return;
    if (existing.rounds.length > 0) {
      return res.status(400).json({ error: "Solo se pueden eliminar jugadores antes de terminar la ronda 1." });
    }
    const tournament = await store.deletePlayer(req.params.id, Number(req.params.playerId));
    res.json(serialize(tournament));
  })
);

// POST /api/pareos/:id/pair-next-round -> genera el pareo de la siguiente ronda (admin)
router.post(
  "/:id/pair-next-round",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const existing = await store.getPareoTournament(req.params.id);
    if (!findTournamentOr404(res, existing)) return;

    const lastRound = existing.rounds[existing.rounds.length - 1];
    if (lastRound) {
      const pending = lastRound.matches.some((m) => m.playerBId != null && !m.result);
      if (pending) {
        return res.status(400).json({ error: "Aún hay partidas sin resultado en la ronda actual." });
      }
    }

    const activeCount = existing.players.filter((p) => p.enabled).length;
    if (activeCount < 2) {
      return res.status(400).json({ error: "Se necesitan al menos 2 jugadores habilitados." });
    }

    const pairs = swiss.generatePairings(existing);
    const tournament = await store.createRoundWithPairs(req.params.id, pairs);
    res.status(201).json(serialize(tournament));
  })
);

// POST /api/pareos/:id/rounds/:roundId/clear-results -> borra los
// resultados registrados de la ronda (admin), para poder repetir el
// pareo manual sin tener que eliminar la ronda completa.
router.post(
  "/:id/rounds/:roundId/clear-results",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const existing = await store.getPareoTournament(req.params.id);
    if (!findTournamentOr404(res, existing)) return;
    const round = existing.rounds.find((r) => String(r.id) === String(req.params.roundId));
    if (!round) return res.status(404).json({ error: "Ronda no encontrada." });
    const tournament = await store.clearRoundResults(req.params.id, round.id);
    res.json(serialize(tournament));
  })
);

// PUT /api/pareos/:id/rounds/:roundId/pairings -> pareo manual (admin)
// body: { pairs: [{ playerAId, playerBId }] } (playerBId null = AUTOWIN)
router.put(
  "/:id/rounds/:roundId/pairings",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const existing = await store.getPareoTournament(req.params.id);
    if (!findTournamentOr404(res, existing)) return;

    const round = existing.rounds.find((r) => String(r.id) === String(req.params.roundId));
    if (!round) return res.status(404).json({ error: "Ronda no encontrada." });

    const alreadyPlayed = round.matches.some(
      (m) => m.playerBId != null && m.result
    );
    if (alreadyPlayed) {
      return res.status(400).json({ error: "Ya hay resultados registrados en esta ronda; no se puede repareo." });
    }

    const pairs = req.body?.pairs;
    if (!Array.isArray(pairs) || !pairs.length) {
      return res.status(400).json({ error: "Formato de pareo manual inválido." });
    }

    const tournament = await store.replaceRoundPairs(req.params.id, round.id, pairs);
    res.json(serialize(tournament));
  })
);

// PUT /api/pareos/:id/matches/:matchId/result -> registrar o borrar resultado (admin)
// body: { result: 'a_win' | 'b_win' | 'double_loss' | 'draw' | null }
// result: null borra el resultado ya registrado (para poder repareo manual).
router.put(
  "/:id/matches/:matchId/result",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { result } = req.body || {};
    if (result !== null && !["a_win", "b_win", "double_loss", "draw"].includes(result)) {
      return res.status(400).json({ error: "Resultado inválido." });
    }
    const existing = await store.getPareoTournament(req.params.id);
    if (!findTournamentOr404(res, existing)) return;
    const tournament = await store.setMatchResult(req.params.id, Number(req.params.matchId), result);
    res.json(serialize(tournament));
  })
);

// PUT /api/pareos/:id/matches/:matchId/toggle-autolose -> AUTOWIN <-> AUTOLOSE (admin)
router.put(
  "/:id/matches/:matchId/toggle-autolose",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const existing = await store.getPareoTournament(req.params.id);
    if (!findTournamentOr404(res, existing)) return;
    const match = existing.rounds.flatMap((r) => r.matches).find((m) => m.id === Number(req.params.matchId));
    if (!match || match.playerBId != null) {
      return res.status(400).json({ error: "Esta acción solo aplica a partidas de AUTOWIN/AUTOLOSE." });
    }
    const newResult = match.result === "bye_loss" ? "bye_win" : "bye_loss";
    const tournament = await store.setMatchResult(req.params.id, match.id, newResult);
    res.json(serialize(tournament));
  })
);

module.exports = router;

/* ==================================================================
   Pareo Suizo — lógica pura (sin tocar la base de datos).
   Implementa los requerimientos:
   - Ronda 1: pareo aleatorio, AUTOWIN si el número de jugadores es impar.
   - Rondas siguientes: agrupación por puntaje, evita rivales repetidos,
     downpairing cuando hace falta, AUTOWIN para el de menor puntaje que
     no lo haya recibido antes.
   - Desempates: P, OP%, OOP%, SL (en ese orden).
   ================================================================== */

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* ---------------- Estadísticas por jugador ---------------- */

// Para cada jugador arma la lista de rondas que ha jugado:
// { roundNumber, opponentId (null = AUTOWIN/AUTOLOSE), outcome }
// outcome: 'win' | 'loss' | 'double_loss' | 'draw'
function buildPlayerRounds(tournament) {
  const roundsByPlayer = {};
  tournament.players.forEach((p) => {
    roundsByPlayer[p.id] = [];
  });

  tournament.rounds.forEach((round) => {
    round.matches.forEach((m) => {
      if (!m.result) return; // resultado pendiente, no cuenta todavía

      if (m.playerBId == null) {
        // AUTOWIN (bye_win) o AUTOLOSE (bye_loss)
        const outcome = m.result === "bye_loss" ? "loss" : "win";
        if (roundsByPlayer[m.playerAId]) {
          roundsByPlayer[m.playerAId].push({
            roundNumber: round.roundNumber,
            opponentId: null,
            outcome,
          });
        }
        return;
      }

      let outcomeA;
      let outcomeB;
      if (m.result === "a_win") {
        outcomeA = "win";
        outcomeB = "loss";
      } else if (m.result === "b_win") {
        outcomeA = "loss";
        outcomeB = "win";
      } else if (m.result === "draw") {
        outcomeA = "draw";
        outcomeB = "draw";
      } else {
        // 'double_loss': ambos jugadores pierden
        outcomeA = "double_loss";
        outcomeB = "double_loss";
      }

      if (roundsByPlayer[m.playerAId]) {
        roundsByPlayer[m.playerAId].push({
          roundNumber: round.roundNumber,
          opponentId: m.playerBId,
          outcome: outcomeA,
        });
      }
      if (roundsByPlayer[m.playerBId]) {
        roundsByPlayer[m.playerBId].push({
          roundNumber: round.roundNumber,
          opponentId: m.playerAId,
          outcome: outcomeB,
        });
      }
    });
  });

  return roundsByPlayer;
}

// Record propio de un jugador: rondas ganadas / rondas jugadas, donde
// un empate cuenta como 1/3 de triunfo (misma proporción que 1 de los
// 3 puntos que da una victoria).
function ownRecord(rounds) {
  const played = rounds.length;
  if (!played) return 0;
  const wins = rounds.filter((r) => r.outcome === "win").length;
  const draws = rounds.filter((r) => r.outcome === "draw").length;
  return (wins + draws / 3) / played;
}

// Calcula puntos, record propio, OP%, OOP% y SL para todos los
// jugadores de un torneo, a partir de todas las rondas ya resueltas.
function computeStats(tournament) {
  const roundsByPlayer = buildPlayerRounds(tournament);
  const ids = Object.keys(roundsByPlayer).map(Number);

  const points = {};
  const record = {};
  ids.forEach((id) => {
    const rounds = roundsByPlayer[id];
    const wins = rounds.filter((r) => r.outcome === "win").length;
    const draws = rounds.filter((r) => r.outcome === "draw").length;
    points[id] = wins * 3 + draws * 1;
    record[id] = ownRecord(rounds);
  });

  // OP%: promedio del record de cada RIVAL REAL (se omiten las rondas
  // de AUTOWIN/AUTOLOSE, que no tienen rival).
  const opPercent = {};
  ids.forEach((id) => {
    const opponentIds = roundsByPlayer[id]
      .filter((r) => r.opponentId != null)
      .map((r) => r.opponentId);
    if (!opponentIds.length) {
      opPercent[id] = 0;
      return;
    }
    const sum = opponentIds.reduce((s, oid) => s + (record[oid] ?? 0), 0);
    opPercent[id] = sum / opponentIds.length;
  });

  // OOP%: promedio del OP% de cada rival real.
  const oopPercent = {};
  ids.forEach((id) => {
    const opponentIds = roundsByPlayer[id]
      .filter((r) => r.opponentId != null)
      .map((r) => r.opponentId);
    if (!opponentIds.length) {
      oopPercent[id] = 0;
      return;
    }
    const sum = opponentIds.reduce((s, oid) => s + (opPercent[oid] ?? 0), 0);
    oopPercent[id] = sum / opponentIds.length;
  });

  // SL (Square Loss): suma de (número de ronda)^2 por cada ronda
  // perdida (derrota normal, doble derrota o AUTOLOSE).
  const sl = {};
  ids.forEach((id) => {
    sl[id] = roundsByPlayer[id]
      .filter((r) => r.outcome === "loss" || r.outcome === "double_loss")
      .reduce((s, r) => s + r.roundNumber * r.roundNumber, 0);
  });

  const roundsPlayed = {};
  const opponentsOf = {};
  ids.forEach((id) => {
    roundsPlayed[id] = roundsByPlayer[id].length;
    opponentsOf[id] = new Set(
      roundsByPlayer[id].filter((r) => r.opponentId != null).map((r) => r.opponentId)
    );
  });

  return { points, record, opPercent, oopPercent, sl, roundsPlayed, opponentsOf, roundsByPlayer };
}

// Standings ordenados: Puntos desc, OP% desc, OOP% desc, SL desc.
function computeStandings(tournament) {
  const stats = computeStats(tournament);
  const rows = tournament.players.map((p) => ({
    id: p.id,
    name: p.name,
    enabled: p.enabled,
    points: stats.points[p.id] || 0,
    opPercent: stats.opPercent[p.id] || 0,
    oopPercent: stats.oopPercent[p.id] || 0,
    sl: stats.sl[p.id] || 0,
    roundsPlayed: stats.roundsPlayed[p.id] || 0,
  }));

  rows.sort(
    (a, b) =>
      b.points - a.points ||
      b.opPercent - a.opPercent ||
      b.oopPercent - a.oopPercent ||
      b.sl - a.sl ||
      a.name.localeCompare(b.name)
  );

  return rows.map((r, i) => ({ ...r, rank: i + 1 }));
}

/* ---------------- Generación de pareos ---------------- */

// Elige quién recibe el AUTOWIN cuando el número de jugadores activos
// es impar: el de menor puntaje que aún no haya recibido uno.
function pickByePlayer(pool, stats) {
  const withoutBye = pool.filter((p) => {
    const rounds = stats.roundsByPlayer[p.id] || [];
    return !rounds.some((r) => r.opponentId == null);
  });
  const candidates = withoutBye.length ? withoutBye : pool;
  return [...candidates].sort((a, b) => (stats.points[a.id] || 0) - (stats.points[b.id] || 0))[0];
}

// Devuelve [{ playerAId, playerBId }] para la siguiente ronda.
// playerBId === null significa AUTOWIN.
function generatePairings(tournament) {
  const activePlayers = tournament.players.filter((p) => p.enabled);
  const isRound1 = tournament.rounds.length === 0;

  if (isRound1) {
    const shuffled = shuffle(activePlayers);
    const pairs = [];
    while (shuffled.length >= 2) {
      const a = shuffled.shift();
      const b = shuffled.shift();
      pairs.push({ playerAId: a.id, playerBId: b.id });
    }
    if (shuffled.length === 1) {
      pairs.push({ playerAId: shuffled[0].id, playerBId: null });
    }
    return pairs;
  }

  const stats = computeStats(tournament);
  let pool = activePlayers;
  let byePlayer = null;

  if (pool.length % 2 === 1) {
    byePlayer = pickByePlayer(pool, stats);
    pool = pool.filter((p) => p.id !== byePlayer.id);
  }

  // 1. Agrupa por puntaje descendente.
  const groups = {};
  pool.forEach((p) => {
    const pts = stats.points[p.id] || 0;
    if (!groups[pts]) groups[pts] = [];
    groups[pts].push(p);
  });
  const pointLevels = Object.keys(groups)
    .map(Number)
    .sort((a, b) => b - a);

  const playedAgainst = (aId, bId) => stats.opponentsOf[aId]?.has(bId);

  const pairs = [];
  let carry = [];

  pointLevels.forEach((pts) => {
    let queue = shuffle([...carry, ...groups[pts]]);
    carry = [];

    while (queue.length) {
      const a = queue.shift();
      const matchIndex = queue.findIndex((b) => !playedAgainst(a.id, b.id));
      if (matchIndex === -1) {
        // No hay rival sin repetir disponible en este grupo: se baja
        // ("downpairing") al siguiente grupo de puntaje.
        carry.push(a);
        continue;
      }
      const b = queue.splice(matchIndex, 1)[0];
      pairs.push({ playerAId: a.id, playerBId: b.id });
    }
  });

  // Lo que quede sin poder emparejarse evitando repetición en ningún
  // grupo se empareja de todos modos (es preferible repetir un rival
  // a dejar a alguien sin pareo).
  while (carry.length >= 2) {
    const a = carry.shift();
    let idx = carry.findIndex((b) => !playedAgainst(a.id, b.id));
    if (idx === -1) idx = 0;
    const b = carry.splice(idx, 1)[0];
    pairs.push({ playerAId: a.id, playerBId: b.id });
  }

  // Red de seguridad: si por alguna razón queda un sobrante impar que
  // no se resolvió arriba, recibe AUTOWIN.
  if (carry.length === 1 && !byePlayer) {
    byePlayer = carry[0];
  } else if (carry.length === 1 && byePlayer) {
    pairs.push({ playerAId: carry[0].id, playerBId: null });
  }

  if (byePlayer) {
    pairs.push({ playerAId: byePlayer.id, playerBId: null });
  }

  return pairs;
}

module.exports = { computeStandings, computeStats, generatePairings };

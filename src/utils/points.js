// Un torneo consta de jugadores en orden (posición 0 = primer lugar).
// Puntos de cada posición = total de participantes - posición.
function computeTournamentResults(participants) {
  const total = participants.length;
  return participants.map((p, idx) => ({
    name: p.name.trim(),
    deck: p.deck && String(p.deck).trim() ? String(p.deck).trim() : null,
    position: idx,
    points: total - idx,
  }));
}

// Reconstruye la clasificación tal como estaba después de cada torneo
// (en el orden en que se fueron registrando), para poder comparar la
// clasificación actual contra la de la actualización anterior.
// Devuelve un arreglo de snapshots; cada snapshot es { nombre -> puesto }.
function computeStandingsHistory(leagueData, topN) {
  const tournaments = leagueData.tournaments || [];
  const scoresByPlayer = {};
  const history = [];

  tournaments.forEach((t) => {
    (t.participants || []).forEach((p) => {
      if (!scoresByPlayer[p.name]) scoresByPlayer[p.name] = [];
      scoresByPlayer[p.name].push(p.points);
    });

    const rows = Object.entries(scoresByPlayer).map(([name, scores]) => {
      const top = [...scores].sort((a, b) => b - a).slice(0, topN);
      return { name, total: top.reduce((s, v) => s + v, 0) };
    });
    rows.sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));

    const ranks = {};
    rows.forEach((r, i) => {
      ranks[r.name] = i + 1;
    });
    history.push(ranks);
  });

  return history;
}

// Clasificación de una liga: para cada jugador se suman sus mejores
// N resultados (las ausencias no restan, simplemente no aportan un
// resultado extra, lo que equivale a contarlas como 0). Además, cada
// fila incluye:
//  - trend: { direction: "up"|"down", delta } comparado con la
//    clasificación previa a que se registrara el último torneo, o
//    null si el jugador es nuevo o no hubo cambio de puesto.
//  - crown: si el jugador está en 1er lugar, cuántos torneos seguidos
//    lleva ahí (racha actual); null si no está en 1er lugar.
function computeStandings(leagueData, topN) {
  const players = leagueData.players || {};
  const rows = Object.entries(players).map(([name, data]) => {
    const scores = (data.results || []).map((r) => r.points).sort((a, b) => b - a);
    const top = scores.slice(0, topN);
    const total = top.reduce((s, v) => s + v, 0);
    const lastResult = data.results && data.results.length ? data.results[data.results.length - 1] : null;
    return {
      name,
      total,
      participations: data.results ? data.results.length : 0,
      lastDeck: lastResult ? lastResult.deck : "",
    };
  });
  rows.sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));

  const history = computeStandingsHistory(leagueData, topN);
  const previous = history.length > 1 ? history[history.length - 2] : null;

  // Racha de 1er lugar: quién está arriba ahora y desde hace cuántos
  // torneos consecutivos ha estado en esa posición.
  let crownName = null;
  let crownStreak = 0;
  if (history.length) {
    const lastRanks = history[history.length - 1];
    crownName = Object.keys(lastRanks).find((n) => lastRanks[n] === 1) || null;
    if (crownName) {
      for (let i = history.length - 1; i >= 0; i--) {
        if (history[i][crownName] === 1) crownStreak++;
        else break;
      }
    }
  }

  return rows.map((r, i) => {
    const rank = i + 1;
    let trend = null;
    if (previous) {
      const prevRank = previous[r.name];
      if (prevRank != null && prevRank !== rank) {
        trend =
          prevRank > rank
            ? { direction: "up", delta: prevRank - rank }
            : { direction: "down", delta: rank - prevRank };
      }
    }
    return {
      ...r,
      rank,
      trend,
      crown: r.name === crownName && crownStreak > 0 ? crownStreak : null,
    };
  });
}

module.exports = { computeTournamentResults, computeStandings };

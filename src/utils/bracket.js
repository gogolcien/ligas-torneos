/* ==================================================================
   Eliminación directa — lógica pura (sin tocar la base de datos).
   Portado de la app ojamatching (lib/bracket.js).

   Reglas:
   - Ronda 1: pareo aleatorio. Si el número de jugadores es impar, uno
     al azar recibe AUTOWIN (bye_win) y avanza directo.
   - Cada mesa (excepto los AUTOWIN) admite solo 3 resultados:
     'a_win' | 'b_win' | 'double_loss'.
   - Quien pierde queda eliminado. Quien gana avanza al cruce que le
     corresponde en la siguiente ronda, según su posición fija en el
     bracket (slotIndex).
   - 'double_loss': ambos jugadores de esa mesa quedan eliminados. El
     rival que le tocaba enfrentar al ganador de esa mesa en la
     siguiente ronda pasa automáticamente con AUTOWIN.
   - El organizador puede reacomodar manualmente los cruces de
     cualquier ronda antes de capturar resultados (igual que el pareo
     manual del formato suizo).
   ================================================================== */

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Ronda 1: arma las mesas al azar. slotIndex 0..n-1 en el orden en
// que se van a jugar; si sobra un jugador, recibe AUTOWIN.
// Devuelve [{ slotIndex, playerAId, playerBId }] (playerBId null = AUTOWIN).
function generateFirstRound(players) {
  const shuffled = shuffle(players);
  const pairs = [];
  let slot = 0;
  while (shuffled.length >= 2) {
    const a = shuffled.shift();
    const b = shuffled.shift();
    pairs.push({ slotIndex: slot++, playerAId: a.id, playerBId: b.id });
  }
  if (shuffled.length === 1) {
    pairs.push({ slotIndex: slot++, playerAId: shuffled[0].id, playerBId: null });
  }
  return pairs;
}

// A partir de las mesas ya jugadas de una ronda (con resultado),
// calcula quién ganó cada una. Devuelve un mapa slotIndex -> playerId
// ganador, o null si esa mesa terminó en 'double_loss' (nadie avanza).
function winnersBySlot(matches) {
  const map = {};
  matches.forEach((m) => {
    if (m.playerBId == null) {
      map[m.slotIndex] = m.result === "bye_loss" ? null : m.playerAId;
      return;
    }
    if (m.result === "a_win") map[m.slotIndex] = m.playerAId;
    else if (m.result === "b_win") map[m.slotIndex] = m.playerBId;
    else map[m.slotIndex] = null; // double_loss, o pendiente
  });
  return map;
}

// True si a todas las mesas de la ronda ya se les capturó resultado.
function isRoundComplete(matches) {
  return matches.every((m) => m.result != null);
}

// A partir de las mesas ya jugadas de una ronda, calcula quién PERDIÓ
// cada una (para armar el partido por 3er lugar entre los dos
// perdedores de la semifinal). Ignora AUTOWIN (no hay perdedor real)
// y 'double_loss' (ambos ya quedaron eliminados, no hay a quién mandar
// a la mesa de 3er lugar desde esa semifinal).
function losersBySlot(matches) {
  const map = {};
  matches.forEach((m) => {
    if (m.playerBId == null) return;
    if (m.result === "a_win") map[m.slotIndex] = m.playerBId;
    else if (m.result === "b_win") map[m.slotIndex] = m.playerAId;
  });
  return map;
}

// Arma las mesas de la siguiente ronda combinando los ganadores de
// mesas consecutivas (slot 0 y 1 -> nueva mesa 0, slot 2 y 3 -> nueva
// mesa 1, etc). Si de un cruce solo sobrevive un jugador (por
// double_loss del otro), ese jugador avanza directo con AUTOWIN.
// Devuelve { pairs, championId }:
//   - pairs: [{ slotIndex, playerAId, playerBId }] para la nueva ronda
//   - championId: id del ganador del torneo, si esta ronda ya lo decidió
function generateNextRound(lastRoundMatches) {
  // Guarda de seguridad: si esta ronda ya es la Final (con o sin
  // partido de 3er lugar incluido), es TERMINAL — nunca se debe
  // generar una ronda siguiente a partir de ella. Se determina el
  // campeón directamente de la mesa que NO es de 3er lugar.
  if (lastRoundMatches.some((m) => m.isThirdPlace)) {
    const finalMatch = lastRoundMatches.find((m) => !m.isThirdPlace);
    let championId = null;
    if (finalMatch && finalMatch.result) {
      if (finalMatch.playerBId == null) championId = finalMatch.playerAId;
      else if (finalMatch.result === "a_win") championId = finalMatch.playerAId;
      else if (finalMatch.result === "b_win") championId = finalMatch.playerBId;
    }
    return { pairs: [], championId };
  }

  const winners = winnersBySlot(lastRoundMatches);
  const maxSlot = Math.max(...lastRoundMatches.map((m) => m.slotIndex));
  const ordered = [];
  for (let i = 0; i <= maxSlot; i++) ordered.push(winners[i] ?? null);

  if (ordered.length === 1) {
    return { pairs: [], championId: ordered[0] || null };
  }

  const pairs = [];
  let slot = 0;
  for (let i = 0; i < ordered.length; i += 2) {
    const a = ordered[i];
    const b = ordered[i + 1] ?? null;
    if (a == null && b == null) continue; // los dos cruces se cayeron por double_loss
    if (a != null && b != null) {
      pairs.push({ slotIndex: slot++, playerAId: a, playerBId: b });
    } else {
      // uno de los dos cruces anteriores quedó vacío: el sobreviviente
      // pasa directo con AUTOWIN.
      pairs.push({ slotIndex: slot++, playerAId: a ?? b, playerBId: null });
    }
  }

  if (pairs.length === 1 && pairs[0].playerBId == null) {
    return { pairs: [], championId: pairs[0].playerAId };
  }

  // Si la nueva ronda va a ser la FINAL (un solo cruce con dos
  // jugadores reales) y la ronda que se acaba de jugar tenía
  // exactamente 2 mesas (era la semifinal), se agrega automáticamente
  // el partido por el 3er lugar entre los dos perdedores de esa
  // semifinal, como una segunda mesa dentro de esta misma ronda final.
  if (pairs.length === 1 && pairs[0].playerBId != null && lastRoundMatches.length === 2) {
    const losers = losersBySlot(lastRoundMatches);
    const loserIds = [losers[0], losers[1]].filter((id) => id != null);
    if (loserIds.length === 2) {
      pairs.push({ slotIndex: slot++, playerAId: loserIds[0], playerBId: loserIds[1], isThirdPlace: true });
    }
  }

  return { pairs, championId: null };
}

// Standings de eliminación directa:
//   - El Top 4 se resuelve de forma explícita a partir de los
//     resultados de la Final y el partido por 3er lugar (Campeón,
//     Subcampeón, 3er y 4to lugar), no por "en qué ronda cayó".
//   - El resto de los eliminados se ordena por la ronda en que
//     cayeron (más lejos que llegaron = mejor posición) y los que
//     cayeron en la MISMA ronda quedan EMPATADOS en el mismo lugar
//     (ranking 1-2-2-4).
//   - Los que siguen en pie (torneo no terminado) van primero, sin
//     empatar entre ellos.
function computeEliminationStandings(players, rounds) {
  const eliminatedInRound = {};
  const podium = {}; // playerId -> 1 (campeón) | 2 | 3 | 4

  const sortedRounds = [...rounds].sort((a, b) => a.roundNumber - b.roundNumber);

  sortedRounds.forEach((round) => {
    round.matches.forEach((m) => {
      if (!m.result) return;
      if (m.playerBId == null) return; // AUTOWIN no elimina a nadie
      if (m.result === "a_win") eliminatedInRound[m.playerBId] = round.roundNumber;
      else if (m.result === "b_win") eliminatedInRound[m.playerAId] = round.roundNumber;
      else if (m.result === "double_loss") {
        eliminatedInRound[m.playerAId] = round.roundNumber;
        eliminatedInRound[m.playerBId] = round.roundNumber;
      }
    });
  });

  // Resolver el podio a partir de la última ronda jugada: su mesa que
  // NO es de 3er lugar es la Final (1ro/2do); su mesa marcada
  // isThirdPlace es el partido por 3er lugar (3ro/4to).
  const lastRound = sortedRounds[sortedRounds.length - 1];
  if (lastRound) {
    const finalMatch = lastRound.matches.find((m) => !m.isThirdPlace);
    const thirdMatch = lastRound.matches.find((m) => m.isThirdPlace);

    if (finalMatch && finalMatch.result && finalMatch.playerBId != null) {
      if (finalMatch.result === "a_win") {
        podium[finalMatch.playerAId] = 1;
        podium[finalMatch.playerBId] = 2;
      } else if (finalMatch.result === "b_win") {
        podium[finalMatch.playerBId] = 1;
        podium[finalMatch.playerAId] = 2;
      }
      // double_loss en la Final: nadie corona campeón; se ignora aquí.
    }

    if (thirdMatch && thirdMatch.result && thirdMatch.playerBId != null) {
      if (thirdMatch.result === "a_win") {
        podium[thirdMatch.playerAId] = 3;
        podium[thirdMatch.playerBId] = 4;
      } else if (thirdMatch.result === "b_win") {
        podium[thirdMatch.playerBId] = 3;
        podium[thirdMatch.playerAId] = 4;
      }
    }
  }

  const rows = players.map((p) => ({
    id: p.id,
    name: p.name,
    deck: p.deck ?? null,
    enabled: p.enabled,
    eliminatedInRound: eliminatedInRound[p.id] ?? null, // null = sigue en pie o es el campeón
    podium: podium[p.id] ?? null, // 1-4 solo cuando ya se jugaron Final y 3er lugar
  }));

  rows.sort((a, b) => {
    // 1) Podio (1-4) ya resuelto siempre manda, en ese orden exacto.
    if (a.podium != null || b.podium != null) {
      if (a.podium == null) return 1;
      if (b.podium == null) return -1;
      return a.podium - b.podium;
    }
    // 2) Sigue en pie (aún no pierde ninguna mesa) antes que eliminados.
    if (a.eliminatedInRound == null && b.eliminatedInRound == null) return a.name.localeCompare(b.name);
    if (a.eliminatedInRound == null) return -1;
    if (b.eliminatedInRound == null) return 1;
    // 3) Eliminados normales: cayó en ronda más alta (más tarde) = mejor.
    return b.eliminatedInRound - a.eliminatedInRound || a.name.localeCompare(b.name);
  });

  // Asignar el lugar mostrado con ranking "1-2-2-4": los jugadores
  // empatados (misma ronda de eliminación) comparten el mismo número
  // de lugar; el siguiente grupo salta al índice real que le toca.
  let lastKey;
  let lastPosition = 0;
  return rows.map((r, i) => {
    const key =
      r.podium != null ? `podium-${r.podium}` :
      r.eliminatedInRound != null ? `round-${r.eliminatedInRound}` :
      `alive-${r.id}`;
    if (key !== lastKey) {
      lastPosition = i + 1;
      lastKey = key;
    }
    return { ...r, rank: lastPosition };
  });
}

module.exports = {
  generateFirstRound,
  generateNextRound,
  isRoundComplete,
  computeEliminationStandings,
};

/* ==================================================================
   Sistema de Pareos (Suizo) — frontend en JS puro, habla con /api/pareos.
   Reutiliza el mismo PIN de administrador que "Ligas Tecnocentro"
   (misma llave de localStorage y mismos endpoints /api/admin/*).
   ================================================================== */

const state = {
  tournaments: [],
  selectedId: null,
  data: null, // { id, name, players, rounds, standings }
  role: "user", // 'user' | 'admin'
  adminToken: localStorage.getItem("adminToken") || null,
  pinConfigured: null,
  tab: "pareos", // registro | pareos | standings
  modal: null, // 'newTournament' | 'pin' | 'editPlayer'
  newTournamentFormat: "swiss", // 'swiss' | 'elimination', elegido en el modal de nuevo torneo
  pinMode: null,
  formError: "",
  activeRoundId: null, // ronda que se está viendo en la pestaña Pareos
  manualMode: false,
  manualPairs: [], // [{ playerAId, playerBId }] mientras se edita el pareo manual
  editPlayerId: null,
  sidebarOpen: false, // contraído por defecto
  busy: null, // identificador de la acción de guardado/eliminación en curso (o null)
};

// true si el identificador de acción dado está actualmente en curso
function isBusy(id) {
  return state.busy === id;
}

function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

/* ---------------- API helpers ---------------- */
async function api(path, opts = {}) {
  const headers = { "Content-Type": "application/json", ...(opts.headers || {}) };
  if (state.adminToken) headers["x-admin-token"] = state.adminToken;
  const res = await fetch(path, { ...opts, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Error de red");
  return data;
}

/* ---------------- carga de datos ---------------- */
async function loadTournaments() {
  state.tournaments = await api("/api/pareos");
  if (!state.selectedId && state.tournaments.length) state.selectedId = state.tournaments[0].id;
}
async function loadSelectedTournament() {
  if (!state.selectedId) {
    state.data = null;
    return;
  }
  state.data = await api(`/api/pareos/${state.selectedId}`);
  const lastRound = state.data.rounds[state.data.rounds.length - 1];
  if (!state.activeRoundId || !state.data.rounds.some((r) => r.id === state.activeRoundId)) {
    state.activeRoundId = lastRound ? lastRound.id : null;
  }
}
async function refreshAdminStatus() {
  const s = await api("/api/admin/status");
  state.pinConfigured = s.pinConfigured;
}

async function boot() {
  await Promise.all([loadTournaments(), refreshAdminStatus()]);
  await loadSelectedTournament();
  render();
  checkSecretUrlParam();
}

// Acceso al modo administrador vía "?pijama" en la URL (igual que en
// Ligas Tecnocentro): no hay botón visible de "Modo consulta", solo se
// activa con el parámetro secreto. Una vez usado, se limpia de la URL.
function checkSecretUrlParam() {
  const params = new URLSearchParams(window.location.search);
  if (params.has("pijama") && state.role !== "admin") {
    params.delete("pijama");
    const newSearch = params.toString();
    const newUrl = window.location.pathname + (newSearch ? `?${newSearch}` : "") + window.location.hash;
    window.history.replaceState({}, "", newUrl);
    openAdminFlow();
  }
}

/* ---------------- acciones: torneo / navegación ---------------- */
async function selectTournament(id) {
  state.selectedId = id;
  state.tab = "pareos";
  state.activeRoundId = null;
  state.manualMode = false;
  render();
  await loadSelectedTournament();
  render();
}

async function deleteTournament(id) {
  if (!confirm("¿Eliminar este torneo por completo? Se borrarán todos sus jugadores, rondas y resultados. Esta acción no se puede deshacer.")) return;
  state.busy = `delete-tournament:${id}`;
  render();
  try {
    await api(`/api/pareos/${id}`, { method: "DELETE" });
    if (state.selectedId === id) {
      state.selectedId = null;
      state.data = null;
      state.activeRoundId = null;
    }
    await loadTournaments();
    if (!state.selectedId && state.tournaments.length) {
      await selectTournament(state.tournaments[0].id);
    }
  } catch (e) {
    state.formError = e.message;
  } finally {
    state.busy = null;
    render();
  }
}

function openAdminFlow() {
  if (state.role === "admin") {
    state.role = "user";
    render();
    return;
  }
  state.formError = "";
  state.modal = "pin";
  state.pinMode = state.pinConfigured ? "unlock" : "setup";
  render();
}

async function confirmPin(pin) {
  state.busy = "submit-pin";
  render();
  try {
    if (state.pinMode === "setup") {
      if (!pin || pin.trim().length < 4) throw new Error("Usa al menos 4 caracteres.");
      const { token } = await api("/api/admin/setup", { method: "POST", body: JSON.stringify({ pin }) });
      state.adminToken = token;
      localStorage.setItem("adminToken", token);
      state.pinConfigured = true;
    } else {
      const { token } = await api("/api/admin/login", { method: "POST", body: JSON.stringify({ pin }) });
      state.adminToken = token;
      localStorage.setItem("adminToken", token);
    }
    state.role = "admin";
    state.modal = null;
  } catch (e) {
    state.formError = e.message;
  } finally {
    state.busy = null;
    render();
  }
}

async function createTournament(name, format) {
  if (!name.trim()) return;
  state.busy = "submit-new-tournament";
  render();
  try {
    const t = await api("/api/pareos", { method: "POST", body: JSON.stringify({ name, format }) });
    state.modal = null;
    await loadTournaments();
    await selectTournament(t.id);
  } catch (e) {
    state.formError = e.message;
  } finally {
    state.busy = null;
    render();
  }
}

/* ---------------- acciones: jugadores ---------------- */
async function addPlayer(name, deck) {
  if (!name.trim()) return;
  state.busy = "add-player";
  render();
  try {
    state.data = await api(`/api/pareos/${state.selectedId}/players`, {
      method: "POST",
      body: JSON.stringify({ name, deck }),
    });
    const input = document.getElementById("new-player-name");
    const deckInput = document.getElementById("new-player-deck");
    if (input) input.value = "";
    if (deckInput) deckInput.value = "";
  } catch (e) {
    state.formError = e.message;
  } finally {
    state.busy = null;
    render();
  }
}

async function togglePlayerEnabled(playerId, enabled) {
  state.busy = `toggle-player:${playerId}`;
  render();
  try {
    state.data = await api(`/api/pareos/${state.selectedId}/players/${playerId}`, {
      method: "PUT",
      body: JSON.stringify({ enabled }),
    });
  } catch (e) {
    state.formError = e.message;
  } finally {
    state.busy = null;
    render();
  }
}

async function deletePlayer(playerId) {
  state.busy = `delete-player:${playerId}`;
  render();
  try {
    state.data = await api(`/api/pareos/${state.selectedId}/players/${playerId}`, { method: "DELETE" });
  } catch (e) {
    state.formError = e.message;
  } finally {
    state.busy = null;
    render();
  }
}

function openEditPlayer(playerId) {
  state.formError = "";
  state.editPlayerId = playerId;
  state.modal = "editPlayer";
  render();
}

async function submitEditPlayer(newName, newDeck) {
  state.busy = "submit-edit-player";
  render();
  try {
    if (!newName.trim()) throw new Error("Escribe el nombre.");
    state.data = await api(`/api/pareos/${state.selectedId}/players/${state.editPlayerId}`, {
      method: "PUT",
      body: JSON.stringify({ name: newName.trim(), deck: newDeck }),
    });
    state.modal = null;
    state.editPlayerId = null;
  } catch (e) {
    state.formError = e.message;
  } finally {
    state.busy = null;
    render();
  }
}

/* ---------------- acciones: pareos ---------------- */
async function pairNextRound() {
  state.busy = "pair-next-round";
  render();
  try {
    state.data = await api(`/api/pareos/${state.selectedId}/pair-next-round`, { method: "POST" });
    const lastRound = state.data.rounds[state.data.rounds.length - 1];
    state.activeRoundId = lastRound ? lastRound.id : null;
    state.manualMode = false;
  } catch (e) {
    state.formError = e.message;
  } finally {
    state.busy = null;
    render();
  }
}

async function finishTournament() {
  if (!confirm("¿Finalizar el torneo? Ya no se van a poder capturar más resultados.")) return;
  state.busy = "finish-tournament";
  render();
  try {
    state.data = await api(`/api/pareos/${state.selectedId}/status`, {
      method: "PUT",
      body: JSON.stringify({ status: "finished" }),
    });
  } catch (e) {
    state.formError = e.message;
  } finally {
    state.busy = null;
    render();
  }
}

async function clearRoundResults(roundId) {
  if (!confirm("¿Borrar todos los resultados registrados de esta ronda? Los AUTOWIN/AUTOLOSE no se tocan.")) return;
  state.busy = `clear-round-results:${roundId}`;
  render();
  try {
    state.data = await api(`/api/pareos/${state.selectedId}/rounds/${roundId}/clear-results`, { method: "POST" });
    state.manualMode = false;
  } catch (e) {
    state.formError = e.message;
  } finally {
    state.busy = null;
    render();
  }
}

function openManualPairing() {
  const round = state.data.rounds.find((r) => r.id === state.activeRoundId);
  if (!round) return;
  state.manualPairs = round.matches.map((m) => ({
    playerAId: m.playerAId,
    playerBId: m.playerBId,
    slotIndex: m.slotIndex,
    isThirdPlace: !!m.isThirdPlace,
  }));
  state.manualMode = true;
  state.formError = "";
  render();
}

function cancelManualPairing() {
  state.manualMode = false;
  render();
}

function manualSetPlayer(pairIndex, side, playerIdRaw) {
  const playerId = playerIdRaw === "" ? null : Number(playerIdRaw);
  state.manualPairs[pairIndex][side] = playerId;
}

function manualAddRow() {
  state.manualPairs.push({ playerAId: null, playerBId: null });
  render();
}

async function saveManualPairing() {
  state.busy = "save-manual-pairing";
  render();
  try {
    const round = state.data.rounds.find((r) => r.id === state.activeRoundId);
    const pairs = state.manualPairs.filter((p) => p.playerAId != null);
    const isElimination = state.data.format === "elimination";

    // Validación en cliente: cada jugador que debe aparecer en esta
    // ronda tiene que quedar exactamente una vez (como A o como B).
    // En suizo, ese universo es "todos los activos"; en eliminación,
    // es solo quien ya estaba parado en esta mesa antes de editar
    // (los eliminados de rondas previas no vuelven a aparecer).
    const requiredIds = isElimination
      ? [...new Set(round.matches.flatMap((m) => [m.playerAId, m.playerBId]).filter((id) => id != null))]
      : state.data.players.filter((p) => p.enabled).map((p) => p.id);
    const used = [];
    pairs.forEach((p) => {
      used.push(p.playerAId);
      if (p.playerBId != null) used.push(p.playerBId);
    });
    const missing = requiredIds.filter((id) => !used.includes(id));
    const dupes = used.filter((id, i) => used.indexOf(id) !== i);
    if (missing.length) throw new Error("Faltan jugadores por asignar en el pareo manual.");
    if (dupes.length) throw new Error("Hay un jugador repetido en más de una mesa.");

    state.data = await api(`/api/pareos/${state.selectedId}/rounds/${round.id}/pairings`, {
      method: "PUT",
      body: JSON.stringify({ pairs }),
    });
    state.manualMode = false;
  } catch (e) {
    state.formError = e.message;
  } finally {
    state.busy = null;
    render();
  }
}

async function setMatchResult(matchId, result) {
  state.busy = `set-result:${matchId}`;
  render();
  try {
    state.data = await api(`/api/pareos/${state.selectedId}/matches/${matchId}/result`, {
      method: "PUT",
      body: JSON.stringify({ result }),
    });
  } catch (e) {
    state.formError = e.message;
  } finally {
    state.busy = null;
    render();
  }
}

async function toggleAutolose(matchId) {
  state.busy = `set-result:${matchId}`;
  render();
  try {
    state.data = await api(`/api/pareos/${state.selectedId}/matches/${matchId}/toggle-autolose`, {
      method: "PUT",
    });
  } catch (e) {
    state.formError = e.message;
  } finally {
    state.busy = null;
    render();
  }
}

/* ==================================================================
   RENDER
   ================================================================== */
function render() {
  const app = document.getElementById("app");
  app.innerHTML = `
    ${renderHeader()}
    <div class="layout">
      ${renderSidebar()}
      <div class="main">
        ${state.data ? renderTournamentBody() : renderEmptyMain()}
      </div>
    </div>
    ${renderModal()}
  `;
  attachEvents();
}

function renderHeader() {
  return `
    <div class="header">
      <div class="brand"><img src="/favicon-32x32.png" alt="Ojama" width="24" height="24" style="border-radius:6px;vertical-align:middle" /> Pareos — Sistema Suizo</div>
      <div style="display:flex; gap:10px; align-items:center;">
        <a href="/" class="btn btn-ghost" style="text-decoration:none;">Inicio</a>
        <a href="/ligas" class="btn btn-ghost" style="text-decoration:none;">Ligas Tecnocentro</a>
        ${
          state.role === "admin"
            ? `<button class="btn btn-teal" data-action="toggle-admin">Modo administrador ✓</button>`
            : ""
        }
      </div>
    </div>
  `;
}

function renderSidebar() {
  const items = state.tournaments
    .map(
      (t) => `
      <div class="league-item-row">
        <button class="league-item ${t.id === state.selectedId ? "active" : ""}" data-action="select-tournament" data-id="${escapeAttr(t.id)}">
          ${escapeHtml(t.name)}
        </button>
        ${
          state.role === "admin"
            ? `<button class="mini-btn danger" data-action="delete-tournament" data-id="${escapeAttr(t.id)}" title="Eliminar torneo" ${isBusy(`delete-tournament:${t.id}`) ? "disabled" : ""}>${isBusy(`delete-tournament:${t.id}`) ? "…" : "🗑"}</button>`
            : ""
        }
      </div>
    `
    )
    .join("");

  const isOpen = state.sidebarOpen !== false;
  const selected = state.tournaments.find((t) => t.id === state.selectedId);
  return `
    <div class="sidebar ${isOpen ? "" : "collapsed"}">
      <div class="sidebar-head">
        <button class="sidebar-toggle" type="button" data-action="toggle-sidebar" aria-expanded="${isOpen}">
          <svg class="chevron ${isOpen ? "open" : ""}" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m9 18 6-6-6-6"/></svg>
          <span class="sidebar-title">Torneos</span>
          ${!isOpen && selected ? `<span class="sidebar-current mono">· ${escapeHtml(selected.name)}</span>` : ""}
        </button>
        ${state.role === "admin" ? `<button class="icon-btn" data-action="open-new-tournament" title="Nuevo torneo">➕</button>` : ""}
      </div>
      <div class="sidebar-body">
        ${state.tournaments.length ? items : `<div class="empty-hint">Todavía no hay torneos de pareos. ${state.role === "admin" ? "Crea uno con el botón +." : "Activa el modo administrador para crear uno."}</div>`}
      </div>
    </div>
  `;
}

function renderEmptyMain() {
  return `<div class="empty-cell">Selecciona o crea un torneo para ver sus pareos.</div>`;
}

function renderTournamentBody() {
  const d = state.data;
  return `
    <div class="league-head">
      <div>
        <h1 class="league-title">${escapeHtml(d.name)}</h1>
        <div class="league-sub">
          ${d.format === "elimination" ? '<span class="badge badge-gold">Eliminación directa</span>' : '<span class="badge badge-teal">Pareo suizo</span>'}
          · ${d.players.length} jugador(es) · ${d.rounds.length} ronda(s) jugada(s)
          ${d.status === "finished" ? ' · <span class="badge badge-dim">Finalizado</span>' : ""}
        </div>
      </div>
    </div>
    <div class="tabs">
      ${tabBtn("registro", "Registro")}
      ${tabBtn("pareos", "Pareos")}
      ${tabBtn("standings", "Standings")}
    </div>
    ${state.tab === "registro" ? renderRegistro() : ""}
    ${state.tab === "pareos" ? renderPareos() : ""}
    ${state.tab === "standings" ? renderStandings() : ""}
  `;
}

function tabBtn(id, label) {
  return `<button class="tab-btn ${state.tab === id ? "active" : ""}" data-action="select-tab" data-tab="${id}">${label}</button>`;
}

/* ---------------- Registro ---------------- */
function renderRegistro() {
  const d = state.data;
  const canDelete = d.rounds.length === 0;

  const rows = d.players
    .map(
      (p) => `
      <tr class="${p.enabled ? "" : "disabled-row"}">
        <td>${escapeHtml(p.name)}</td>
        <td style="color:#666;font-size:12.5px;">${p.deck ? escapeHtml(p.deck) : ""}</td>
        <td>${p.enabled ? '<span class="badge badge-teal">Habilitado</span>' : '<span class="badge badge-dim">Inhabilitado</span>'}</td>
        ${
          state.role === "admin"
            ? `<td class="text-right">
                <div class="row-actions" style="justify-content:flex-end;">
                  <button class="mini-btn" data-action="edit-player" data-id="${p.id}" title="Editar" ${isBusy(`toggle-player:${p.id}`) || isBusy(`delete-player:${p.id}`) ? "disabled" : ""}>✎</button>
                  <button class="mini-btn" data-action="toggle-player" data-id="${p.id}" data-enabled="${p.enabled ? "0" : "1"}" title="${isBusy(`toggle-player:${p.id}`) ? "Guardando…" : p.enabled ? "Inhabilitar" : "Rehabilitar"}" ${isBusy(`toggle-player:${p.id}`) ? "disabled" : ""}>${isBusy(`toggle-player:${p.id}`) ? "…" : p.enabled ? "⛔" : "↺"}</button>
                  <button class="mini-btn danger" data-action="delete-player" data-id="${p.id}" ${canDelete && !isBusy(`delete-player:${p.id}`) ? "" : "disabled"} title="${isBusy(`delete-player:${p.id}`) ? "Eliminando…" : canDelete ? "Eliminar" : "Solo antes de la ronda 1"}">${isBusy(`delete-player:${p.id}`) ? "…" : "🗑"}</button>
                </div>
              </td>`
            : ""
        }
      </tr>
    `
    )
    .join("");

  return `
    ${
      state.role === "admin"
        ? `
      <div class="card" style="padding:14px; margin-bottom:16px;">
        <label class="field-label">Agregar jugador</label>
        <div style="display:flex; gap:8px;">
          <input id="new-player-name" placeholder="Nombre o apodo" ${isBusy("add-player") ? "disabled" : ""} />
          <input id="new-player-deck" placeholder="Deck (opcional)" ${isBusy("add-player") ? "disabled" : ""} />
          <button class="btn btn-gold" data-action="add-player" ${isBusy("add-player") ? "disabled" : ""}>${isBusy("add-player") ? "Guardando…" : "Agregar"}</button>
        </div>
        ${d.rounds.length ? `<div class="hint-text" style="margin-top:8px;">El torneo ya inició: a un jugador nuevo se le asignará un AUTOWIN en la ronda actual.</div>` : ""}
        ${state.formError ? `<div class="modal-error">${escapeHtml(state.formError)}</div>` : ""}
      </div>
    `
        : ""
    }
    <div class="card card-fit">
      <table class="table-auto">
        <thead>
          <tr>
            <th>Jugador</th><th>Deck</th><th>Estado</th>
            ${state.role === "admin" ? `<th class="text-right">Acciones</th>` : ""}
          </tr>
        </thead>
        <tbody>
          ${rows || `<tr><td colspan="${state.role === "admin" ? 4 : 3}" class="empty-cell">Aún no hay jugadores registrados.</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
}

/* ---------------- Pareos ---------------- */
function playerById(id) {
  return state.data.players.find((p) => p.id === id);
}

function renderPareos() {
  const d = state.data;
  return d.format === "elimination" ? renderBracketPareos() : renderSwissPareos();
}

function renderSwissPareos() {
  const d = state.data;
  const lastRound = d.rounds[d.rounds.length - 1];
  const roundPending = lastRound && lastRound.matches.some((m) => m.playerBId != null && !m.result);
  const activeCount = d.players.filter((p) => p.enabled).length;

  const roundTabs = d.rounds
    .map(
      (r) => `<button class="round-tab-btn ${r.id === state.activeRoundId ? "active" : ""}" data-action="select-round" data-id="${r.id}">Ronda ${r.roundNumber}</button>`
    )
    .join("");

  const round = d.rounds.find((r) => r.id === state.activeRoundId);
  const isLastRound = round && lastRound && round.id === lastRound.id;

  // Los resultados (y el AUTOWIN/AUTOLOSE) se pueden corregir en
  // cualquier ronda, no solo en la última: los puntos y el OP%/OOP% de
  // los rivales se recalculan siempre a partir de todos los resultados
  // guardados. El pareo manual de mesas sí sigue limitado a la última
  // ronda (repartir jugadores en rondas ya cerradas no tendría sentido).
  let body;
  if (state.manualMode && isLastRound) {
    body = renderManualPairingEditor();
  } else if (round) {
    body = round.matches
      .map((m, idx) => renderMatchCard(m, idx + 1, true, { allowDraw: true }))
      .join("");
  } else {
    body = `<div class="empty-cell">Todavía no se ha pareado ninguna ronda.</div>`;
  }

  return `
    ${state.formError ? `<div class="modal-error" style="margin-bottom:10px;">${escapeHtml(state.formError)}</div>` : ""}
    ${
      state.role === "admin"
        ? `
      <div class="toolbar-actions" style="margin-bottom:16px;">
        <button class="btn btn-gold" data-action="pair-next-round" ${roundPending || activeCount < 2 || isBusy("pair-next-round") ? "disabled" : ""}>
          ${isBusy("pair-next-round") ? "Guardando…" : lastRound ? "Parear siguiente ronda" : "Parear Ronda 1"}
        </button>
        ${
          isLastRound && !state.manualMode
            ? `<button class="btn btn-ghost" data-action="open-manual-pairing" ${round && round.matches.some((m) => m.playerBId != null && m.result) ? "disabled title='Ya hay resultados registrados'" : ""}>Pareos manuales</button>`
            : ""
        }
        ${
          isLastRound && !state.manualMode && round && round.matches.some((m) => m.playerBId != null && m.result)
            ? `<button class="btn btn-ghost" data-action="clear-round-results" data-id="${round.id}" ${isBusy(`clear-round-results:${round.id}`) ? "disabled" : ""}>${isBusy(`clear-round-results:${round.id}`) ? "Eliminando…" : "Limpiar resultados de la ronda"}</button>`
            : ""
        }
      </div>
    `
        : ""
    }
    ${d.rounds.length ? `<div class="round-tabs">${roundTabs}</div>` : ""}
    ${body}
  `;
}

/* ---------------- Pareos: Eliminación directa (bracket) ---------------- */
function renderBracketPareos() {
  const d = state.data;
  const activeCount = d.players.filter((p) => p.enabled).length;
  const finished = d.status === "finished";

  if (!d.rounds.length) {
    return `
      ${state.formError ? `<div class="modal-error" style="margin-bottom:10px;">${escapeHtml(state.formError)}</div>` : ""}
      <div class="empty-cell">Todavía no se ha armado el bracket.</div>
      ${
        state.role === "admin"
          ? `<div class="toolbar-actions" style="margin-top:12px;"><button class="btn btn-gold" data-action="pair-next-round" ${activeCount < 2 || isBusy("pair-next-round") ? "disabled" : ""}>${isBusy("pair-next-round") ? "Guardando…" : "Sortear Ronda 1"}</button></div>`
          : ""
      }
    `;
  }

  const lastRound = d.rounds[d.rounds.length - 1];
  const round = d.rounds.find((r) => r.id === state.activeRoundId) || lastRound;
  const isLastRound = round.id === lastRound.id;
  const roundDone = round.matches.every((m) => m.result != null);

  // La ronda final trae 1 mesa (Final) o 2 (Final + partido por 3er
  // lugar). La mesa de Final es siempre la que NO está marcada como
  // 3er lugar.
  const finalMatch = round.matches.length <= 2 ? round.matches.find((m) => !m.isThirdPlace) : null;
  const isFinalRound = isLastRound && !!finalMatch && (round.matches.length === 1 || round.matches.some((m) => m.isThirdPlace));

  let championId = null;
  if (isFinalRound && finalMatch.result) {
    if (finalMatch.playerBId == null) championId = finalMatch.playerAId;
    else if (finalMatch.result === "a_win") championId = finalMatch.playerAId;
    else if (finalMatch.result === "b_win") championId = finalMatch.playerBId;
  }
  const champion = championId ? playerById(championId) : null;
  const doubleFinalLoss = isFinalRound && finalMatch.result === "double_loss";

  const roundTabs = d.rounds
    .map(
      (r) => `<button class="round-tab-btn ${r.id === round.id ? "active" : ""}" data-action="select-round" data-id="${r.id}">Ronda ${r.roundNumber}</button>`
    )
    .join("");

  let body;
  if (state.manualMode && isLastRound) {
    body = renderManualPairingEditor();
  } else {
    body = round.matches
      .map((m, idx) => renderMatchCard(m, idx + 1, !finished, { allowDraw: false, isFinalRound }))
      .join("");
  }

  return `
    ${state.formError ? `<div class="modal-error" style="margin-bottom:10px;">${escapeHtml(state.formError)}</div>` : ""}
    ${finished ? `<div class="finished-banner">Torneo finalizado — ya no se pueden capturar resultados.</div>` : ""}
    ${champion ? `<div class="champion-banner">🏆 Campeón: ${escapeHtml(champion.name)}</div>` : ""}
    ${doubleFinalLoss ? `<div class="champion-banner">Ambos finalistas perdieron: el torneo queda sin campeón.</div>` : ""}
    ${
      state.role === "admin" && !state.manualMode && !finished
        ? `
      <div class="toolbar-actions" style="margin-bottom:16px;">
        ${
          isLastRound && round.matches.some((m) => m.playerBId != null && m.result) === false
            ? `<button class="btn btn-ghost" data-action="open-manual-pairing">Pareos manuales</button>`
            : ""
        }
        ${
          isLastRound && roundDone && round.matches.length > 1 && !isFinalRound
            ? `<button class="btn btn-gold" data-action="pair-next-round" ${isBusy("pair-next-round") ? "disabled" : ""}>${isBusy("pair-next-round") ? "Guardando…" : "Avanzar a la siguiente ronda"}</button>`
            : ""
        }
        ${
          (champion || doubleFinalLoss)
            ? `<button class="btn btn-gold" data-action="finish-tournament" ${isBusy("finish-tournament") ? "disabled" : ""}>${isBusy("finish-tournament") ? "Guardando…" : "Finalizar torneo"}</button>`
            : ""
        }
      </div>
    `
        : ""
    }
    ${!state.manualMode && !isLastRound ? `<div class="bracket-hint">Estás viendo una ronda anterior.</div>` : ""}
    ${d.rounds.length > 1 ? `<div class="round-tabs">${roundTabs}</div>` : ""}
    ${body}
  `;
}

function renderMatchCard(m, tableNum, editable, opts = {}) {
  const allowDraw = opts.allowDraw !== false;
  const showStats = allowDraw; // solo el formato suizo trae Pts/OP%/OOP%
  const mesaLabel = m.isThirdPlace ? "🥉 Partido por el 3er lugar" : opts.isFinalRound ? "🏆 Final" : `Mesa ${tableNum}`;
  const a = playerById(m.playerAId);
  const isBye = m.playerBId == null;
  const busy = isBusy(`set-result:${m.id}`);

  if (isBye) {
    const isLoss = m.result === "bye_loss";
    return `
      <div class="pairing-card">
        <div class="pairing-table-num">${mesaLabel}</div>
        <div class="pairing-row">
          <div class="pairing-side ${isLoss ? "loss" : "win"}">
            <div class="pairing-side-name">${escapeHtml(a?.name || "?")}</div>
            ${
              showStats
                ? `<div class="pairing-side-stats">
              <span class="stat-full">Pts ${a?.points ?? 0} · OP% ${((a?.opPercent || 0) * 100).toFixed(1)}%</span>
              <span class="stat-compact">P ${a?.points ?? 0} · OP ${Math.round((a?.opPercent || 0) * 100)}%</span>
            </div>`
                : ""
            }
          </div>
          <div class="${isLoss ? "autolose-tag" : "autowin-tag"}">${isLoss ? "AUTOLOSE" : "AUTOWIN"}</div>
        </div>
        ${
          editable && state.role === "admin"
            ? `<div class="pairing-actions"><button class="btn btn-ghost" data-action="toggle-autolose" data-id="${m.id}" ${busy ? "disabled" : ""}>${busy ? "Guardando…" : `Convertir a ${isLoss ? "AUTOWIN" : "AUTOLOSE"}`}</button></div>`
            : ""
        }
      </div>
    `;
  }

  const b = playerById(m.playerBId);
  const aWin = m.result === "a_win";
  const bWin = m.result === "b_win";
  const doubleLoss = m.result === "double_loss";
  const draw = m.result === "draw";
  const sideClass = (isWin) => (draw ? "draw" : isWin ? "win" : doubleLoss ? "loss" : "");
  const canClick = editable && state.role === "admin" && !busy;

  return `
    <div class="pairing-card">
      <div class="pairing-table-num">${mesaLabel}</div>
      <div class="pairing-row">
        <div class="pairing-side ${sideClass(aWin)} ${canClick ? "clickable" : ""} ${busy ? "is-saving" : ""}" ${
          canClick
            ? `data-action="set-result" data-id="${m.id}" data-result="a_win" title="Marcar a ${escapeAttr(a?.name || "A")} como ganador"`
            : ""
        }>
          <div class="pairing-side-name">${escapeHtml(a?.name || "?")}</div>
          ${
            showStats
              ? `<div class="pairing-side-stats">
            <span class="stat-full">Pts ${a?.points ?? 0} · OP% ${((a?.opPercent || 0) * 100).toFixed(1)}% · OOP% ${((a?.oopPercent || 0) * 100).toFixed(1)}%</span>
            <span class="stat-compact">P ${a?.points ?? 0} · OP ${Math.round((a?.opPercent || 0) * 100)}% · OOP ${Math.round((a?.oopPercent || 0) * 100)}%</span>
          </div>`
              : ""
          }
        </div>
        <div class="pairing-vs">${busy ? "Guardando…" : "VS"}</div>
        <div class="pairing-side ${sideClass(bWin)} ${canClick ? "clickable" : ""} ${busy ? "is-saving" : ""}" ${
          canClick
            ? `data-action="set-result" data-id="${m.id}" data-result="b_win" title="Marcar a ${escapeAttr(b?.name || "B")} como ganador"`
            : ""
        }>
          <div class="pairing-side-name">${escapeHtml(b?.name || "?")}</div>
          ${
            showStats
              ? `<div class="pairing-side-stats">
            <span class="stat-full">Pts ${b?.points ?? 0} · OP% ${((b?.opPercent || 0) * 100).toFixed(1)}% · OOP% ${((b?.oopPercent || 0) * 100).toFixed(1)}%</span>
            <span class="stat-compact">P ${b?.points ?? 0} · OP ${Math.round((b?.opPercent || 0) * 100)}% · OOP ${Math.round((b?.oopPercent || 0) * 100)}%</span>
          </div>`
              : ""
          }
        </div>
      </div>
      ${
        editable && state.role === "admin"
          ? `
        <div class="pairing-actions">
          ${
            allowDraw
              ? `<button class="btn ${draw ? "btn-gold" : "btn-ghost"}" data-action="set-result" data-id="${m.id}" data-result="draw" ${busy ? "disabled" : ""}>${busy ? "Guardando…" : "Empate"}</button>
          <div class="pairing-actions-spacer"></div>`
              : ""
          }
          <button class="btn ${doubleLoss ? "btn-danger" : "btn-ghost"}" data-action="set-result" data-id="${m.id}" data-result="double_loss" ${busy ? "disabled" : ""}>${busy ? "Guardando…" : "Ambos pierden"}</button>
        </div>
      `
          : ""
      }
    </div>
  `;
}

function renderManualPairingEditor() {
  const isElimination = state.data.format === "elimination";
  // En eliminación, la mesa manual solo puede reacomodar a quienes ya
  // estaban parados en esta ronda (no se puede meter a alguien
  // eliminado); en suizo, el universo es cualquier jugador activo.
  const poolIds = isElimination
    ? [...new Set(state.manualPairs.flatMap((p) => [p.playerAId, p.playerBId]).filter((id) => id != null))]
    : null;
  const pool = poolIds
    ? state.data.players.filter((p) => poolIds.includes(p.id))
    : state.data.players.filter((p) => p.enabled);

  const options = (selectedId) =>
    `<option value="">— AUTOWIN / vacío —</option>` +
    pool
      .map((p) => `<option value="${p.id}" ${p.id === selectedId ? "selected" : ""}>${escapeHtml(p.name)}</option>`)
      .join("");
  const optionsA = (selectedId) =>
    pool
      .map((p) => `<option value="${p.id}" ${p.id === selectedId ? "selected" : ""}>${escapeHtml(p.name)}</option>`)
      .join("");

  const rows = state.manualPairs
    .map(
      (p, idx) => `
      <div class="player-row" data-manual-row="${idx}">
        <div class="pos-index">${idx + 1}</div>
        <select data-manual-side="playerAId" data-manual-idx="${idx}">${optionsA(p.playerAId)}</select>
        <span class="pairing-vs">VS</span>
        <select data-manual-side="playerBId" data-manual-idx="${idx}">${options(p.playerBId)}</select>
      </div>
    `
    )
    .join("");

  return `
    <div class="card" style="padding:14px;">
      <div class="modal-note">
        ${
          isElimination
            ? "Reacomoda quién juega contra quién intercambiando jugadores entre mesas. El número de mesas y los AUTOWIN de esta ronda se mantienen igual."
            : 'Arma las mesas a tu gusto. Deja "AUTOWIN / vacío" del lado derecho para que ese jugador reciba un AUTOWIN.'
        }
      </div>
      ${rows}
      ${
        isElimination
          ? ""
          : `<div class="pairing-actions" style="margin-top:10px;">
        <button class="btn btn-ghost" data-action="manual-add-row">➕ Agregar mesa</button>
      </div>`
      }
      ${state.formError ? `<div class="modal-error">${escapeHtml(state.formError)}</div>` : ""}
      <div class="modal-actions">
        <button class="btn btn-ghost" data-action="cancel-manual-pairing" ${isBusy("save-manual-pairing") ? "disabled" : ""}>Cancelar</button>
        <button class="btn btn-gold" data-action="save-manual-pairing" ${isBusy("save-manual-pairing") ? "disabled" : ""}>${isBusy("save-manual-pairing") ? "Guardando…" : "Guardar pareo manual"}</button>
      </div>
    </div>
  `;
}

/* ---------------- Standings ---------------- */
function renderStandings() {
  return state.data.format === "elimination" ? renderEliminationStandings() : renderSwissStandings();
}

function estadoEliminacionTexto(s) {
  if (s.podium === 1) return "🏆 Campeón";
  if (s.podium === 2) return "Subcampeón";
  if (s.podium === 3) return "3er lugar";
  if (s.podium === 4) return "4to lugar";
  if (s.eliminatedInRound != null) return `Eliminado en ronda ${s.eliminatedInRound}`;
  return "Sigue en pie";
}

function renderSwissStandings() {
  const rows = state.data.standings
    .map(
      (s) => `
      <tr class="${s.enabled ? "" : "disabled-row"}">
        <td class="mono">${s.rank}</td>
        <td>${escapeHtml(s.name)}</td>
        <td class="text-center mono">${s.points}</td>
        <td class="text-right mono">${(s.opPercent * 100).toFixed(1)}%</td>
        <td class="text-right mono">${(s.oopPercent * 100).toFixed(1)}%</td>
        <td class="text-center mono">${s.sl}</td>
        <td style="color:var(--ink-dim); font-size:12.5px;">${s.enabled ? "Habilitado" : "Inhabilitado"}</td>
        <td style="color:var(--ink-dim); font-size:12.5px;">${s.deck ? escapeHtml(s.deck) : ""}</td>
      </tr>
    `
    )
    .join("");

  return `
    <div style="display:flex; justify-content:flex-end; gap:8px; margin-bottom:10px;">
      <button class="btn btn-ghost" data-action="export-standings-pdf" title="Genera un PDF listo para imprimir">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>
        <span>Standings PDF</span>
      </button>
      <button class="btn btn-ghost" data-action="copy-standings-names" title="Copia solo los nombres, en orden de posición">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        <span>Copiar nombres</span>
      </button>
    </div>
    <div class="card card-fit">
      <table class="table-auto">
        <thead>
          <tr><th>#</th><th>Jugador</th><th class="text-center">Pts</th><th class="text-right">OP%</th><th class="text-right">OOP%</th><th class="text-center">SL</th><th>Estado</th><th>Deck</th></tr>
        </thead>
        <tbody>${rows || `<tr><td colspan="8" class="empty-cell">Sin datos todavía.</td></tr>`}</tbody>
      </table>
    </div>
  `;
}

function renderEliminationStandings() {
  const rows = state.data.standings
    .map(
      (s) => `
      <tr class="${s.enabled ? "" : "disabled-row"}">
        <td class="mono">${s.rank}</td>
        <td>${escapeHtml(s.name)}</td>
        <td style="color:var(--ink-dim); font-size:12.5px;">${s.deck ? escapeHtml(s.deck) : ""}</td>
        <td>${estadoEliminacionTexto(s)}</td>
      </tr>
    `
    )
    .join("");

  return `
    <div style="display:flex; justify-content:flex-end; gap:8px; margin-bottom:10px;">
      <button class="btn btn-ghost" data-action="export-standings-pdf" title="Genera un PDF listo para imprimir">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>
        <span>Standings PDF</span>
      </button>
      <button class="btn btn-ghost" data-action="copy-standings-names" title="Copia solo los nombres, en orden de posición">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        <span>Copiar nombres</span>
      </button>
    </div>
    <div class="card card-fit">
      <table class="table-auto">
        <thead>
          <tr><th>#</th><th>Jugador</th><th>Deck</th><th>Estado</th></tr>
        </thead>
        <tbody>${rows || `<tr><td colspan="4" class="empty-cell">Sin datos todavía.</td></tr>`}</tbody>
      </table>
    </div>
  `;
}

// Abre una ventana nueva con una versión imprimible del standings y
// dispara el diálogo de impresión del navegador (el usuario elige
// "Guardar como PDF" ahí). No requiere librerías extra.
function exportStandingsPdf() {
  const d = state.data;
  const isElimination = d.format === "elimination";
  const now = new Date().toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" });

  const theadHtml = isElimination
    ? `<tr><th>#</th><th>Jugador</th><th>Deck</th><th>Estado</th></tr>`
    : `<tr><th>#</th><th>Jugador</th><th style="text-align:center;">Pts</th><th style="text-align:center;">OP%</th><th style="text-align:center;">OOP%</th><th style="text-align:center;">SL</th><th>Estado</th><th>Deck</th></tr>`;

  const rowsHtml = d.standings
    .map((s) => {
      if (isElimination) {
        return `<tr>
          <td style="width:32px;font-weight:700;">${s.rank}</td>
          <td style="width:34%;">${escapeHtml(s.name)}</td>
          <td style="width:22%;color:#666;font-size:10.5px;">${s.deck ? escapeHtml(s.deck) : ""}</td>
          <td style="color:#666;font-size:10.5px;">${estadoEliminacionTexto(s)}</td>
        </tr>`;
      }
      return `<tr>
        <td style="width:32px;font-weight:700;">${s.rank}</td>
        <td style="width:26%;">${escapeHtml(s.name)}</td>
        <td style="width:40px;text-align:center;font-weight:700;">${s.points}</td>
        <td style="width:56px;text-align:center;">${(s.opPercent * 100).toFixed(2)}%</td>
        <td style="width:56px;text-align:center;">${(s.oopPercent * 100).toFixed(2)}%</td>
        <td style="width:40px;text-align:center;">${s.sl}</td>
        <td style="width:22%;color:#666;font-size:10.5px;">${s.enabled ? "Habilitado" : "Inhabilitado"}</td>
        <td style="width:18%;color:#666;font-size:10.5px;">${s.deck ? escapeHtml(s.deck) : ""}</td>
      </tr>`;
    })
    .join("");

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8" />
<title>Standings — ${escapeHtml(d.name)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #1a1a1a; padding: 28px; }
  h1 { font-size: 18px; margin: 0 0 2px; }
  .meta { font-size: 11px; color: #777; margin-bottom: 18px; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-size: 10.5px; text-transform: uppercase; letter-spacing: .04em; color: #777; border-bottom: 2px solid #ddd; padding: 6px 8px; }
  td { padding: 7px 8px; border-bottom: 1px solid #eee; font-size: 12.5px; vertical-align: top; }
  @media print { body { padding: 0; } }
</style>
</head>
<body>
  <h1>${escapeHtml(d.name)}</h1>
  <div class="meta">Standings (${isElimination ? "eliminación directa" : "pareo suizo"}) · Generado el ${escapeHtml(now)}</div>
  <table>
    <thead>${theadHtml}</thead>
    <tbody>${rowsHtml}</tbody>
  </table>
  <script>window.onload = function () { window.print(); };</script>
</body>
</html>`;

  const w = window.open("", "_blank");
  if (!w) {
    alert("El navegador bloqueó la ventana emergente. Habilítala para exportar el PDF.");
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
}

// Copia solo los nombres del standings, uno por línea y en el mismo
// orden (posición) en que se muestran, para pegarlos directo en la
// parte de liga.
async function copyStandingsNames(buttonEl) {
  const rows = (state.data && state.data.standings) || [];
  const text = rows.map((s) => s.name).join("\n");
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
  } catch (e) {
    // Algunos navegadores/bloqueadores no permiten navigator.clipboard
    // (ej. sin HTTPS o sin foco): fallback con un textarea oculto.
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); } catch (e2) { /* silencioso */ }
    document.body.removeChild(ta);
  }
  if (buttonEl) {
    const label = buttonEl.querySelector("span");
    const original = label ? label.textContent : null;
    if (label) label.textContent = "¡Copiado!";
    setTimeout(() => {
      if (label && original != null) label.textContent = original;
    }, 1400);
  }
}

/* ---------------- modales ---------------- */
function renderModal() {
  if (!state.modal) return "";

  if (state.modal === "newTournament") {
    return modalShell(
      "Nuevo torneo de pareos",
      `
      <label class="field-label">Nombre del torneo</label>
      <input id="m-t-name" placeholder="Ej. Regional de Verano" ${isBusy("submit-new-tournament") ? "disabled" : ""} />
      <label class="field-label" style="margin-top:10px;">Formato</label>
      <div class="format-choice">
        <label class="format-option ${state.newTournamentFormat === "swiss" ? "active" : ""}">
          <input type="radio" name="m-t-format" value="swiss" data-action-change="set-new-tournament-format" ${state.newTournamentFormat === "swiss" ? "checked" : ""} ${isBusy("submit-new-tournament") ? "disabled" : ""} />
          Pareo suizo
        </label>
        <label class="format-option ${state.newTournamentFormat === "elimination" ? "active" : ""}">
          <input type="radio" name="m-t-format" value="elimination" data-action-change="set-new-tournament-format" ${state.newTournamentFormat === "elimination" ? "checked" : ""} ${isBusy("submit-new-tournament") ? "disabled" : ""} />
          Eliminación directa
        </label>
      </div>
      ${state.formError ? `<div class="modal-error">${escapeHtml(state.formError)}</div>` : ""}
      <div class="modal-actions">
        <button class="btn btn-ghost" data-action="close-modal" ${isBusy("submit-new-tournament") ? "disabled" : ""}>Cancelar</button>
        <button class="btn btn-gold" data-action="submit-new-tournament" ${isBusy("submit-new-tournament") ? "disabled" : ""}>${isBusy("submit-new-tournament") ? "Guardando…" : "Crear"}</button>
      </div>
    `
    );
  }

  if (state.modal === "editPlayer") {
    const p = playerById(state.editPlayerId);
    return modalShell(
      "Editar jugador",
      `
      <label class="field-label">Nombre</label>
      <input id="m-edit-player-name" value="${escapeAttr(p?.name || "")}" ${isBusy("submit-edit-player") ? "disabled" : ""} />
      <label class="field-label" style="margin-top:10px;">Deck</label>
      <input id="m-edit-player-deck" value="${escapeAttr(p?.deck || "")}" placeholder="Opcional" ${isBusy("submit-edit-player") ? "disabled" : ""} />
      ${state.formError ? `<div class="modal-error">${escapeHtml(state.formError)}</div>` : ""}
      <div class="modal-actions">
        <button class="btn btn-ghost" data-action="close-modal" ${isBusy("submit-edit-player") ? "disabled" : ""}>Cancelar</button>
        <button class="btn btn-gold" data-action="submit-edit-player" ${isBusy("submit-edit-player") ? "disabled" : ""}>${isBusy("submit-edit-player") ? "Guardando…" : "Guardar"}</button>
      </div>
    `
    );
  }

  if (state.modal === "pin") {
    const pinBusyLabel = state.pinMode === "setup" ? "Guardando…" : "Verificando…";
    return modalShell(
      state.pinMode === "setup" ? "Configura el PIN de administrador" : "Modo administrador",
      `
      ${state.pinMode === "setup" ? `<div class="modal-note">Este PIN se comparte con "Ligas Tecnocentro": es el mismo PIN de administrador para todo el sitio.</div>` : ""}
      <label class="field-label">PIN</label>
      <input id="m-pin" type="password" ${isBusy("submit-pin") ? "disabled" : ""} />
      ${state.formError ? `<div class="modal-error">${escapeHtml(state.formError)}</div>` : ""}
      <div class="modal-actions">
        <button class="btn btn-ghost" data-action="close-modal" ${isBusy("submit-pin") ? "disabled" : ""}>Cancelar</button>
        <button class="btn btn-gold" data-action="submit-pin" ${isBusy("submit-pin") ? "disabled" : ""}>${isBusy("submit-pin") ? pinBusyLabel : (state.pinMode === "setup" ? "Guardar PIN" : "Entrar")}</button>
      </div>
    `
    );
  }

  return "";
}

function modalShell(title, body) {
  return `
    <div class="modal-overlay" data-action="overlay-close">
      <div class="modal-box" data-stop>
        <div class="modal-head">
          <div class="modal-title">${escapeHtml(title)}</div>
          <button class="icon-btn" data-action="close-modal">✕</button>
        </div>
        ${body}
      </div>
    </div>
  `;
}

/* ---------------- helpers de escape ---------------- */
function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function escapeAttr(str) {
  return escapeHtml(str);
}

/* ==================================================================
   EVENTOS
   ================================================================== */
function attachEvents() {
  const app = document.getElementById("app");

  app.querySelectorAll("[data-action]").forEach((el) => {
    el.addEventListener("click", async (e) => {
      if (el.dataset.action === "overlay-close" && e.target !== el) return;
      const action = el.dataset.action;
      state.formError = "";

      switch (action) {
        case "toggle-admin":
          openAdminFlow();
          break;
        case "select-tournament":
          await selectTournament(el.dataset.id);
          break;
        case "toggle-sidebar":
          state.sidebarOpen = !state.sidebarOpen;
          render();
          break;
        case "select-tab":
          state.tab = el.dataset.tab;
          state.manualMode = false;
          render();
          break;
        case "select-round":
          state.activeRoundId = Number(el.dataset.id);
          state.manualMode = false;
          render();
          break;
        case "copy-standings-names":
          await copyStandingsNames(el);
          break;
        case "export-standings-pdf":
          exportStandingsPdf();
          break;
        case "delete-tournament":
          await deleteTournament(el.dataset.id);
          break;
        case "open-new-tournament":
          state.modal = "newTournament";
          state.newTournamentFormat = "swiss";
          render();
          break;
        case "add-player": {
          const input = document.getElementById("new-player-name");
          const deckInput = document.getElementById("new-player-deck");
          await addPlayer(input ? input.value : "", deckInput ? deckInput.value : "");
          break;
        }
        case "edit-player":
          openEditPlayer(Number(el.dataset.id));
          break;
        case "toggle-player":
          await togglePlayerEnabled(Number(el.dataset.id), el.dataset.enabled === "1");
          break;
        case "delete-player":
          await deletePlayer(Number(el.dataset.id));
          break;
        case "pair-next-round":
          await pairNextRound();
          break;
        case "finish-tournament":
          await finishTournament();
          break;
        case "clear-round-results":
          await clearRoundResults(Number(el.dataset.id));
          break;
        case "open-manual-pairing":
          openManualPairing();
          break;
        case "cancel-manual-pairing":
          cancelManualPairing();
          break;
        case "manual-add-row":
          manualAddRow();
          break;
        case "save-manual-pairing":
          await saveManualPairing();
          break;
        case "set-result":
          await setMatchResult(Number(el.dataset.id), el.dataset.result);
          break;
        case "toggle-autolose":
          await toggleAutolose(Number(el.dataset.id));
          break;
        case "close-modal":
        case "overlay-close":
          state.modal = null;
          render();
          break;
        case "submit-new-tournament": {
          const name = document.getElementById("m-t-name").value;
          await createTournament(name, state.newTournamentFormat);
          break;
        }
        case "submit-edit-player": {
          const name = document.getElementById("m-edit-player-name").value;
          const deck = document.getElementById("m-edit-player-deck").value;
          await submitEditPlayer(name, deck);
          break;
        }
        case "submit-pin": {
          const pin = document.getElementById("m-pin").value;
          await confirmPin(pin);
          break;
        }
      }
    });
  });

  // selects del pareo manual
  app.querySelectorAll("[data-manual-side]").forEach((el) => {
    el.addEventListener("change", (e) => {
      const idx = Number(el.dataset.manualIdx);
      manualSetPlayer(idx, el.dataset.manualSide, e.target.value);
    });
  });

  // radios del formato de torneo nuevo
  app.querySelectorAll("[data-action-change]").forEach((el) => {
    el.addEventListener("change", (e) => {
      if (el.dataset.actionChange === "set-new-tournament-format") {
        state.newTournamentFormat = e.target.value;
        render();
      }
    });
  });

  // Enter para confirmar PIN
  const pinInput = document.getElementById("m-pin");
  if (pinInput) pinInput.addEventListener("keydown", (e) => { if (e.key === "Enter") confirmPin(pinInput.value); });

  // Enter para agregar jugador
  const newPlayerInput = document.getElementById("new-player-name");
  const newPlayerDeckInput = document.getElementById("new-player-deck");
  if (newPlayerInput && newPlayerDeckInput) {
    const addOnEnter = (e) => { if (e.key === "Enter") addPlayer(newPlayerInput.value, newPlayerDeckInput.value); };
    newPlayerInput.addEventListener("keydown", addOnEnter);
    newPlayerDeckInput.addEventListener("keydown", addOnEnter);
  }

  // Enter para guardar edición de jugador
  const editNameInput = document.getElementById("m-edit-player-name");
  const editDeckInput = document.getElementById("m-edit-player-deck");
  if (editNameInput && editDeckInput) {
    const submitOnEnter = (e) => {
      if (e.key === "Enter") submitEditPlayer(editNameInput.value, editDeckInput.value);
    };
    editNameInput.addEventListener("keydown", submitOnEnter);
    editDeckInput.addEventListener("keydown", submitOnEnter);
  }
}

boot();
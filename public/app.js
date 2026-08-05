/* ==================================================================
   Actas de Liga — frontend en JS puro, habla con la API en /api/*
   ================================================================== */

const state = {
  leagues: [],
  selectedId: null,
  leagueData: null, // { id, name, topN, tournaments, players, standings }
  role: "user", // 'user' | 'admin'
  adminToken: localStorage.getItem("adminToken") || null,
  pinConfigured: null,
  tab: "standings", // standings | tournaments | add
  detailTournamentId: null,
  step: "form", // form | review  (dentro de "add")
  tName: "",
  tDate: new Date().toISOString().slice(0, 10),
  rows: [emptyRow(), emptyRow()],
  reviewRows: [],
  modal: null, // 'newLeague' | 'settings' | 'pin' | 'rename' | 'editTournament'
  pinMode: null, // 'setup' | 'unlock'
  renameOldName: null,
  editTournamentId: null,
  editTournamentName: "",
  editTournamentDate: "",
  editingParticipants: false, // true = mostrando el editor de jugadores del torneo abierto
  epRows: [], // filas del editor de jugadores: { id, name, deck }
  formError: "",
};

function emptyRow() {
  return { id: uid(), name: "", deck: "" };
}
function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

// El deck es opcional: si viene vacío se guarda como null (no como "").
function normalizeDeck(deck) {
  const d = (deck || "").trim();
  return d ? d : null;
}

// Convierte texto pegado (un jugador por línea, deck opcional tras una
// coma) en filas listas para agregarse a la lista de participantes.
// El orden de las líneas se respeta: la primera línea queda primero.
function parsePasteText(text) {
  return (text || "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const [namePart, ...rest] = line.split(",");
      return { id: uid(), name: (namePart || "").trim(), deck: rest.join(",").trim() };
    })
    .filter((r) => r.name);
}

/* ---------------- utilidades de comparación de nombres ---------------- */
function normalize(s) {
  return (s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}
function levenshtein(a, b) {
  a = a || ""; b = b || "";
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}
function similarity(a, b) {
  const na = normalize(a), nb = normalize(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const dist = levenshtein(na, nb);
  return 1 - dist / Math.max(na.length, nb.length);
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
async function loadLeagues() {
  state.leagues = await api("/api/leagues");
  if (!state.selectedId && state.leagues.length) state.selectedId = state.leagues[0].id;
}
async function loadSelectedLeague() {
  if (!state.selectedId) { state.leagueData = null; return; }
  state.leagueData = await api(`/api/leagues/${state.selectedId}`);
}
async function refreshAdminStatus() {
  const s = await api("/api/admin/status");
  state.pinConfigured = s.pinConfigured;
}

async function boot() {
  await Promise.all([loadLeagues(), refreshAdminStatus()]);
  await loadSelectedLeague();
  render();
  checkSecretUrlParam();
}

function checkSecretUrlParam() {
  const params = new URLSearchParams(window.location.search);
  if (params.has("pijama") && state.role !== "admin") {
    // Limpia el parámetro de la URL para que no quede visible en el
    // historial ni al compartir el link.
    params.delete("pijama");
    const newSearch = params.toString();
    const newUrl = window.location.pathname + (newSearch ? `?${newSearch}` : "") + window.location.hash;
    window.history.replaceState({}, "", newUrl);
    openAdminFlow();
  }
}

/* ---------------- acciones ---------------- */
async function selectLeague(id) {
  state.selectedId = id;
  state.tab = "standings";
  state.detailTournamentId = null;
  state.step = "form";
  render();
  await loadSelectedLeague();
  render();
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
    render();
  } catch (e) {
    state.formError = e.message;
    render();
  }
}

async function createLeague(name, topN) {
  if (!name.trim()) return;
  try {
    const league = await api("/api/leagues", { method: "POST", body: JSON.stringify({ name, topN }) });
    state.modal = null;
    await loadLeagues();
    await selectLeague(league.id);
  } catch (e) {
    state.formError = e.message;
    render();
  }
}

async function saveTopN(topN) {
  try {
    await api(`/api/leagues/${state.selectedId}`, { method: "PUT", body: JSON.stringify({ topN }) });
    state.modal = null;
    await loadLeagues();
    await loadSelectedLeague();
    render();
  } catch (e) {
    state.formError = e.message;
    render();
  }
}

function openRename(name) {
  state.formError = "";
  state.renameOldName = name;
  state.modal = "rename";
  render();
}

async function submitRename(newName) {
  try {
    if (!newName.trim()) throw new Error("Escribe el nombre corregido.");
    await api(`/api/leagues/${state.selectedId}/players/rename`, {
      method: "POST",
      body: JSON.stringify({ oldName: state.renameOldName, newName }),
    });
    state.modal = null;
    state.renameOldName = null;
    await loadSelectedLeague();
    render();
  } catch (e) {
    state.formError = e.message;
    render();
  }
}

function openEditTournament(id) {
  const t = (state.leagueData.tournaments || []).find((x) => x.id === id);
  if (!t) return;
  state.formError = "";
  state.editTournamentId = id;
  state.editTournamentName = t.name;
  state.editTournamentDate = t.date;
  state.modal = "editTournament";
  render();
}

async function submitEditTournament(name, date) {
  try {
    if (!name.trim()) throw new Error("El nombre del torneo no puede quedar vacío.");
    await api(`/api/leagues/${state.selectedId}/tournaments/${state.editTournamentId}`, {
      method: "PUT",
      body: JSON.stringify({ name, date }),
    });
    state.modal = null;
    state.editTournamentId = null;
    await loadSelectedLeague();
    render();
  } catch (e) {
    state.formError = e.message;
    render();
  }
}

function openEditParticipants() {
  const t = (state.leagueData.tournaments || []).find((x) => x.id === state.detailTournamentId);
  if (!t) return;
  state.formError = "";
  state.epRows = t.participants
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((p) => ({ id: uid(), name: p.name, deck: p.deck || "" }));
  state.editingParticipants = true;
  render();
}

function closeEditParticipants() {
  state.editingParticipants = false;
  state.epRows = [];
  state.formError = "";
  render();
}

function moveEpRow(id, dir) {
  const i = state.epRows.findIndex((r) => r.id === id);
  const j = i + dir;
  if (j < 0 || j >= state.epRows.length) return;
  [state.epRows[i], state.epRows[j]] = [state.epRows[j], state.epRows[i]];
  render();
}

async function saveParticipants() {
  const participants = state.epRows.filter((r) => r.name.trim());
  if (!participants.length) {
    state.formError = "Se necesita al menos un jugador.";
    render();
    return;
  }
  try {
    await api(`/api/leagues/${state.selectedId}/tournaments/${state.detailTournamentId}/participants`, {
      method: "PUT",
      body: JSON.stringify({
        participants: participants.map((r) => ({ name: r.name, deck: r.deck })),
      }),
    });
    state.editingParticipants = false;
    state.epRows = [];
    await loadSelectedLeague();
    render();
  } catch (e) {
    state.formError = e.message;
    render();
  }
}

function goToReview() {
  const clean = state.rows.filter((r) => r.name.trim());
  if (!clean.length) return;
  const existingNames = Object.keys(state.leagueData?.players || {});
  state.reviewRows = clean.map((r) => {
    const exact = existingNames.find((n) => normalize(n) === normalize(r.name));
    let candidates = [];
    if (!exact) {
      candidates = existingNames
        .map((n) => ({ name: n, score: similarity(r.name, n) }))
        .filter((c) => c.score >= 0.55)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3);
    }
    return { id: r.id, deck: normalizeDeck(r.deck), name: exact || r.name, candidates, isExact: !!exact };
  });
  state.step = "review";
  render();
}

async function saveTournament() {
  const participants = state.reviewRows.filter((r) => r.name.trim());
  if (!participants.length) return;
  try {
    const record = await api(`/api/leagues/${state.selectedId}/tournaments`, {
      method: "POST",
      body: JSON.stringify({
        name: state.tName,
        date: state.tDate,
        participants: participants.map((r) => ({ name: r.name, deck: r.deck })),
      }),
    });
    state.tName = "";
    state.tDate = new Date().toISOString().slice(0, 10);
    state.rows = [emptyRow(), emptyRow()];
    state.step = "form";
    state.tab = "tournaments";
    state.detailTournamentId = record.id;
    await loadSelectedLeague();
    render();
  } catch (e) {
    state.formError = e.message;
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
      <div class="main">${renderMain()}</div>
    </div>
    ${state.modal ? renderModal() : ""}
  `;
  attachEvents();
}

function trophySvg() {
  return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#d4a537" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 21h8"/><path d="M12 17v4"/><path d="M7 4h10v5a5 5 0 0 1-10 0V4Z"/><path d="M7 5H4a2 2 0 0 0 0 4h1.5"/><path d="M17 5h3a2 2 0 0 1 0 4h-1.5"/></svg>`;
}
function shieldSvg(on) {
  return on
    ? `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 12 2 2 4-4"/><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/></svg>`
    : `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/></svg>`;
}

function renderHeader() {
  return `
    <div class="header">
      <div class="brand">${trophySvg()} Actas de Liga</div>
      ${
        state.role === "admin"
          ? `<button class="btn btn-teal" data-action="toggle-admin">
               ${shieldSvg(true)} Modo administrador
             </button>`
          : ""
      }
    </div>
  `;
}

function renderSidebar() {
  const items = state.leagues
    .map(
      (l) => `<button class="league-item ${l.id === state.selectedId ? "active" : ""}" data-action="select-league" data-id="${l.id}">${escapeHtml(l.name)}</button>`
    )
    .join("");
  return `
    <div class="sidebar">
      <div class="sidebar-head">
        <span class="sidebar-title">Ligas</span>
        ${state.role === "admin" ? `<button class="icon-btn" title="Nueva liga" data-action="open-new-league"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg></button>` : ""}
      </div>
      ${state.leagues.length === 0
        ? `<div class="empty-hint">Aún no hay ligas.${state.role === "admin" ? " Crea la primera con el botón +." : " Pide a un administrador que cree una."}</div>`
        : `<div>${items}</div>`}
    </div>
  `;
}

function renderMain() {
  if (!state.selectedId) {
    return `<div class="empty-hint">Selecciona una liga para ver su información.</div>`;
  }
  const league = state.leagues.find((l) => l.id === state.selectedId);
  if (!league || !state.leagueData) return `<div class="empty-hint">Cargando…</div>`;

  const tabs = [
    { id: "standings", label: "Clasificación" },
    { id: "tournaments", label: "Torneos" },
    ...(state.role === "admin" ? [{ id: "add", label: "Agregar torneo" }] : []),
  ];

  return `
    <div class="league-head">
      <div>
        <h1 class="league-title">${escapeHtml(league.name)}</h1>
        <div class="league-sub">Se muestran los mejores <span class="mono" style="color:var(--gold)">${league.topN}</span> resultados por jugador · las ausencias cuentan como 0</div>
      </div>
      ${state.role === "admin" ? `<button class="icon-btn" title="Ajustes de la liga" data-action="open-settings"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 0 1-4 0v-.09A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.55-1H3a2 2 0 0 1 0-4h.09A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34H9a1.7 1.7 0 0 0 1-1.55V3a2 2 0 0 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87V9a1.7 1.7 0 0 0 1.55 1H21a2 2 0 0 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1Z"/></svg></button>` : ""}
    </div>

    <div class="tabs">
      ${tabs.map((t) => `<button class="tab-btn ${state.tab === t.id ? "active" : ""}" data-action="select-tab" data-tab="${t.id}">${escapeHtml(t.label)}</button>`).join("")}
    </div>

    ${state.tab === "standings" ? renderStandings(league) : ""}
    ${state.tab === "tournaments" ? renderTournaments() : ""}
    ${state.tab === "add" && state.role === "admin" ? renderAddTournament() : ""}
  `;
}

function renderTrendCell(s) {
  if (s.crown) {
    return `
      <span class="crown" title="Lleva ${s.crown} torneo${s.crown === 1 ? "" : "s"} en 1er lugar">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M3 19h18l-1.5-9-4.5 3.5L12 5l-3 8.5L4.5 10 3 19Z"/></svg>${s.crown}
      </span>`;
  }
  if (s.trend && s.trend.direction === "up") {
    return `
      <span class="trend trend-up" title="Subió ${s.trend.delta} puesto${s.trend.delta === 1 ? "" : "s"} desde la última actualización">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 19V5M5 12l7-7 7 7"/></svg>${s.trend.delta}
      </span>`;
  }
  if (s.trend && s.trend.direction === "down") {
    return `
      <span class="trend trend-down" title="Bajó ${s.trend.delta} puesto${s.trend.delta === 1 ? "" : "s"} desde la última actualización">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12l7 7 7-7"/></svg>${s.trend.delta}
      </span>`;
  }
  return "";
}

function renderStandings(league) {
  const rows = state.leagueData.standings || [];
  const canEdit = state.role === "admin";
  if (!rows.length) return `<div class="card"><div class="empty-cell">Todavía no hay jugadores en esta liga.</div></div>`;
  return `
    <div class="card">
      <table>
        <thead>
          <tr>
            <th style="width:48px">#</th>
            <th>Jugador</th>
            <th>Último deck</th>
            <th class="text-right">Participaciones</th>
            <th class="text-right">Puntos (top ${league.topN})</th>
            <th class="text-right trend-cell"></th>
            ${canEdit ? `<th style="width:36px"></th>` : ""}
          </tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (s, i) => `
            <tr>
              <td class="mono" style="color:${i === 0 ? "var(--gold)" : "var(--ink-dim)"};font-weight:600">${i + 1}</td>
              <td style="font-weight:600">${escapeHtml(s.name)}</td>
              <td style="color:var(--ink-dim)">${escapeHtml(s.lastDeck) || "—"}</td>
              <td class="mono text-right" style="color:var(--ink-dim)">${s.participations}</td>
              <td class="mono text-right" style="font-weight:700;color:var(--teal);font-size:14.5px">${s.total}</td>
              <td class="text-right trend-cell">${renderTrendCell(s)}</td>
              ${
                canEdit
                  ? `<td class="text-right"><button class="icon-btn" title="Corregir nombre" data-action="open-rename" data-name="${escapeAttr(s.name)}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg></button></td>`
                  : ""
              }
            </tr>`
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderTournaments() {
  if (state.detailTournamentId) return renderTournamentDetail();
  const list = [...(state.leagueData.tournaments || [])].reverse();
  if (!list.length) return `<div class="card"><div class="empty-cell">Aún no se han registrado torneos.</div></div>`;
  return `
    <div class="card">
      <table>
        <thead><tr><th>Torneo</th><th>Fecha</th><th class="text-right">Participantes</th><th></th></tr></thead>
        <tbody>
          ${list
            .map(
              (t) => `
            <tr class="clickable" data-action="open-tournament" data-id="${t.id}">
              <td style="font-weight:600">${escapeHtml(t.name)}</td>
              <td class="mono" style="color:var(--ink-dim)">${t.date}</td>
              <td class="mono text-right">${t.participants.length}</td>
              <td class="text-right" style="color:var(--ink-dim)">›</td>
            </tr>`
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderTournamentDetail() {
  const t = (state.leagueData.tournaments || []).find((x) => x.id === state.detailTournamentId);
  if (!t) return `<div class="empty-hint">Torneo no encontrado.</div>`;
  return `
    <button class="icon-btn" style="margin-bottom:14px;font-size:13px;gap:4px" data-action="close-tournament">‹ Volver a torneos</button>
    <div style="margin-bottom:14px;display:flex;align-items:center;justify-content:space-between">
      <div>
        <div style="font-family:'Fraunces',serif;font-size:19px;font-weight:600">${escapeHtml(t.name)}</div>
        <div class="mono" style="color:var(--ink-dim);font-size:12.5px">${t.date}</div>
      </div>
      ${
        state.role === "admin"
          ? `<div style="display:flex;gap:6px">
              <button class="icon-btn" title="Editar jugadores" data-action="open-edit-participants"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/></svg></button>
              <button class="icon-btn" title="Editar torneo" data-action="open-edit-tournament" data-id="${t.id}"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg></button>
            </div>`
          : ""
      }
    </div>
    ${state.editingParticipants ? renderEditParticipants() : renderParticipantsTable(t)}
  `;
}

function renderParticipantsTable(t) {
  return `
    <div class="card">
      <table>
        <thead><tr><th style="width:48px">Pos.</th><th>Jugador</th><th>Deck</th><th class="text-right">Puntos</th><th></th></tr></thead>
        <tbody>
          ${t.participants
            .map(
              (p) => `
            <tr>
              <td class="mono" style="color:${p.position === 0 ? "var(--gold)" : "var(--ink-dim)"};font-weight:600">${p.position}</td>
              <td style="font-weight:600">${escapeHtml(p.name)}</td>
              <td style="color:var(--ink-dim)">${escapeHtml(p.deck) || "—"}</td>
              <td class="mono text-right" style="font-weight:700;color:var(--teal)">+${p.points}</td>
              <td class="text-right">${p.isNew ? `<span class="badge badge-gold">Nuevo en la liga</span>` : ""}</td>
            </tr>`
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderEditParticipants() {
  return `
    <div class="card">
      <div class="hint-text" style="margin-bottom:12px;line-height:1.5">
        Corrige nombres, cambia el orden (la posición determina los puntos) o agrega/quita jugadores.
        Los cambios se reflejan de inmediato en la clasificación de la liga.
      </div>
      <label class="field-label">Jugadores, en orden de posición final (0 = primer lugar)</label>
      <div id="ep-rows-wrap">
        ${state.epRows
          .map(
            (r, i) => `
          <div class="player-row" data-ep-row="${r.id}">
            <div class="pos-index ${i === 0 ? "first" : ""}">${i}</div>
            <input placeholder="Nombre del jugador" data-ep-field="name" data-ep-row="${r.id}" value="${escapeAttr(r.name)}" />
            <input placeholder="Deck (opcional)" data-ep-field="deck" data-ep-row="${r.id}" value="${escapeAttr(r.deck)}" style="max-width:160px" />
            <div class="row-actions">
              <button class="mini-btn" data-action="ep-move-up" data-ep-row="${r.id}" ${i === 0 ? "disabled" : ""}>↑</button>
              <button class="mini-btn" data-action="ep-move-down" data-ep-row="${r.id}" ${i === state.epRows.length - 1 ? "disabled" : ""}>↓</button>
              <button class="mini-btn danger" data-action="ep-remove-row" data-ep-row="${r.id}" ${state.epRows.length <= 1 ? "disabled" : ""}>✕</button>
            </div>
          </div>`
          )
          .join("")}
      </div>
      <button class="btn btn-ghost" style="margin-top:10px" data-action="ep-add-row">+ Agregar jugador</button>

      ${state.formError ? `<div class="modal-error">${escapeHtml(state.formError)}</div>` : ""}

      <div style="margin-top:22px;display:flex;justify-content:flex-end;gap:10px">
        <button class="btn btn-ghost" data-action="ep-cancel">Cancelar</button>
        <button class="btn btn-gold" data-action="ep-save">✓ Guardar cambios</button>
      </div>
    </div>
  `;
}

function renderAddTournament() {
  if (state.step === "form") {
    return `
      <div style="max-width:640px">
        <div class="form-row">
          <div style="flex:2">
            <label class="field-label">Nombre del torneo</label>
            <input id="f-name" placeholder="Ej. Torneo de agosto" value="${escapeAttr(state.tName)}" />
          </div>
          <div style="flex:1">
            <label class="field-label">Fecha</label>
            <input id="f-date" type="date" value="${escapeAttr(state.tDate)}" />
          </div>
        </div>

        <label class="field-label">Pegar lista (opcional)</label>
        <textarea id="paste-area" class="paste-area" placeholder="Un jugador por línea, en orden. Opcional: agrega el deck separado por una coma.&#10;Ejemplo:&#10;Ana López, Control Azul&#10;Luis Meza&#10;Carla Ruiz, Aggro Rojo"></textarea>
        <div style="display:flex;justify-content:flex-end;margin:8px 0 18px">
          <button class="btn btn-ghost" data-action="parse-paste">Agregar jugadores desde la lista</button>
        </div>

        <label class="field-label">Jugadores, en orden de posición final (0 = primer lugar)</label>
        <div id="rows-wrap">
          ${state.rows
            .map(
              (r, i) => `
            <div class="player-row" data-row="${r.id}">
              <div class="pos-index ${i === 0 ? "first" : ""}">${i}</div>
              <input placeholder="Nombre del jugador" data-field="name" data-row="${r.id}" value="${escapeAttr(r.name)}" />
              <input placeholder="Deck (opcional)" data-field="deck" data-row="${r.id}" value="${escapeAttr(r.deck)}" style="max-width:160px" />
              <div class="row-actions">
                <button class="mini-btn" data-action="move-up" data-row="${r.id}" ${i === 0 ? "disabled" : ""}>↑</button>
                <button class="mini-btn" data-action="move-down" data-row="${r.id}" ${i === state.rows.length - 1 ? "disabled" : ""}>↓</button>
                <button class="mini-btn danger" data-action="remove-row" data-row="${r.id}" ${state.rows.length <= 1 ? "disabled" : ""}>✕</button>
              </div>
            </div>`
            )
            .join("")}
        </div>
        <button class="btn btn-ghost" style="margin-top:10px" data-action="add-row">+ Agregar jugador</button>

        ${state.formError ? `<div class="modal-error">${escapeHtml(state.formError)}</div>` : ""}

        <div style="margin-top:22px;display:flex;justify-content:flex-end">
          <button class="btn btn-gold" data-action="go-review">✦ Revisar coincidencias y guardar</button>
        </div>
      </div>
    `;
  }

  // step === review
  return `
    <div style="max-width:700px">
      <div class="hint-text" style="margin-bottom:14px;line-height:1.5">
        Compara cada nombre con los jugadores ya registrados en la liga para evitar duplicados por errores de escritura.
        Toca una sugerencia para corregir el nombre, o déjalo así si es un jugador nuevo.
      </div>
      ${state.reviewRows
        .map(
          (r, i) => `
        <div class="review-card">
          <div class="review-top">
            <div class="pos-index ${i === 0 ? "first" : ""}" style="width:18px">${i}</div>
            <input data-review-name="${r.id}" value="${escapeAttr(r.name)}" />
            ${r.isExact ? `<span class="badge badge-teal">✓ Existente</span>` : `<span class="badge badge-gold">Nuevo</span>`}
          </div>
          ${
            r.candidates && r.candidates.length
              ? `<div class="suggestions">
                  <span class="hint-text">¿Quisiste decir?</span>
                  ${r.candidates
                    .map(
                      (c) => `<button class="suggestion-chip" data-action="apply-candidate" data-row="${r.id}" data-name="${escapeAttr(c.name)}">${escapeHtml(c.name)} <span class="mono" style="color:var(--ink-dim)">· ${Math.round(c.score * 100)}%</span></button>`
                    )
                    .join("")}
                </div>`
              : ""
          }
        </div>`
        )
        .join("")}

      ${state.formError ? `<div class="modal-error">${escapeHtml(state.formError)}</div>` : ""}

      <div style="margin-top:22px;display:flex;justify-content:space-between">
        <button class="btn btn-ghost" data-action="back-to-form">‹ Volver</button>
        <button class="btn btn-gold" data-action="save-tournament">✓ Guardar torneo</button>
      </div>
    </div>
  `;
}

function renderModal() {
  if (state.modal === "newLeague") {
    return modalShell(
      "Nueva liga",
      `
      <label class="field-label">Nombre de la liga</label>
      <input id="m-name" placeholder="Ej. Liga de verano" />
      <div class="field-gap"></div>
      <label class="field-label">Mostrar los mejores N resultados por jugador</label>
      <input id="m-topn" type="number" min="1" value="5" />
      ${state.formError ? `<div class="modal-error">${escapeHtml(state.formError)}</div>` : ""}
      <div class="modal-actions">
        <button class="btn btn-ghost" data-action="close-modal">Cancelar</button>
        <button class="btn btn-gold" data-action="submit-new-league">Crear liga</button>
      </div>
    `
    );
  }
  if (state.modal === "settings") {
    const league = state.leagues.find((l) => l.id === state.selectedId);
    return modalShell(
      "Ajustes de la liga",
      `
      <label class="field-label">Mostrar los mejores N resultados por jugador</label>
      <input id="m-topn2" type="number" min="1" value="${league ? league.topN : 5}" />
      ${state.formError ? `<div class="modal-error">${escapeHtml(state.formError)}</div>` : ""}
      <div class="modal-actions">
        <button class="btn btn-ghost" data-action="close-modal">Cancelar</button>
        <button class="btn btn-gold" data-action="submit-settings">Guardar</button>
      </div>
    `
    );
  }
  if (state.modal === "rename") {
    return modalShell(
      "Corregir nombre",
      `
      <div class="modal-note">Este cambio se aplicará a todo el historial del jugador: su clasificación y todos los torneos donde participó quedarán con el nombre corregido. Si el nuevo nombre coincide con otro jugador ya existente, ambos se fusionarán en uno solo.</div>
      <label class="field-label">Nombre actual</label>
      <input value="${escapeAttr(state.renameOldName)}" disabled style="opacity:.6" />
      <div class="field-gap"></div>
      <label class="field-label">Nombre corregido</label>
      <input id="m-rename" value="${escapeAttr(state.renameOldName)}" />
      ${state.formError ? `<div class="modal-error">${escapeHtml(state.formError)}</div>` : ""}
      <div class="modal-actions">
        <button class="btn btn-ghost" data-action="close-modal">Cancelar</button>
        <button class="btn btn-gold" data-action="submit-rename">Guardar</button>
      </div>
    `
    );
  }
  if (state.modal === "editTournament") {
    return modalShell(
      "Editar torneo",
      `
      <label class="field-label">Nombre del torneo</label>
      <input id="m-t-name" value="${escapeAttr(state.editTournamentName)}" />
      <div class="field-gap"></div>
      <label class="field-label">Fecha</label>
      <input id="m-t-date" type="date" value="${escapeAttr(state.editTournamentDate)}" />
      ${state.formError ? `<div class="modal-error">${escapeHtml(state.formError)}</div>` : ""}
      <div class="modal-actions">
        <button class="btn btn-ghost" data-action="close-modal">Cancelar</button>
        <button class="btn btn-gold" data-action="submit-edit-tournament">Guardar</button>
      </div>
    `
    );
  }
  if (state.modal === "pin") {
    return modalShell(
      state.pinMode === "setup" ? "Configura el PIN de administrador" : "Modo administrador",
      `
      ${state.pinMode === "setup" ? `<div class="modal-note">Este PIN se guardará en el servidor para todos los que usen esta página. Compártelo solo con quien deba poder agregar torneos.</div>` : ""}
      <label class="field-label">PIN</label>
      <input id="m-pin" type="password" />
      ${state.formError ? `<div class="modal-error">${escapeHtml(state.formError)}</div>` : ""}
      <div class="modal-actions">
        <button class="btn btn-ghost" data-action="close-modal">Cancelar</button>
        <button class="btn btn-gold" data-action="submit-pin">${state.pinMode === "setup" ? "Guardar PIN" : "Entrar"}</button>
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
      if (el.dataset.action === "overlay-close" && e.target !== el) return; // click dentro del modal
      const action = el.dataset.action;
      state.formError = "";

      switch (action) {
        case "toggle-admin":
          openAdminFlow();
          break;
        case "select-league":
          await selectLeague(el.dataset.id);
          break;
        case "select-tab":
          state.tab = el.dataset.tab;
          state.detailTournamentId = null;
          state.editingParticipants = false;
          state.step = "form";
          render();
          break;
        case "open-tournament":
          state.detailTournamentId = el.dataset.id;
          state.editingParticipants = false;
          render();
          break;
        case "close-tournament":
          state.detailTournamentId = null;
          state.editingParticipants = false;
          render();
          break;
        case "open-edit-participants":
          openEditParticipants();
          break;
        case "ep-cancel":
          closeEditParticipants();
          break;
        case "ep-add-row":
          state.epRows.push(emptyRow());
          render();
          break;
        case "ep-move-up":
          moveEpRow(el.dataset.epRow, -1);
          break;
        case "ep-move-down":
          moveEpRow(el.dataset.epRow, 1);
          break;
        case "ep-remove-row":
          if (state.epRows.length > 1) state.epRows = state.epRows.filter((r) => r.id !== el.dataset.epRow);
          render();
          break;
        case "ep-save":
          await saveParticipants();
          break;
        case "add-row":
          state.rows.push(emptyRow());
          render();
          break;
        case "parse-paste": {
          const ta = document.getElementById("paste-area");
          const parsed = parsePasteText(ta ? ta.value : "");
          if (parsed.length) {
            const keep = state.rows.filter((r) => r.name.trim());
            state.rows = [...keep, ...parsed];
            if (ta) ta.value = "";
          }
          render();
          break;
        }
        case "move-up":
          moveRow(el.dataset.row, -1);
          break;
        case "move-down":
          moveRow(el.dataset.row, 1);
          break;
        case "remove-row":
          if (state.rows.length > 1) state.rows = state.rows.filter((r) => r.id !== el.dataset.row);
          render();
          break;
        case "go-review":
          goToReview();
          break;
        case "back-to-form":
          state.step = "form";
          render();
          break;
        case "apply-candidate":
          state.reviewRows = state.reviewRows.map((r) =>
            r.id === el.dataset.row ? { ...r, name: el.dataset.name, candidates: [], isExact: true } : r
          );
          render();
          break;
        case "save-tournament":
          await saveTournament();
          break;
        case "open-new-league":
          state.modal = "newLeague";
          render();
          break;
        case "open-settings":
          state.modal = "settings";
          render();
          break;
        case "open-rename":
          openRename(el.dataset.name);
          break;
        case "open-edit-tournament":
          openEditTournament(el.dataset.id);
          break;
        case "close-modal":
        case "overlay-close":
          state.modal = null;
          render();
          break;
        case "submit-new-league": {
          const name = document.getElementById("m-name").value;
          const topN = document.getElementById("m-topn").value;
          await createLeague(name, topN);
          break;
        }
        case "submit-settings": {
          const topN = document.getElementById("m-topn2").value;
          await saveTopN(topN);
          break;
        }
        case "submit-pin": {
          const pin = document.getElementById("m-pin").value;
          await confirmPin(pin);
          break;
        }
        case "submit-rename": {
          const newName = document.getElementById("m-rename").value;
          await submitRename(newName);
          break;
        }
        case "submit-edit-tournament": {
          const name = document.getElementById("m-t-name").value;
          const date = document.getElementById("m-t-date").value;
          await submitEditTournament(name, date);
          break;
        }
      }
    });
  });

  // inputs del formulario de torneo (nombre/fecha)
  const fName = document.getElementById("f-name");
  if (fName) fName.addEventListener("input", (e) => (state.tName = e.target.value));
  const fDate = document.getElementById("f-date");
  if (fDate) fDate.addEventListener("input", (e) => (state.tDate = e.target.value));

  // filas de jugadores
  app.querySelectorAll("[data-field]").forEach((el) => {
    el.addEventListener("input", (e) => {
      const row = state.rows.find((r) => r.id === el.dataset.row);
      if (row) row[el.dataset.field] = e.target.value;
    });
  });

  // filas del editor de jugadores de un torneo ya guardado
  app.querySelectorAll("[data-ep-field]").forEach((el) => {
    el.addEventListener("input", (e) => {
      const row = state.epRows.find((r) => r.id === el.dataset.epRow);
      if (row) row[el.dataset.epField] = e.target.value;
    });
  });

  // nombres en la pantalla de revisión
  app.querySelectorAll("[data-review-name]").forEach((el) => {
    el.addEventListener("input", (e) => {
      const row = state.reviewRows.find((r) => r.id === el.dataset.reviewName);
      if (!row) return;
      row.name = e.target.value;
      const existingNames = Object.keys(state.leagueData?.players || {});
      row.isExact = existingNames.some((n) => normalize(n) === normalize(row.name));
    });
  });

  // Enter para confirmar PIN
  const pinInput = document.getElementById("m-pin");
  if (pinInput) pinInput.addEventListener("keydown", (e) => { if (e.key === "Enter") confirmPin(pinInput.value); });

  // Enter para confirmar renombrado
  const renameInput = document.getElementById("m-rename");
  if (renameInput) renameInput.addEventListener("keydown", (e) => { if (e.key === "Enter") submitRename(renameInput.value); });
}

function moveRow(id, dir) {
  const i = state.rows.findIndex((r) => r.id === id);
  const j = i + dir;
  if (j < 0 || j >= state.rows.length) return;
  [state.rows[i], state.rows[j]] = [state.rows[j], state.rows[i]];
  render();
}

boot();
/* ==================================================================
   Ordenar Jugadores — utilidad standalone (sin backend) para asignar
   posiciones finales a una lista de nombres y generar el resultado
   ordenado. Todo el estado vive en memoria del navegador, no se
   guarda nada en el servidor.
   ================================================================== */

const state = {
  rawText: `Ana Gómez
Carlos López
Jorge "Ojama"
María Rodríguez
Juan Martínez
Pedro Sánchez`,
  players: [], // [{ name, position: number|null }] ordenados A-Z
  nextPos: 1,
  loaded: false,
};

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function escapeAttr(str) {
  return escapeHtml(str);
}

/* ---------------- validación de duplicados ---------------- */
function findDuplicates(text) {
  const lines = text.split("\n");
  const counts = {};
  const duplicates = new Set();
  lines.forEach((line) => {
    const name = line.trim().toLowerCase();
    if (name !== "") {
      counts[name] = (counts[name] || 0) + 1;
      if (counts[name] > 1) duplicates.add(line.trim());
    }
  });
  return Array.from(duplicates);
}

/* ---------------- acciones ---------------- */
function loadNames() {
  const duplicates = findDuplicates(state.rawText);
  if (duplicates.length > 0) return; // el botón ya está deshabilitado en este caso

  const cleanNames = state.rawText
    .split("\n")
    .map((line) => line.trim())
    .filter((name) => name !== "");

  cleanNames.sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }));

  state.players = cleanNames.map((name) => ({ name, position: null }));
  state.nextPos = 1;
  state.loaded = true;
  render();
}

function assignPosition(index) {
  state.players[index].position = state.nextPos;
  state.nextPos++;
  render();
}

function removePosition(index) {
  state.players[index].position = null;

  const withPos = state.players
    .filter((p) => p.position !== null)
    .sort((a, b) => a.position - b.position);

  let counter = 1;
  withPos.forEach((p) => {
    p.position = counter;
    counter++;
  });

  state.nextPos = counter;
  render();
}

function resetAll() {
  state.players = [];
  state.nextPos = 1;
  state.loaded = false;
  render();
}

/* ---------------- render ---------------- */
function render() {
  const app = document.getElementById("app");
  const duplicates = findDuplicates(state.rawText);
  const hasError = duplicates.length > 0;

  app.innerHTML = `
    ${renderHeader()}
    <div class="order-wrap">
      <div class="order-grid">
        ${renderStep1(hasError, duplicates)}
        ${renderStep2()}
        ${renderStep3()}
      </div>
    </div>
  `;
  attachEvents();
}

function renderHeader() {
  return `
    <div class="header">
      <div class="brand"><img src="/favicon-32x32.png" alt="Ojama" width="24" height="24" style="border-radius:6px;vertical-align:middle" /> Ordenar Jugadores</div>
      <div style="display:flex; gap:10px; align-items:center;">
        <a href="/" class="btn btn-ghost" style="text-decoration:none;">Inicio</a>
        <a href="/ligas" class="btn btn-ghost" style="text-decoration:none;">Ligas</a>
        <a href="/pareos" class="btn btn-ghost" style="text-decoration:none;">Pareos</a>
      </div>
    </div>
  `;
}

function renderStep1(hasError, duplicates) {
  return `
    <div class="card">
      <div class="order-col-head"><h2 class="order-col-title">1. Lista de nombres</h2></div>
      <div class="order-col-hint">Escribe o pega un nombre por línea.</div>
      <div class="order-col-body">
        <textarea id="rawNames" class="order-textarea ${hasError ? "has-error" : ""}" placeholder="Ana Gómez&#10;Carlos López">${escapeHtml(state.rawText)}</textarea>
        <div class="order-alert">${hasError ? `⚠️ Hay ${duplicates.length} nombre(s) duplicado(s): ${escapeHtml(duplicates.join(", "))}` : ""}</div>
        <button type="button" class="btn btn-gold" id="loadBtn" ${hasError ? "disabled" : ""} style="margin-top:10px; width:100%;">Cargar lista</button>
      </div>
    </div>
  `;
}

function renderStep2() {
  const items = state.players
    .map((p, i) => {
      const controls =
        p.position === null
          ? `<button type="button" class="assign-pos-btn" data-action="assign" data-index="${i}">Asignar ${state.nextPos}°</button>`
          : `
            <span class="pos-badge">${p.position}° Pos.</span>
            <button type="button" class="mini-btn danger" data-action="remove" data-index="${i}" title="Quitar posición">✕</button>
          `;
      return `
        <div class="order-item">
          <span class="order-item-name">${escapeHtml(p.name)}</span>
          <div class="order-item-controls">${controls}</div>
        </div>
      `;
    })
    .join("");

  return `
    <div class="card">
      <div class="order-col-head">
        <h2 class="order-col-title">2. Asignar posición</h2>
        ${state.loaded ? `<button type="button" class="icon-btn" data-action="reset" title="Reiniciar lista">↺</button>` : ""}
      </div>
      <div class="order-col-hint">Presiona "Asignar" en el orden en que van quedando los jugadores.</div>
      <div class="order-col-body">
        <div class="order-list">
          ${state.loaded ? (items || `<div class="order-empty">No se encontraron nombres válidos.</div>`) : `<div class="order-empty">Presiona "Cargar lista" para ver a los jugadores.</div>`}
        </div>
      </div>
    </div>
  `;
}

function renderStep3() {
  const ranked = state.players
    .filter((p) => p.position !== null)
    .sort((a, b) => a.position - b.position);

  const items = ranked
    .map(
      (p) => `
        <li class="order-ranked-item">
          <span class="order-ranked-pos ${p.position === 1 ? "pos-1" : ""}">${p.position}°</span>
          <span class="order-ranked-name">${escapeHtml(p.name)}</span>
        </li>
      `
    )
    .join("");

  return `
    <div class="card">
      <div class="order-col-head"><h2 class="order-col-title">3. Resultado ordenado</h2></div>
      <div class="order-col-hint">Se actualiza automáticamente conforme asignas posiciones.</div>
      <div class="order-col-body">
        <ul class="order-ranked-list">
          ${ranked.length ? items : `<div class="order-empty">Selecciona posiciones en el paso 2 para ver el resultado.</div>`}
        </ul>
      </div>
    </div>
  `;
}

/* ---------------- eventos ---------------- */
function attachEvents() {
  const textarea = document.getElementById("rawNames");
  if (textarea) {
    textarea.addEventListener("input", (e) => {
      state.rawText = e.target.value;
      render();
      // Mantener el foco y el cursor tras el re-render.
      const ta = document.getElementById("rawNames");
      ta.focus();
      ta.selectionStart = ta.selectionEnd = e.target.selectionStart;
    });
  }

  const loadBtn = document.getElementById("loadBtn");
  if (loadBtn) loadBtn.addEventListener("click", loadNames);

  document.querySelectorAll('[data-action="assign"]').forEach((btn) => {
    btn.addEventListener("click", () => assignPosition(parseInt(btn.dataset.index, 10)));
  });
  document.querySelectorAll('[data-action="remove"]').forEach((btn) => {
    btn.addEventListener("click", () => removePosition(parseInt(btn.dataset.index, 10)));
  });
  const resetBtn = document.querySelector('[data-action="reset"]');
  if (resetBtn) resetBtn.addEventListener("click", resetAll);
}

render();

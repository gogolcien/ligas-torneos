/* ==================================================================
   Página de inicio — catálogo de servicios del sitio.
   Página puramente informativa: no hay modo administrador aquí (no
   tiene sentido, no hay nada que consultar vs. administrar en esta
   pantalla). El acceso a modo administrador vive en cada servicio
   (/ligas y /pareos), a través de "?pijama" en su propia URL.

   Para agregar un servicio nuevo en el futuro, basta con sumar un
   objeto a SERVICES: el resto de la página (grid, tarjetas, íconos)
   se genera solo.
   ================================================================== */

const SERVICES = [
  {
    slug: "ligas",
    name: "Ligas",
    description:
      "Clasificación de torneos por liga: se capturan los resultados de cada torneo y se llevan los puntos acumulados de cada jugador a lo largo de la temporada.",
    href: "/ligas",
    accent: "gold",
    icon: leaguesIllustration(),
  },
  {
    slug: "pareos",
    name: "Sistema de Pareos",
    description:
      "Pareo suizo para correr un torneo en vivo: registro de jugadores, pareo automático o manual por ronda, captura de resultados y standings con OP%, OOP% y SL.",
    href: "/pareos",
    accent: "teal",
    icon: pareosIllustration(),
  },
  {
    slug: "ordenar",
    name: "Ordenar Jugadores",
    description:
      "Captura una lista de nombres y asígnales su posición final con un clic por jugador, en el orden en que van quedando, para generar el resultado ordenado.",
    href: "/ordenar",
    accent: "gold",
    icon: orderIllustration(),
  },
];

function leaguesIllustration() {
  return `
  <svg viewBox="0 0 400 220" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Ilustración de podio y trofeo">
    <defs>
      <linearGradient id="gGold" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#e6c46a"/>
        <stop offset="1" stop-color="#d4a537"/>
      </linearGradient>
    </defs>
    <rect x="0" y="0" width="400" height="220" fill="var(--panel2)"/>
    <!-- podio -->
    <rect x="130" y="140" width="60" height="55" rx="4" fill="var(--line)"/>
    <rect x="195" y="110" width="60" height="85" rx="4" fill="url(#gGold)"/>
    <rect x="260" y="155" width="60" height="40" rx="4" fill="var(--line)"/>
    <text x="160" y="175" text-anchor="middle" font-family="IBM Plex Mono, monospace" font-size="20" font-weight="600" fill="var(--ink-dim)">2</text>
    <text x="225" y="160" text-anchor="middle" font-family="IBM Plex Mono, monospace" font-size="22" font-weight="700" fill="#1b1204">1</text>
    <text x="290" y="182" text-anchor="middle" font-family="IBM Plex Mono, monospace" font-size="20" font-weight="600" fill="var(--ink-dim)">3</text>
    <!-- trofeo sobre el primer lugar -->
    <g transform="translate(225,60)">
      <path d="M-14 0h28v9a14 14 0 0 1-28 0V0Z" fill="var(--gold)"/>
      <path d="M-14 2h-8a6 6 0 0 0 0 12h5" fill="none" stroke="var(--gold)" stroke-width="3" stroke-linecap="round"/>
      <path d="M14 2h8a6 6 0 0 1 0 12h-5" fill="none" stroke="var(--gold)" stroke-width="3" stroke-linecap="round"/>
      <rect x="-4" y="22" width="8" height="10" fill="var(--gold)"/>
      <rect x="-16" y="32" width="32" height="6" rx="2" fill="var(--gold)"/>
    </g>
    <!-- confeti -->
    <circle cx="90" cy="55" r="4" fill="var(--teal)"/>
    <circle cx="330" cy="70" r="3" fill="var(--gold)"/>
    <circle cx="110" cy="100" r="3" fill="var(--gold)"/>
    <circle cx="310" cy="40" r="4" fill="var(--teal)"/>
    <rect x="70" y="90" width="6" height="6" fill="var(--gold)" transform="rotate(20 70 90)"/>
    <rect x="340" y="110" width="6" height="6" fill="var(--teal)" transform="rotate(-15 340 110)"/>
  </svg>`;
}

function pareosIllustration() {
  return `
  <svg viewBox="0 0 400 220" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Ilustración de pareo entre dos fichas">
    <rect x="0" y="0" width="400" height="220" fill="var(--panel2)"/>
    <!-- ficha A -->
    <g transform="translate(90,60)">
      <rect x="0" y="0" width="90" height="110" rx="10" fill="var(--panel)" stroke="var(--teal)" stroke-width="2.5"/>
      <circle cx="45" cy="42" r="18" fill="none" stroke="var(--teal)" stroke-width="3"/>
      <path d="M22 82q23-16 46 0" fill="none" stroke="var(--teal)" stroke-width="3" stroke-linecap="round"/>
    </g>
    <!-- ficha B -->
    <g transform="translate(220,60)">
      <rect x="0" y="0" width="90" height="110" rx="10" fill="var(--panel)" stroke="var(--gold)" stroke-width="2.5"/>
      <circle cx="45" cy="42" r="18" fill="none" stroke="var(--gold)" stroke-width="3"/>
      <path d="M22 82q23-16 46 0" fill="none" stroke="var(--gold)" stroke-width="3" stroke-linecap="round"/>
    </g>
    <!-- VS central -->
    <circle cx="200" cy="115" r="24" fill="var(--bg)" stroke="var(--line)" stroke-width="2"/>
    <text x="200" y="122" text-anchor="middle" font-family="IBM Plex Mono, monospace" font-size="15" font-weight="700" fill="var(--ink)">VS</text>
    <!-- brackets decorativos -->
    <path d="M40 40v-15h20" fill="none" stroke="var(--line)" stroke-width="2"/>
    <path d="M360 40v-15h-20" fill="none" stroke="var(--line)" stroke-width="2"/>
    <path d="M40 195v15h20" fill="none" stroke="var(--line)" stroke-width="2"/>
    <path d="M360 195v15h-20" fill="none" stroke="var(--line)" stroke-width="2"/>
  </svg>`;
}

function orderIllustration() {
  return `
  <svg viewBox="0 0 400 220" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Ilustración de lista numerada de jugadores">
    <rect x="0" y="0" width="400" height="220" fill="var(--panel2)"/>
    <!-- tarjeta con lista -->
    <rect x="70" y="35" width="260" height="150" rx="10" fill="var(--panel)" stroke="var(--line)" stroke-width="2"/>
    <!-- filas -->
    <g font-family="IBM Plex Mono, monospace" font-weight="700">
      <circle cx="100" cy="65" r="12" fill="var(--gold)"/>
      <text x="100" y="70" text-anchor="middle" font-size="13" fill="#1b1204">1</text>
      <rect x="122" y="58" width="150" height="14" rx="4" fill="var(--line)"/>

      <circle cx="100" cy="103" r="12" fill="none" stroke="var(--ink-dim)" stroke-width="2"/>
      <text x="100" y="108" text-anchor="middle" font-size="13" fill="var(--ink-dim)">2</text>
      <rect x="122" y="96" width="130" height="14" rx="4" fill="var(--line)"/>

      <circle cx="100" cy="141" r="12" fill="none" stroke="var(--ink-dim)" stroke-width="2"/>
      <text x="100" y="146" text-anchor="middle" font-size="13" fill="var(--ink-dim)">3</text>
      <rect x="122" y="134" width="140" height="14" rx="4" fill="var(--line)"/>
    </g>
    <!-- flecha/cursor de asignación -->
    <g transform="translate(292,150)">
      <path d="M0 0 L0 22 L6 17 L10 25 L14 23 L10 15 L18 15 Z" fill="var(--teal)"/>
    </g>
  </svg>`;
}

function trophySvg() {
  return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#d4a537" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 21h8"/><path d="M12 17v4"/><path d="M7 4h10v5a5 5 0 0 1-10 0V4Z"/><path d="M7 5H4a2 2 0 0 0 0 4h1.5"/><path d="M17 5h3a2 2 0 0 1 0 4h-1.5"/></svg>`;
}

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function render() {
  const app = document.getElementById("app");
  app.innerHTML = `
    <div class="header">
      <div class="brand"><img src="/favicon-32x32.png" alt="Ojama" width="24" height="24" style="border-radius:6px;vertical-align:middle" /> Ojama Programa Punto Com</div>
    </div>
    <div class="home-wrap">
      <div class="service-grid">
        ${SERVICES.map(serviceCard).join("")}
      </div>
    </div>
  `;
}

function serviceCard(s) {
  return `
    <a class="service-card" href="${escapeHtml(s.href)}" data-accent="${escapeHtml(s.accent)}">
      <div class="service-card-image">${s.icon}</div>
      <div class="service-card-body">
        <div class="service-card-name">${escapeHtml(s.name)}</div>
        <div class="service-card-desc">${escapeHtml(s.description)}</div>
      </div>
      <div class="service-card-cta">Entrar ›</div>
    </a>
  `;
}

render();

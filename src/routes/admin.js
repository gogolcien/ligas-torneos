const express = require("express");
const rateLimit = require("express-rate-limit");
const store = require("../data/store");
const { hashPin, verifyPin, makeToken } = require("../utils/crypto");
const asyncHandler = require("../utils/asyncHandler");

const router = express.Router();

const MIN_PIN_LENGTH = 6;
const TOKEN_TTL_MS = 12 * 60 * 60 * 1000; // 12 horas

// Purga esporádica de sesiones vencidas (no en cada request, para no
// pegarle a la base de datos de más). ~1 de cada 20 requests que pasan
// por requireAdmin dispara una purga en segundo plano.
function maybePurgeExpiredSessions() {
  if (Math.random() < 0.05) {
    store.purgeExpiredSessions().catch((err) => console.error("Error purgando sesiones vencidas:", err));
  }
}

async function issueToken(role = "admin") {
  const token = makeToken();
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);
  await store.createSession(token, role, expiresAt);
  return token;
}

// Middleware: exige una sesión válida de CUALQUIER rol (admin u
// organizador). Deja el rol en req.session para que cada ruta decida
// qué permite hacer a cada uno.
async function requireSession(req, res, next) {
  maybePurgeExpiredSessions();
  const token = req.headers["x-admin-token"];
  const session = token ? await store.getSession(token) : null;
  if (!session) return res.status(401).json({ error: "Se requiere iniciar sesión." });
  req.session = session;
  req.sessionToken = token;
  next();
}

// Middleware: exige específicamente el rol de administrador (se
// mantiene con este nombre para no tener que tocar todas las rutas
// que ya lo importan).
async function requireAdmin(req, res, next) {
  maybePurgeExpiredSessions();
  const token = req.headers["x-admin-token"];
  const session = token ? await store.getSession(token) : null;
  if (!session || session.role !== "admin") {
    return res.status(401).json({ error: "Se requiere sesión de administrador." });
  }
  req.session = session;
  req.sessionToken = token;
  next();
}

// Límite de intentos para login y setup: máximo 8 intentos cada 10
// minutos por IP, para dificultar la fuerza bruta sobre el PIN.
const loginLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiados intentos. Espera unos minutos e inténtalo de nuevo." },
});

router.get("/status", asyncHandler(async (req, res) => {
  const pinHash = await store.getAdminPinHash();
  res.json({ pinConfigured: !!pinHash });
}));

router.post("/setup", loginLimiter, asyncHandler(async (req, res) => {
  const { pin } = req.body || {};
  if (!pin || String(pin).trim().length < MIN_PIN_LENGTH) {
    return res.status(400).json({ error: `El PIN debe tener al menos ${MIN_PIN_LENGTH} caracteres.` });
  }
  const existing = await store.getAdminPinHash();
  if (existing) return res.status(400).json({ error: "Ya existe un PIN configurado." });

  const pinHash = hashPin(String(pin).trim());
  await store.setAdminPinHash(pinHash);

  const token = await issueToken("admin");
  res.json({ token });
}));

router.post("/login", loginLimiter, asyncHandler(async (req, res) => {
  const { pin } = req.body || {};
  const pinHash = await store.getAdminPinHash();
  if (!pinHash) return res.status(400).json({ error: "Aún no se configura un PIN de administrador." });
  if (!pin || !verifyPin(String(pin).trim(), pinHash)) {
    return res.status(401).json({ error: "PIN incorrecto." });
  }
  const token = await issueToken("admin");
  res.json({ token });
}));

router.post("/logout", requireSession, asyncHandler(async (req, res) => {
  await store.deleteSession(req.sessionToken);
  res.json({ ok: true });
}));

// GET /api/admin/me -> quién soy (para que el cliente pueda confirmar
// su sesión al cargar sin tener que adivinar por un 401).
router.get("/me", requireSession, (req, res) => {
  res.json({ role: req.session.role });
});

module.exports = router;
module.exports.requireAdmin = requireAdmin;
module.exports.requireSession = requireSession;
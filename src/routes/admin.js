const express = require("express");
const rateLimit = require("express-rate-limit");
const store = require("../data/store");
const { hashPin, verifyPin, makeToken } = require("../utils/crypto");
const asyncHandler = require("../utils/asyncHandler");

const router = express.Router();

const MIN_PIN_LENGTH = 6;
const TOKEN_TTL_MS = 12 * 60 * 60 * 1000; // 12 horas

// token -> timestamp de expiración
const activeTokens = new Map();

function purgeExpiredTokens() {
  const now = Date.now();
  for (const [token, expiresAt] of activeTokens) {
    if (expiresAt <= now) activeTokens.delete(token);
  }
}

function issueToken() {
  const token = makeToken();
  activeTokens.set(token, Date.now() + TOKEN_TTL_MS);
  return token;
}

function requireAdmin(req, res, next) {
  purgeExpiredTokens();
  const token = req.headers["x-admin-token"];
  if (token && activeTokens.has(token)) return next();
  return res.status(401).json({ error: "Se requiere sesión de administrador." });
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

  const token = issueToken();
  res.json({ token });
}));

router.post("/login", loginLimiter, asyncHandler(async (req, res) => {
  const { pin } = req.body || {};
  const pinHash = await store.getAdminPinHash();
  if (!pinHash) return res.status(400).json({ error: "Aún no se configura un PIN de administrador." });
  if (!pin || !verifyPin(String(pin).trim(), pinHash)) {
    return res.status(401).json({ error: "PIN incorrecto." });
  }
  const token = issueToken();
  res.json({ token });
}));

router.post("/logout", requireAdmin, (req, res) => {
  activeTokens.delete(req.headers["x-admin-token"]);
  res.json({ ok: true });
});

module.exports = router;
module.exports.requireAdmin = requireAdmin;
const express = require("express");
const store = require("../data/store");
const { hashPin, verifyPin, makeToken } = require("../utils/crypto");

const router = express.Router();

// Tokens de sesión de administrador en memoria (se pierden al reiniciar
// el servidor). Suficiente para un panel de administración simple.
const activeTokens = new Set();

function requireAdmin(req, res, next) {
  const token = req.headers["x-admin-token"];
  if (token && activeTokens.has(token)) return next();
  return res.status(401).json({ error: "Se requiere sesión de administrador." });
}

router.get("/status", async (req, res) => {
  const pinHash = await store.getAdminPinHash();
  res.json({ pinConfigured: !!pinHash });
});

router.post("/setup", async (req, res) => {
  const { pin } = req.body || {};
  if (!pin || String(pin).trim().length < 4) {
    return res.status(400).json({ error: "El PIN debe tener al menos 4 caracteres." });
  }
  const existing = await store.getAdminPinHash();
  if (existing) return res.status(400).json({ error: "Ya existe un PIN configurado." });

  const pinHash = hashPin(String(pin).trim());
  await store.setAdminPinHash(pinHash);

  const token = makeToken();
  activeTokens.add(token);
  res.json({ token });
});

router.post("/login", async (req, res) => {
  const { pin } = req.body || {};
  const pinHash = await store.getAdminPinHash();
  if (!pinHash) return res.status(400).json({ error: "Aún no se configura un PIN de administrador." });
  if (!pin || !verifyPin(String(pin).trim(), pinHash)) {
    return res.status(401).json({ error: "PIN incorrecto." });
  }
  const token = makeToken();
  activeTokens.add(token);
  res.json({ token });
});

router.post("/logout", requireAdmin, (req, res) => {
  activeTokens.delete(req.headers["x-admin-token"]);
  res.json({ ok: true });
});

module.exports = router;
module.exports.requireAdmin = requireAdmin;

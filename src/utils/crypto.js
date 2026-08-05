const crypto = require("crypto");

function hashPin(pin) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(pin, salt, 64).toString("hex");
  return { salt, hash };
}

function verifyPin(pin, pinHash) {
  if (!pinHash) return false;
  const check = crypto.scryptSync(pin, pinHash.salt, 64).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(check, "hex"), Buffer.from(pinHash.hash, "hex"));
}

function makeToken() {
  return crypto.randomBytes(24).toString("hex");
}

module.exports = { hashPin, verifyPin, makeToken };

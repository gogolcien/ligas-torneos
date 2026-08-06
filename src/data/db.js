require("dotenv").config();
const { Pool } = require("pg");

if (!process.env.DATABASE_URL) {
  throw new Error("Falta la variable de entorno DATABASE_URL.");
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // El modo SSL (verify-full) ya viene indicado en el propio
  // DATABASE_URL vía "sslmode=verify-full" — no lo sobreescribimos
  // aquí para que sí valide el certificado del servidor.
});

module.exports = pool;
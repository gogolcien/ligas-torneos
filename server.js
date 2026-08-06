const path = require("path");
const express = require("express");
const helmet = require("helmet");

const adminRoutes = require("./src/routes/admin");
const leagueRoutes = require("./src/routes/leagues");
const pareoRoutes = require("./src/routes/pareos");
const { init } = require("./src/data/store");

const PORT = process.env.PORT || 4000;

async function main() {
  await init(); // asegura que exista data/db.json

  const app = express();
  app.use(helmet());
  app.use(express.json());

  // API
  app.use("/api/admin", adminRoutes);
  app.use("/api/leagues", leagueRoutes);
  app.use("/api/pareos", pareoRoutes);

  // Frontend estático
  app.use(express.static(path.join(__dirname, "public")));

  // Ruta propia del sistema de pareos: jorgeojama.onrender.com/pareos
  // (y cualquier sub-ruta, ej. /pareos/algo, por si el frontend agrega
  // navegación con historial más adelante).
  app.get(["/pareos", "/pareos/*"], (req, res) => {
    res.sendFile(path.join(__dirname, "public", "pareos.html"));
  });

  app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
  });

  // Manejo global de errores: cualquier excepción no capturada en una
  // ruta (gracias a asyncHandler) termina aquí en vez de tumbar el
  // servidor o mostrar detalles internos al usuario.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error("Error no controlado:", err);
    if (res.headersSent) return next(err);
    res.status(500).json({ error: "Ocurrió un error inesperado en el servidor." });
  });

  app.listen(PORT, () => {
    console.log(`Actas de Liga corriendo en http://localhost:${PORT}`);
  });
}

main().catch((err) => {
  console.error("No se pudo iniciar el servidor:", err);
  process.exit(1);
});
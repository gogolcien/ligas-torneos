const path = require("path");
const express = require("express");

const adminRoutes = require("./src/routes/admin");
const leagueRoutes = require("./src/routes/leagues");
const { init } = require("./src/data/store");

const PORT = process.env.PORT || 4000;

async function main() {
  await init(); // asegura que exista data/db.json

  const app = express();
  app.use(express.json());

  // API
  app.use("/api/admin", adminRoutes);
  app.use("/api/leagues", leagueRoutes);

  // Frontend estático
  app.use(express.static(path.join(__dirname, "public")));
  app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
  });

  app.listen(PORT, () => {
    console.log(`Actas de Liga corriendo en http://localhost:${PORT}`);
  });
}

main().catch((err) => {
  console.error("No se pudo iniciar el servidor:", err);
  process.exit(1);
});

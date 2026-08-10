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

  // Cada servicio del sitio vive en su propia ruta (jorgeojama.onrender.com/<slug>)
  // y cualquier sub-ruta (ej. /pareos/algo), por si el frontend agrega
  // navegación con historial más adelante. Para agregar un servicio nuevo
  // solo hay que sumar una entrada aquí y su archivo .html en /public.
  const services = [
    { slug: "ligas", file: "ligas.html" },
    { slug: "pareos", file: "pareos.html" },
  ];
  services.forEach(({ slug, file }) => {
    app.get([`/${slug}`, `/${slug}/*`], (req, res) => {
      res.sendFile(path.join(__dirname, "public", file));
    });
  });

  // Página de inicio: catálogo de servicios (también la sirve
  // express.static para "/", esta ruta es la red de seguridad para
  // cualquier otra URL que no matchee nada de lo anterior).
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
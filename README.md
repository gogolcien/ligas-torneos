# Actas de Liga

Servidor Node/Express para registrar torneos y llevar la clasificación de ligas por puntos.

## Cómo correrlo

1. Necesitas [Node.js](https://nodejs.org) 16 o superior instalado, y una base de datos Postgres (ver sección "Dónde viven los datos" abajo — para desarrollo local puedes usar una base gratuita de [Neon](https://neon.tech)).
2. Abre una terminal en esta carpeta e instala las dependencias:

   ```bash
   npm install
   ```

3. Crea un archivo `.env` en la raíz del proyecto con tu cadena de conexión:

   ```
   DATABASE_URL=postgresql://usuario:password@tu-host.neon.tech/neondb?sslmode=require
   ```

   Este archivo **nunca** se sube a git (ya está en `.gitignore`).

4. La primera vez, crea las tablas en la base de datos:

   ```bash
   node scripts/init-db.js
   ```

5. Inicia el servidor:

   ```bash
   npm start
   ```

6. Abre tu navegador en **http://localhost:4000**

Por defecto usa el puerto 4000. Si quieres otro puerto:

```bash
PORT=5000 npm start
```

## Cómo funciona

- **Página de inicio** (`/`): catálogo con los servicios del sitio (hoy, Ligas y Pareos), cada uno con su nombre, una ilustración y una descripción. Es puramente informativa — no tiene modo administrador, porque no hay nada que "consultar" ahí; el acceso de administrador vive dentro de cada servicio.
- **Ligas** vive en su propia ruta, `/ligas` (ej. `https://jorgeojama.onrender.com/ligas`). Ahí cualquiera puede ver las ligas, la clasificación y el detalle de cada torneo.
- **Modo administrador**: no hay un botón visible para activarlo (no existe una diferencia visual entre "modo consulta" y "modo administrador" salvo los controles extra). Se activa agregando `?pijama` a la URL de `/ligas` o `/pareos` (ej. `https://jorgeojama.onrender.com/ligas?pijama`), lo que abre el prompt de PIN; el parámetro se limpia de la URL en cuanto se usa.
  - La primera vez que alguien lo usa, ese PIN queda configurado para todo el servidor (se guarda con hash, no en texto plano).
  - Solo en modo administrador se pueden crear ligas, cambiar el "top N" de una liga y agregar torneos.
- **Agregar un torneo**: se capturan los jugadores en el orden en que quedaron (posición 0 = primer lugar). Los puntos de cada quien son `total de participantes − posición`. Antes de guardar hay una pantalla de revisión que compara cada nombre con los jugadores que ya existen en la liga (por similitud de texto) para corregir errores de escritura antes de sumar los puntos.
- **Clasificación**: por cada jugador se suman sus mejores N resultados dentro de la liga (configurable por liga). Las ausencias no se cuentan como resultado adicional, lo que equivale a tratarlas como 0. Con el botón **"Copiar nombres"** de la pestaña Clasificación se copian solo los nombres, uno por línea y en el mismo orden de posición que se ve en pantalla — pensado para pegarlos directo al capturar el orden final de un torneo nuevo.

## Dónde viven los datos

Todo se guarda en **PostgreSQL**, en una base de datos gratuita alojada en [Neon](https://neon.tech). El servidor se conecta usando la variable de entorno `DATABASE_URL` (ver `src/data/db.js`).

El esquema tiene 4 tablas (`src/data/schema.sql`):
- `admin_settings` — hash y salt del PIN de administrador (una sola fila).
- `leagues` — id, nombre y `topN` de cada liga.
- `tournaments` — torneos, ligados a una liga (`league_id`).
- `participants` — participantes de cada torneo (nombre, deck, posición, puntos).

El objeto `players` (historial agregado por jugador que usa el frontend) **no se guarda directamente**: se reconstruye en cada consulta a partir de `tournaments` + `participants` (ver `buildPlayersFromTournaments` en `src/data/store.js`).

Para crear las tablas desde cero en una base de datos nueva:
```bash
node scripts/init-db.js
```

## Despliegue en la nube (gratis)

Este proyecto está pensado para desplegarse con:
- **Base de datos**: [Neon](https://neon.tech) (Postgres gratis, plan permanente).
- **Servidor**: [Render](https://render.com) (Web Service gratis).

Pasos:
1. Crea un proyecto en Neon y copia su `Connection String`.
2. Sube este repo a GitHub (asegúrate de que `.env` y `node_modules/` sigan ignorados).
3. En Render: **New Web Service** → conecta el repo → Build command `npm install` → Start command `npm start` → plan **Free**.
4. En la sección **Environment Variables** de Render, agrega `DATABASE_URL` con el connection string de Neon.
5. Deploy. Render te da una URL pública (`https://tu-app.onrender.com`).

> El plan gratis de Render "duerme" el servicio tras ~15 min sin tráfico; la primera visita después de eso tarda unos 30-50s en responder mientras despierta. Es esperado, no es un error.

Cuando quieras un dominio propio, se configura en Render (`Settings` → `Custom Domain`) apuntando el DNS de tu dominio hacia la URL de Render — no requiere tocar código.

## Sistema de Pareos (Suizo) — ruta `/pareos`

Además de "Actas de Liga", el servidor expone un segundo sistema en `/pareos` (ej. `https://jorgeojama.onrender.com/pareos`), para correr un torneo en vivo con pareo suizo. **Reutiliza todo lo existente**: el mismo pool de Postgres (`src/data/db.js`), el mismo `server.js`/Express, los mismos estilos (`public/styles.css`) y el mismo PIN de administrador (`/api/admin/*`, mismo token guardado en `localStorage`). El modo administrador se activa igual que en Ligas: agregando `?pijama` a la URL (`/pareos?pijama`).

- **Tablas nuevas** (agregadas a `src/data/schema.sql`): `pareo_tournaments`, `pareo_players`, `pareo_rounds`, `pareo_matches`. Para crearlas en una base ya existente, vuelve a correr:
  ```bash
  node scripts/init-db.js
  ```
  (usa `CREATE TABLE IF NOT EXISTS`, así que no toca las tablas de `ligas`/`torneos` que ya tienes).

- **Vistas** (`public/pareos.html` + `public/pareos.js`):
  - **Registro**: alta/edición/inhabilitación/eliminación de jugadores. Solo se puede eliminar antes de que exista la ronda 1.
  - **Pareos**: pareo automático por ronda (botón "Parear siguiente ronda"), pareo manual antes de capturar resultados (solo en la ronda vigente), captura de resultados (gana A / gana B / empate / ambos pierden), conversión AUTOWIN ↔ AUTOLOSE. Los resultados se pueden **corregir en cualquier ronda ya jugada, no solo en la última**: al cambiar un resultado, los puntos de los jugadores involucrados y el OP%/OOP% de sus rivales se recalculan de inmediato (el cálculo siempre parte de todos los resultados guardados, no se acumula de forma incremental).
  - **Standings**: tabla ordenada por Puntos → OP% → OOP% → SL.

- **Algoritmo de pareo** (`src/utils/swiss.js`): ronda 1 aleatoria; rondas siguientes agrupadas por puntaje, evitando rivales repetidos con downpairing cuando hace falta, y AUTOWIN para el jugador de menor puntaje que aún no lo haya recibido. Los desempates (P, OP%, OOP%, SL) siguen exactamente las fórmulas que diste, incluyendo omitir las rondas de AUTOWIN al promediar el récord de los rivales.

## Estructura del proyecto

```
ligas-torneos/
├── server.js                     # arranca Express y monta las rutas (incluye la lista de servicios: / → home, /ligas, /pareos, ...)
├── scripts/
│   └── init-db.js                # crea las tablas en la base de datos
├── src/
│   ├── data/
│   │   ├── db.js                 # pool de conexión a Postgres
│   │   ├── schema.sql            # definición de las tablas
│   │   ├── store.js              # consultas SQL de Ligas
│   │   └── pareoStore.js         # consultas SQL de Pareos
│   ├── routes/admin.js           # login del administrador (PIN, compartido)
│   ├── routes/leagues.js         # ligas y torneos (API REST)
│   ├── routes/pareos.js          # pareos suizos (API REST)
│   └── utils/
│       ├── crypto.js             # hash del PIN
│       ├── points.js             # cálculo de puntos y clasificación de ligas
│       └── swiss.js              # algoritmo de pareo suizo y standings (P, OP%, OOP%, SL)
└── public/                       # frontend (HTML/CSS/JS sin framework)
    ├── index.html + home.js      # página de inicio (catálogo de servicios)
    ├── ligas.html + app.js       # servicio de Ligas → ruta /ligas
    ├── pareos.html + pareos.js   # servicio de Pareos → ruta /pareos
    └── styles.css                # estilos compartidos por los tres
```

Para agregar un servicio nuevo más adelante: crear su `<slug>.html` + `<slug>.js` en `public/`, sumar `{ slug, file }` al arreglo `services` de `server.js`, y agregar su tarjeta al arreglo `SERVICES` de `public/home.js`.
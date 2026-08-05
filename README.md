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

- **Consulta libre**: cualquiera que entre a la página puede ver las ligas, la clasificación y el detalle de cada torneo.
- **Modo administrador**: el botón "Modo consulta" en la esquina superior derecha pide un PIN.
  - La primera vez que alguien lo usa, ese PIN queda configurado para todo el servidor (se guarda con hash, no en texto plano).
  - Solo en modo administrador se pueden crear ligas, cambiar el "top N" de una liga y agregar torneos.
- **Agregar un torneo**: se capturan los jugadores en el orden en que quedaron (posición 0 = primer lugar). Los puntos de cada quien son `total de participantes − posición`. Antes de guardar hay una pantalla de revisión que compara cada nombre con los jugadores que ya existen en la liga (por similitud de texto) para corregir errores de escritura antes de sumar los puntos.
- **Clasificación**: por cada jugador se suman sus mejores N resultados dentro de la liga (configurable por liga). Las ausencias no se cuentan como resultado adicional, lo que equivale a tratarlas como 0.

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

## Estructura del proyecto

```
ligas-torneos/
├── server.js                     # arranca Express y monta las rutas
├── scripts/
│   └── init-db.js                # crea las tablas en la base de datos
├── src/
│   ├── data/
│   │   ├── db.js                 # pool de conexión a Postgres
│   │   ├── schema.sql            # definición de las tablas
│   │   └── store.js              # todas las consultas SQL de la app
│   ├── routes/admin.js           # login del administrador (PIN)
│   ├── routes/leagues.js         # ligas y torneos (API REST)
│   └── utils/
│       ├── crypto.js             # hash del PIN
│       └── points.js             # cálculo de puntos y clasificación
└── public/                       # frontend (HTML/CSS/JS sin framework)
    ├── index.html
    ├── styles.css
    └── app.js
```
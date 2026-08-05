# Actas de Liga

Servidor Node/Express para registrar torneos y llevar la clasificación de ligas por puntos.

## Cómo correrlo

1. Necesitas [Node.js](https://nodejs.org) 16 o superior instalado.
2. Abre una terminal en esta carpeta e instala las dependencias:

   ```bash
   npm install
   ```

3. Inicia el servidor:

   ```bash
   npm start
   ```

4. Abre tu navegador en **http://localhost:4000**

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

Todo se guarda en `data/db.json`, un archivo de texto plano en el propio servidor (no requiere instalar una base de datos). Si quieres reiniciar todo desde cero, borra ese archivo con el servidor apagado y se volverá a crear vacío al arrancar.

> Para un uso con más de un puñado de personas escribiendo al mismo tiempo, o si necesitas alta disponibilidad, conviene migrar `src/data/store.js` a una base de datos real (Postgres, SQLite, etc.). La estructura de funciones (`getLeague`, `saveLeague`, etc.) está pensada para poder reemplazar solo ese archivo sin tocar las rutas.

## Estructura del proyecto

```
ligas-torneos/
├── server.js                # arranca Express y monta las rutas
├── data/db.json             # "base de datos" en JSON (se crea sola)
├── src/
│   ├── data/store.js        # lectura/escritura del JSON
│   ├── routes/admin.js      # login del administrador (PIN)
│   ├── routes/leagues.js    # ligas y torneos (API REST)
│   └── utils/
│       ├── crypto.js        # hash del PIN
│       └── points.js        # cálculo de puntos y clasificación
└── public/                  # frontend (HTML/CSS/JS sin framework)
    ├── index.html
    ├── styles.css
    └── app.js
```
"# ojama_torneos" 

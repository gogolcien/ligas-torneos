// Normaliza un nombre para compararlo sin importar acentos, mayúsculas
// o espacios de más (usado para detectar que "Jose Luis" y "José Luis"
// son la misma persona al renombrar/fusionar jugadores).
function normalize(s) {
  return (s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

module.exports = { normalize };

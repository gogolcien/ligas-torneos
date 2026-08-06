// Envuelve un handler async de Express para que, si lanza una excepción
// o la promesa se rechaza, el error se pase a next() en vez de quedar
// como una promesa rechazada sin capturar (lo cual, en Node 15+, puede
// terminar el proceso completo y tumbar el servidor para todos).
function asyncHandler(fn) {
  return function (req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = asyncHandler;
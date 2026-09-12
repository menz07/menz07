/**
 * Convierte el nombre de un producto tal como lo escribe cada súper
 * (mayúsculas distintas, acentos, espacios extra) en una llave estable
 * que usamos para decidir si dos productos de súpers distintos son "el mismo".
 *
 * Es intencionalmente simple (exact-match tras normalizar). Cuando la data
 * real empiece a entrar vamos a necesitar algo más tolerante (fuzzy match,
 * por marca + tamaño, o mapeo manual para casos ambiguos).
 */
export function normalizeProductName(rawName: string): string {
  return rawName
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // quita acentos
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ") // quita puntuación
    .replace(/\s+/g, " ")
    .trim();
}

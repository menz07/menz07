/**
 * Matching por similitud de nombre para productos que no traen código de
 * barras (ej. Magento). Se usa solo cuando el matching exacto por nombre
 * normalizado no encontró nada — es más caro y menos preciso, así que es un
 * segundo intento, no el camino principal.
 *
 * Diseño pensado para minimizar falsos positivos (juntar dos productos
 * distintos) más que para maximizar cuántos junta: si el tamaño/unidad no
 * coincide, se descarta directo; si dos nombres mencionan variantes
 * incompatibles (ej. "entera" vs "descremada"), también. Aun así puede
 * fallar con datos de origen ambiguos (ver README) — por eso en la UI estos
 * matches se marcan como "coincidencia probable", no como un hecho.
 */

const UNIT_ALIASES: Record<string, string> = {
  libra: "lb",
  libras: "lb",
  lb: "lb",
  lbs: "lb",
  kilogramo: "kg",
  kilogramos: "kg",
  kilo: "kg",
  kilos: "kg",
  kg: "kg",
  kgs: "kg",
  gramo: "g",
  gramos: "g",
  gr: "g",
  grs: "g",
  g: "g",
  onza: "oz",
  onzas: "oz",
  oz: "oz",
  mililitro: "ml",
  mililitros: "ml",
  ml: "ml",
  litro: "l",
  litros: "l",
  lt: "l",
  lts: "l",
  l: "l",
  galon: "gal",
  galones: "gal",
  gal: "gal",
  gl: "gal",
  unidad: "un",
  unidades: "un",
  und: "un",
  un: "un",
};

// OJO: "con"/"sin" NO están acá a propósito — son diferenciadores reales
// ("con sal" vs "sin sal", "con azúcar" vs "sin azúcar"), no relleno.
const STOPWORDS = new Set(["de", "del", "la", "el", "los", "las", "y", "para", "en", "un"]);

/**
 * Palabras que marcan variantes de producto que NO deberían mezclarse (ej.
 * frijoles negros vs bayos, leche entera vs descremada). Si un nombre usa
 * alguna de estas y el otro usa una distinta de la misma lista sin
 * mencionar la primera, se rechaza el match aunque el resto de las palabras
 * coincida mucho.
 */
const VARIANT_WORDS = new Set([
  "negro",
  "negros",
  "bayo",
  "bayos",
  "rojo",
  "rojos",
  "entera",
  "descremada",
  "semidescremada",
  "deslactosada",
  "evaporada",
  "condensada",
  "instantanea",
  "instantaneo",
  "uht",
]);

export interface NameTokens {
  /** Tamaños normalizados, ej. ["800g", "5lb"] — SOLO peso/volumen, no cantidad de unidades. */
  sizes: string[];
  /**
   * Cuántas unidades trae el paquete (ej. "12 Unidades", "docena" -> 12).
   * 1 si el nombre no menciona ninguna cantidad (se asume que es una sola
   * pieza). Se guarda aparte de `sizes` a propósito: un six-pack de latas de
   * 946ml y una lata suelta de 946ml comparten el tamaño por unidad pero NO
   * son el mismo producto ni el mismo precio — PriceSmart (venta por mayor)
   * vende casi todo en multi-pack mientras el resto de los súpers vende por
   * unidad, así que sin este chequeo el fuzzy match cruzaba una lata contra
   * una caja de 12 y los daba por "el mismo producto" a 5-12x el precio.
   */
  packCount: number;
  /** Palabras significativas restantes. */
  words: string[];
}

/** Igual a normalize.ts pero deja los puntos decimales (ej. "2.27") intactos para poder parsear tamaños. */
function baseTokens(rawName: string): string[] {
  const cleaned = rawName
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/,(\d)/g, ".$1") // "2,27" -> "2.27" (separador decimal regional)
    .replace(/[^a-z0-9.\s]/g, " ")
    .replace(/(?<!\d)\.|\.(?!\d)/g, " ") // deja solo puntos entre dígitos (decimales)
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.split(" ").filter(Boolean);
}

export function tokenizeProductName(rawName: string): NameTokens {
  const rawTokens = baseTokens(rawName);
  const sizes: string[] = [];
  const words: string[] = [];
  let packCount = 1;
  let sawPackCount = false;

  for (let i = 0; i < rawTokens.length; i++) {
    const tok = rawTokens[i];

    if (tok === "docena") {
      packCount = 12;
      sawPackCount = true;
      continue;
    }

    // Número y unidad pegados, ej. "800g", "5lb", "2.27kg", "12un".
    const stuck = tok.match(
      /^(\d+(?:\.\d+)?)(kg|kgs|g|gr|grs|lb|lbs|oz|ml|lt|lts|l|gal|gl|und|un)$/,
    );
    if (stuck) {
      const unit = UNIT_ALIASES[stuck[2]] ?? stuck[2];
      if (unit === "un") {
        packCount = Math.max(packCount, Number(stuck[1]) || 1);
        sawPackCount = true;
      } else {
        sizes.push(`${stuck[1]}${unit}`);
      }
      continue;
    }

    // Número suelto seguido de la unidad como palabra separada.
    if (/^\d+(\.\d+)?$/.test(tok) && i + 1 < rawTokens.length) {
      const unit = UNIT_ALIASES[rawTokens[i + 1]];
      if (unit === "un") {
        packCount = Math.max(packCount, Number(tok) || 1);
        sawPackCount = true;
        i++;
        continue;
      }
      if (unit) {
        sizes.push(`${tok}${unit}`);
        i++;
        continue;
      }
    }

    if (STOPWORDS.has(tok) || tok.length <= 1) continue;
    words.push(tok);
  }

  // "1 unidad" explícito no es distinto de no decir nada — solo nos importa
  // cuando el paquete trae MÁS de una pieza.
  if (sawPackCount && packCount <= 1) packCount = 1;

  return { sizes: sizes.sort(), packCount, words };
}

/** Dos tokens "compatibles" si son iguales o uno es prefijo del otro (para nombres abreviados, ej. "deslactos" / "deslactosada"). */
function tokensCompatible(a: string, b: string): boolean {
  if (a === b) return true;
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  return shorter.length >= 4 && longer.startsWith(shorter);
}

/** true si los nombres mencionan variantes incompatibles entre sí (ver VARIANT_WORDS). */
function hasVariantConflict(a: string[], b: string[]): boolean {
  const av = a.filter((w) => VARIANT_WORDS.has(w));
  const bv = b.filter((w) => VARIANT_WORDS.has(w));
  if (!av.length || !bv.length) return false;
  const uncovered = (xs: string[], ys: string[]) =>
    xs.some((w) => !ys.some((y) => tokensCompatible(w, y)));
  return uncovered(av, bv) || uncovered(bv, av);
}

const MIN_SCORE = 0.85;

/** 0 si no hay match suficiente; si no, un puntaje 0-1 de qué tan bien coinciden. */
export function similarity(a: NameTokens, b: NameTokens): number {
  if (a.packCount !== b.packCount) {
    // Un six-pack no es lo mismo que una unidad suelta aunque el resto del
    // nombre y el tamaño por pieza coincidan (ver comentario en NameTokens).
    return 0;
  }

  if (a.sizes.length && b.sizes.length) {
    const shareSize = a.sizes.some((s) => b.sizes.includes(s));
    if (!shareSize) return 0;
  } else if (a.sizes.length !== b.sizes.length) {
    // Uno declara tamaño/peso y el otro no lo menciona — no podemos
    // confirmar que sea la misma presentación (ej. ¿es la bolsa de 900g
    // o la de 2.27kg?), así que mejor no comparar precios a ciegas.
    return 0;
  }

  if (!a.words.length || !b.words.length) return 0;
  if (hasVariantConflict(a.words, b.words)) return 0;

  const [shorter, longer] =
    a.words.length <= b.words.length ? [a.words, b.words] : [b.words, a.words];
  const usedLonger = new Set<number>();
  let matches = 0;
  for (const tok of shorter) {
    const idx = longer.findIndex(
      (t, i) => !usedLonger.has(i) && tokensCompatible(tok, t),
    );
    if (idx !== -1) {
      usedLonger.add(idx);
      matches++;
    }
  }

  if (matches === 0) return 0;
  // Con una sola palabra de cada lado, exigimos que sea bien específica
  // (no "leche" solo) para no juntar productos distintos por casualidad.
  if (shorter.length === 1 && longer.length === 1) {
    return shorter[0].length >= 6 ? 1 : 0;
  }

  // Coeficiente de Dice: penaliza cuando el nombre más largo tiene varias
  // palabras extra que el otro no menciona (señal de que son productos
  // distintos, no solo el mismo escrito distinto).
  const score = (2 * matches) / (shorter.length + longer.length);
  return score >= MIN_SCORE ? score : 0;
}

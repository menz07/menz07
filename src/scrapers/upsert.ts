import { prisma } from "../lib/prisma";
import { normalizeProductName } from "../lib/normalize";
import { tokenizeProductName, similarity } from "../lib/fuzzy-match";
import type { ScrapedProduct } from "./types";

/**
 * Segundo intento cuando no hay match exacto por nombre normalizado: busca
 * candidatos que compartan la palabra más distintiva del nombre (para no
 * tener que comparar contra todo el catálogo) y les aplica el scoring de
 * similitud. Pensado para súpers sin EAN (ej. Magento) cuyo nombre no
 * coincide letra por letra con el de otro súper.
 *
 * Excluye candidatos donde ESTE MISMO súper ya tiene otro producto enlazado:
 * si dos ítems distintos de un súper matchearan al mismo Product, sería casi
 * seguro una falsa coincidencia (un súper no vende "el mismo producto" dos
 * veces con precios distintos bajo SKUs distintos).
 */
async function findFuzzyMatch(
  rawName: string,
  storeId: string,
  currentUrl: string,
) {
  const target = tokenizeProductName(rawName);
  if (!target.words.length) return null;

  const longestWord = [...target.words].sort((a, b) => b.length - a.length)[0];
  if (longestWord.length < 4) return null; // muy genérica para prefiltrar con seguridad

  const candidates = await prisma.product.findMany({
    where: {
      normalizedName: { contains: longestWord },
      NOT: { storeProducts: { some: { storeId, url: { not: currentUrl } } } },
    },
    take: 30,
  });

  let best: { product: (typeof candidates)[number]; score: number } | null = null;
  for (const candidate of candidates) {
    const score = similarity(target, tokenizeProductName(candidate.name));
    if (score > 0 && (!best || score > best.score)) {
      best = { product: candidate, score };
    }
  }
  return best?.product ?? null;
}

/**
 * Encuentra (o crea) el Product "canónico" al que pertenece este item.
 *
 * Orden de prioridad:
 *   1. Código de barras (EAN), si el súper lo publica — la señal más
 *      confiable de que dos súpers venden el mismo producto físico.
 *   2. Nombre normalizado exacto.
 *   3. Similitud de nombre (fuzzy match) — para súpers sin EAN (ej. Magento)
 *      cuyo nombre no coincide letra por letra con el de otro súper.
 */
type MatchMethod = "ean" | "name" | "fuzzy";

async function resolveProduct(
  item: ScrapedProduct,
  storeId: string,
): Promise<{ product: { id: string }; matchMethod: MatchMethod }> {
  const normalizedName = normalizeProductName(item.rawName);

  if (item.ean) {
    const byEan = await prisma.product.findUnique({
      where: { ean: item.ean },
    });
    if (byEan) return { product: byEan, matchMethod: "ean" };

    const byName = await prisma.product.findUnique({
      where: { normalizedName },
    });
    if (byName) {
      // Si ese nombre normalizado ya está atado a OTRO ean, es una
      // coincidencia de nombre entre dos productos distintos: dejamos el
      // Product existente como está en vez de arriesgar reasignar su EAN.
      if (!byName.ean) {
        const updated = await prisma.product.update({
          where: { id: byName.id },
          data: { ean: item.ean },
        });
        return { product: updated, matchMethod: "ean" };
      }
      return { product: byName, matchMethod: "name" };
    }

    const created = await prisma.product.create({
      data: { name: item.rawName, normalizedName, ean: item.ean },
    });
    return { product: created, matchMethod: "ean" };
  }

  const exact = await prisma.product.findUnique({ where: { normalizedName } });
  if (exact) return { product: exact, matchMethod: "name" };

  const fuzzy = await findFuzzyMatch(item.rawName, storeId, item.url);
  if (fuzzy) return { product: fuzzy, matchMethod: "fuzzy" };

  const created = await prisma.product.create({
    data: { name: item.rawName, normalizedName },
  });
  return { product: created, matchMethod: "name" };
}

/** Guarda (o actualiza) un producto scrapeado de un súper puntual en la base de datos. */
export async function upsertStoreProduct(
  storeSlug: string,
  item: ScrapedProduct,
) {
  const store = await prisma.store.findUnique({ where: { slug: storeSlug } });
  if (!store) {
    throw new Error(
      `No existe un Store con slug "${storeSlug}" en la base de datos. Corré "npm run db:seed:stores" primero.`,
    );
  }

  const { product, matchMethod } = await resolveProduct(item, store.id);

  const storeProduct = await prisma.storeProduct.upsert({
    where: { storeId_url: { storeId: store.id, url: item.url } },
    create: {
      storeId: store.id,
      productId: product.id,
      rawName: item.rawName,
      price: item.price,
      unit: item.unit,
      url: item.url,
      imageUrl: item.imageUrl,
      inStock: item.inStock ?? true,
      matchMethod,
    },
    update: {
      productId: product.id,
      rawName: item.rawName,
      price: item.price,
      unit: item.unit,
      imageUrl: item.imageUrl,
      inStock: item.inStock ?? true,
      matchMethod,
      lastScrapedAt: new Date(),
    },
  });

  await prisma.priceHistory.create({
    data: { storeProductId: storeProduct.id, price: item.price },
  });
}

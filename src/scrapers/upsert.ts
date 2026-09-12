import { prisma } from "../lib/prisma";
import { normalizeProductName } from "../lib/normalize";
import type { ScrapedProduct } from "./types";

/**
 * Encuentra (o crea) el Product "canónico" al que pertenece este item.
 *
 * Si el súper publicó un código de barras (EAN), lo usamos como clave
 * principal: es mucho más confiable que el nombre para saber que dos súpers
 * venden el mismo producto físico, porque cada uno describe/ordena/abrevia
 * los nombres de forma distinta. Si no hay EAN (o el súper no lo publica),
 * caemos al matching por nombre normalizado de siempre.
 */
async function resolveProduct(item: ScrapedProduct) {
  const normalizedName = normalizeProductName(item.rawName);

  if (item.ean) {
    const byEan = await prisma.product.findUnique({
      where: { ean: item.ean },
    });
    if (byEan) return byEan;

    const byName = await prisma.product.findUnique({
      where: { normalizedName },
    });
    if (byName) {
      // Si ese nombre normalizado ya está atado a OTRO ean, es una
      // coincidencia de nombre entre dos productos distintos: dejamos el
      // Product existente como está en vez de arriesgar reasignar su EAN.
      if (!byName.ean) {
        return prisma.product.update({
          where: { id: byName.id },
          data: { ean: item.ean },
        });
      }
      return byName;
    }

    return prisma.product.create({
      data: { name: item.rawName, normalizedName, ean: item.ean },
    });
  }

  return prisma.product.upsert({
    where: { normalizedName },
    create: { name: item.rawName, normalizedName },
    update: {},
  });
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

  const product = await resolveProduct(item);

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
    },
    update: {
      productId: product.id,
      rawName: item.rawName,
      price: item.price,
      unit: item.unit,
      imageUrl: item.imageUrl,
      inStock: item.inStock ?? true,
      lastScrapedAt: new Date(),
    },
  });

  await prisma.priceHistory.create({
    data: { storeProductId: storeProduct.id, price: item.price },
  });
}

import { prisma } from "../lib/prisma";
import { normalizeProductName } from "../lib/normalize";
import type { ScrapedProduct } from "./types";

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

  const normalizedName = normalizeProductName(item.rawName);
  const product = await prisma.product.upsert({
    where: { normalizedName },
    create: { name: item.rawName, normalizedName },
    update: {},
  });

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

/**
 * Corre uno o varios scrapers y guarda lo que encuentren en la base de datos.
 *
 * Uso:
 *   npm run scrape -- <busqueda> [storeSlug...]
 *
 * Ejemplos:
 *   npm run scrape -- leche                 # busca "leche" en todos los súpers
 *   npm run scrape -- arroz super-xtra       # busca "arroz" solo en Super Xtra
 *
 * Requiere salida a internet real hacia los sitios de los súpers — no
 * funciona dentro de un entorno de desarrollo con red restringida.
 */
import { prisma } from "../lib/prisma";
import { normalizeProductName } from "../lib/normalize";
import { allScrapers } from "./registry";
import type { ScrapedProduct } from "./types";

async function upsertStoreProduct(storeSlug: string, item: ScrapedProduct) {
  const store = await prisma.store.findUnique({ where: { slug: storeSlug } });
  if (!store) {
    throw new Error(
      `No existe un Store con slug "${storeSlug}" en la base de datos. Corré "npm run db:seed" primero.`,
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

async function main() {
  const [query, ...storeSlugs] = process.argv.slice(2);
  if (!query) {
    console.error("Uso: npm run scrape -- <busqueda> [storeSlug...]");
    process.exit(1);
  }

  const scrapers = storeSlugs.length
    ? allScrapers.filter((s) => storeSlugs.includes(s.storeSlug))
    : allScrapers;

  for (const scraper of scrapers) {
    console.log(`\n=== ${scraper.storeName} (${scraper.storeSlug}) ===`);
    try {
      const items = await scraper.scrape(query);
      console.log(`  ${items.length} productos encontrados`);
      for (const item of items) {
        await upsertStoreProduct(scraper.storeSlug, item);
      }
    } catch (err) {
      console.error(`  Error: ${(err as Error).message}`);
    }
  }

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});

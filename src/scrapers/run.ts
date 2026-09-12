/**
 * Corre uno o varios scrapers con UNA búsqueda puntual y guarda lo que
 * encuentren en la base de datos. Pensado para probar un scraper a mano.
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
 *
 * Para scrapear una lista amplia de productos en todos los súpers de una,
 * usá en cambio `npm run scrape:all` (ver src/scrapers/run-all.ts).
 */
import { prisma } from "../lib/prisma";
import { allScrapers } from "./registry";
import { upsertStoreProduct } from "./upsert";

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

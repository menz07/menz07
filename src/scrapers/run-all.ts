/**
 * Corre todos los scrapers implementados contra una canasta de términos de
 * búsqueda comunes (ver search-terms.ts) y guarda todo en la base de datos.
 * Pensado para correr sin intervención humana, ej. desde un cron de
 * GitHub Actions (ver .github/workflows/scrape.yml).
 *
 * Uso: npm run scrape:all
 */
import { prisma } from "../lib/prisma";
import { allScrapers } from "./registry";
import { upsertStoreProduct } from "./upsert";
import { COMMON_SEARCH_TERMS } from "./search-terms";

async function main() {
  const scrapers = allScrapers.filter((s) => s.implemented !== false);
  const skipped = allScrapers.filter((s) => s.implemented === false);

  if (skipped.length) {
    console.log(
      `Saltando (todavía sin scraper real): ${skipped.map((s) => s.storeName).join(", ")}`,
    );
  }

  let totalSaved = 0;
  let totalErrors = 0;

  for (const scraper of scrapers) {
    console.log(`\n=== ${scraper.storeName} (${scraper.storeSlug}) ===`);
    for (const term of COMMON_SEARCH_TERMS) {
      try {
        const items = await scraper.scrape(term);
        for (const item of items) {
          await upsertStoreProduct(scraper.storeSlug, item);
        }
        totalSaved += items.length;
        console.log(`  "${term}": ${items.length} productos`);
      } catch (err) {
        totalErrors++;
        console.error(`  "${term}": error — ${(err as Error).message}`);
      }
    }
  }

  console.log(
    `\nListo. ${totalSaved} filas guardadas/actualizadas, ${totalErrors} errores.`,
  );

  await prisma.$disconnect();

  // Si un súper implementado falló en TODO, probablemente su sitio cambió
  // de estructura — que el job de CI quede en rojo para que se note.
  if (scrapers.length > 0 && totalSaved === 0) {
    console.error("\nNingún scraper trajo productos. Revisar los scrapers.");
    process.exit(1);
  }
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});

/**
 * Solo crea/actualiza los 7 supermercados, sin productos de ejemplo.
 * Seguro de correr en CI antes de scrapear: es idempotente y no mezcla
 * datos ficticios con los precios reales que traigan los scrapers.
 *
 * Uso: npm run db:seed:stores
 */
import { PrismaClient } from "@prisma/client";
import { stores } from "./stores";

const prisma = new PrismaClient();

async function main() {
  for (const store of stores) {
    await prisma.store.upsert({
      where: { slug: store.slug },
      create: store,
      update: store,
    });
  }
  console.log(`${stores.length} súpers listos.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

import { PrismaClient } from "@prisma/client";
import { normalizeProductName } from "../src/lib/normalize";

const prisma = new PrismaClient();

const stores = [
  { slug: "super-99", name: "Super 99", websiteUrl: "https://www.super99.com" },
  { slug: "riba-smith", name: "Riba Smith", websiteUrl: "https://www.ribasmith.com" },
  { slug: "el-rey", name: "El Rey", websiteUrl: "https://gruporey.com.pa" },
  { slug: "el-machetazo", name: "El Machetazo", websiteUrl: "https://www.elmachetazo.com" },
  { slug: "pricesmart", name: "PriceSmart", websiteUrl: "https://www.pricesmart.com/es-pa" },
  { slug: "super-xtra", name: "Super Xtra", websiteUrl: "https://www.superxtra.com" },
  { slug: "super-carnes", name: "Super Carnes", websiteUrl: "https://www.supercarnes.com" },
];

// Data de ejemplo (NO son precios reales) solo para poder ver la UI de
// comparación funcionando de punta a punta antes de que los scrapers reales
// empiecen a alimentar la base de datos.
const sampleProducts: {
  name: string;
  category: string;
  prices: Partial<Record<(typeof stores)[number]["slug"], number>>;
}[] = [
  {
    name: "Arroz Chino 5lb",
    category: "Despensa",
    prices: {
      "super-99": 4.25,
      "riba-smith": 4.6,
      "el-rey": 4.15,
      "el-machetazo": 4.3,
      "super-xtra": 4.1,
      "super-carnes": 4.05,
    },
  },
  {
    name: "Leche Nido Fortificada 2.6kg",
    category: "Lácteos",
    prices: {
      "super-99": 24.5,
      "riba-smith": 25.75,
      "el-rey": 24.99,
      pricesmart: 22.9,
      "super-xtra": 24.35,
    },
  },
  {
    name: "Aceite Vegetal Puro 1 Galón",
    category: "Despensa",
    prices: {
      "super-99": 12.75,
      "riba-smith": 13.2,
      "el-machetazo": 12.5,
      "super-xtra": 12.6,
      "super-carnes": 12.4,
    },
  },
  {
    name: "Huevos Grado A x30",
    category: "Lácteos y Huevos",
    prices: {
      "super-99": 4.75,
      "el-rey": 4.6,
      pricesmart: 4.1,
      "super-xtra": 4.55,
      "super-carnes": 4.45,
    },
  },
  {
    name: "Pechuga de Pollo x lb",
    category: "Carnes",
    prices: {
      "super-99": 1.89,
      "riba-smith": 2.05,
      "el-rey": 1.95,
      "el-machetazo": 1.85,
      "super-carnes": 1.69,
    },
  },
];

async function main() {
  for (const store of stores) {
    await prisma.store.upsert({
      where: { slug: store.slug },
      create: store,
      update: store,
    });
  }

  for (const sample of sampleProducts) {
    const product = await prisma.product.upsert({
      where: { normalizedName: normalizeProductName(sample.name) },
      create: {
        name: sample.name,
        normalizedName: normalizeProductName(sample.name),
        category: sample.category,
      },
      update: {},
    });

    for (const [storeSlug, price] of Object.entries(sample.prices)) {
      const store = await prisma.store.findUniqueOrThrow({
        where: { slug: storeSlug },
      });
      const url = `${store.websiteUrl}/producto-ejemplo/${product.normalizedName.replace(/\s+/g, "-")}`;

      await prisma.storeProduct.upsert({
        where: { storeId_url: { storeId: store.id, url } },
        create: {
          storeId: store.id,
          productId: product.id,
          rawName: sample.name,
          price: price as number,
          url,
        },
        update: { price: price as number },
      });
    }
  }

  console.log("Seed completado.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

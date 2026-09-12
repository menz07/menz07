/**
 * Herramienta de diagnóstico: hace un fetch plano (sin navegador) a una URL
 * y busca patrones típicos de listados de productos en el HTML (JSON-LD de
 * Schema.org Product, o markup clásico de Magento product-item), para poder
 * armar un scraper por HTML cuando no hay API disponible.
 *
 * Uso: npm run dump-html -- <url>
 */

export {};

async function main() {
  const [url] = process.argv.slice(2);
  if (!url) {
    console.error("Uso: npm run dump-html -- <url>");
    process.exit(1);
  }

  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; PriceCompareBot/1.0)" },
    signal: AbortSignal.timeout(20_000),
  });
  const html = await res.text();
  console.log(`HTTP ${res.status}, ${html.length} bytes\n`);

  // JSON-LD: la forma más limpia de sacar productos si el sitio lo expone.
  const ldMatches = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  console.log(`Bloques JSON-LD encontrados: ${ldMatches.length}`);
  for (const [, block] of ldMatches.slice(0, 5)) {
    console.log(`--- JSON-LD ---\n${block.slice(0, 1500)}\n`);
  }

  // Markup clásico de Magento/Elasticsuite.
  const productItems = [...html.matchAll(/<li class="item product product-item">/g)];
  console.log(`\n<li class="item product product-item"> encontrados: ${productItems.length}`);

  const linkMatches = [...html.matchAll(/product-item-link"[^>]*href="([^"]+)"[^>]*>([^<]+)</g)];
  console.log(`product-item-link encontrados: ${linkMatches.length}`);
  for (const [, href, name] of linkMatches.slice(0, 5)) {
    console.log(`  ${name.trim()} -> ${href}`);
  }

  const priceMatches = [...html.matchAll(/data-price-amount="([^"]+)"/g)];
  console.log(`data-price-amount encontrados: ${priceMatches.length}`);
  console.log(`  primeros valores: ${priceMatches.slice(0, 10).map((m) => m[1]).join(", ")}`);

  if (linkMatches.length) {
    const firstIdx = html.indexOf(linkMatches[0][0]);
    const start = Math.max(0, firstIdx - 1500);
    console.log("\n--- contexto grande alrededor del primer product-item-link ---");
    console.log(html.slice(start, firstIdx + 2500));
  }

  // Si nada de lo anterior aparece, mostramos un bloque grande alrededor de
  // la primera ocurrencia de "product" para ver qué markup usa este tema.
  if (!ldMatches.length && !productItems.length && !linkMatches.length) {
    const idx = html.indexOf("products wrapper");
    if (idx !== -1) {
      console.log("\n--- contexto alrededor de 'products wrapper' ---");
      console.log(html.slice(idx, idx + 3000));
    } else {
      console.log("\nNo encontramos ninguna marca conocida de listado de productos.");
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

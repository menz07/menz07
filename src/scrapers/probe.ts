/**
 * Herramienta de diagnóstico para descubrir qué plataforma de e-commerce usa
 * un súper nuevo, sin tener que inspeccionarlo a mano en el navegador.
 * Pensada para correr en un entorno CON internet real (ver
 * .github/workflows/probe.yml) — este repo se desarrolla en un entorno
 * sandboxeado sin salida a los sitios de los súpers.
 *
 * Uso: npm run probe -- <url1> [url2] [...]
 *
 * Para cada URL:
 *   - Busca firmas de plataformas conocidas (VTEX, WooCommerce, Shopify,
 *     Magento, Next.js/Nuxt con estado embebido) en el HTML de home.
 *   - Prueba los endpoints de API públicos típicos de cada plataforma.
 *   - Imprime un resumen + los primeros bytes de cualquier respuesta que
 *     parezca JSON de catálogo, para poder armar el scraper real a mano.
 */

const TIMEOUT_MS = 15_000;

async function fetchSafe(url: string, headers: Record<string, string> = {}) {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; PriceCompareBot/1.0)",
        ...headers,
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const text = await res.text();
    return { ok: res.ok, status: res.status, text, error: undefined as string | undefined };
  } catch (err) {
    return { ok: false, status: 0, text: "", error: (err as Error).message };
  }
}

const PLATFORM_SIGNATURES: [string, RegExp[]][] = [
  ["VTEX", [/vteximg\.com\.br/i, /vtex\.com\.br/i, /myvtex\.com/i, /vtexassets/i]],
  ["WooCommerce", [/woocommerce/i, /wp-content/i, /wp-json/i]],
  ["Shopify", [/cdn\.shopify\.com/i, /Shopify\.theme/i]],
  ["Magento", [/Mage\.Cookies/i, /magento/i]],
  ["Next.js", [/__NEXT_DATA__/i]],
  ["Nuxt/Vue", [/__NUXT__/i, /window\.__INITIAL_STATE__/i]],
];

async function probeSite(baseUrl: string) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Probando: ${baseUrl}`);
  console.log("=".repeat(60));

  const home = await fetchSafe(baseUrl);
  if (home.error) {
    console.log(`  Home: ERROR — ${home.error}`);
  } else {
    console.log(`  Home: HTTP ${home.status}, ${home.text.length} bytes`);
    const matches = PLATFORM_SIGNATURES.filter(([, patterns]) =>
      patterns.some((p) => p.test(home.text)),
    ).map(([name]) => name);
    console.log(
      matches.length
        ? `  Firmas encontradas en el HTML: ${matches.join(", ")}`
        : "  Sin firmas de plataforma conocidas en el HTML de home.",
    );
  }

  // VTEX: API pública de búsqueda de catálogo.
  const vtex = await fetchSafe(
    `${baseUrl.replace(/\/$/, "")}/api/catalog_system/pub/products/search?ft=leche&_from=0&_to=4`,
  );
  if (vtex.error) {
    console.log(`  VTEX API: ERROR — ${vtex.error}`);
  } else {
    const looksJson = vtex.text.trim().startsWith("[");
    console.log(
      `  VTEX API: HTTP ${vtex.status}${looksJson ? " — responde un array JSON, ¡es VTEX!" : ""}`,
    );
    if (looksJson) console.log(`    Muestra: ${vtex.text.slice(0, 500)}`);
  }

  // WooCommerce: Store API pública (WordPress + plugin WooCommerce).
  const woo = await fetchSafe(
    `${baseUrl.replace(/\/$/, "")}/wp-json/wc/store/v1/products?search=leche&per_page=5`,
  );
  if (woo.error) {
    console.log(`  WooCommerce Store API: ERROR — ${woo.error}`);
  } else {
    const looksJson = woo.text.trim().startsWith("[");
    console.log(
      `  WooCommerce Store API: HTTP ${woo.status}${looksJson ? " — responde un array JSON, ¡es WooCommerce!" : ""}`,
    );
    if (looksJson) console.log(`    Muestra: ${woo.text.slice(0, 500)}`);
  }

  // Shopify: catálogo público en /products.json.
  const shopify = await fetchSafe(
    `${baseUrl.replace(/\/$/, "")}/products.json?limit=5`,
  );
  if (shopify.error) {
    console.log(`  Shopify /products.json: ERROR — ${shopify.error}`);
  } else {
    const looksJson = shopify.text.trim().startsWith("{");
    console.log(
      `  Shopify /products.json: HTTP ${shopify.status}${looksJson && shopify.text.includes('"products"') ? " — ¡es Shopify!" : ""}`,
    );
    if (looksJson && shopify.text.includes('"products"'))
      console.log(`    Muestra: ${shopify.text.slice(0, 500)}`);
  }
}

async function main() {
  const urls = process.argv.slice(2);
  if (!urls.length) {
    console.error("Uso: npm run probe -- <url1> [url2] [...]");
    process.exit(1);
  }
  for (const url of urls) {
    await probeSite(url);
  }
}

main();

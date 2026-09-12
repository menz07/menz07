import type { ScrapedProduct, StoreScraper } from "../types";

/**
 * PriceSmart no es VTEX/Magento/WooCommerce/Shopify (confirmado con
 * probe.ts) — es un sitio a medida (Nuxt/Vue) cuyo buscador llama a la API
 * de "Bloomreach Discovery" (un motor de búsqueda de catálogo de terceros)
 * a través de un proxy en su propio dominio:
 *
 *   POST https://www.pricesmart.com/api/br_discovery/getProductsByKeyword
 *
 * Encontrado inspeccionando las llamadas de red reales con Playwright (ver
 * src/scrapers/capture-network.ts y .github/workflows/capture.yml — este
 * sandbox no tiene salida a internet real, así que la inspección se hizo
 * corriendo esa herramienta en un runner de GitHub Actions). El navegador
 * no hace falta para scrapear: la API responde igual a un fetch() plano
 * con el mismo body/headers que manda el navegador.
 *
 * account_id / domain_key / auth_key / view_id son valores públicos de
 * configuración del tenant de Bloomreach (van embebidos en el JS del sitio,
 * cualquiera los puede ver con las herramientas de desarrollador del
 * navegador) — no son credenciales secretas, son como la "search-only key"
 * pública de Algolia.
 *
 * No expone código de barras (EAN): el campo `fl` de la request no tiene
 * ninguno parecido a ean/upc/barcode, así que este súper hace matching por
 * nombre (igual que Riba Smith).
 */

const SEARCH_URL = "https://www.pricesmart.com/api/br_discovery/getProductsByKeyword";
const ACCOUNT_ID = "7024";
const DOMAIN_KEY = "pricesmart_bloomreach_io_es";
const AUTH_KEY = "ev7libhybjg5h1d1";
const VIEW_ID = "PA";
const ROWS_PER_PAGE = 24;
const MAX_PRODUCTS = 240;

interface BrDoc {
  pid: string;
  title: string;
  price_PA?: number;
  fractionDigits?: number;
  availability_PA?: string;
  thumb_image?: string;
}

interface BrResponse {
  response: {
    numFound: number;
    start: number;
    docs: BrDoc[];
  };
}

async function fetchPage(query: string, start: number): Promise<BrResponse> {
  const searchUrl = `https://www.pricesmart.com/es-pa/busqueda?q=${encodeURIComponent(query)}`;
  const body = [
    {
      url: searchUrl,
      start,
      q: query,
      fq: [],
      search_type: "keyword",
      rows: ROWS_PER_PAGE,
      ref_url: "https://www.pricesmart.com/es-pa/busqueda",
      account_id: ACCOUNT_ID,
      auth_key: AUTH_KEY,
      request_id: Date.now(),
      domain_key: DOMAIN_KEY,
      fl: "pid,title,price,thumb_image,brand,slug,skuid,currency,fractionDigits,master_sku,availability_PA,price_PA,inventory_PA,promoid_PA",
      view_id: VIEW_ID,
    },
  ];

  const res = await fetch(SEARCH_URL, {
    method: "POST",
    headers: {
      Accept: "application/json, text/plain, */*",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    // Ver comentario en ../vtex.ts: sin esto una conexión colgada frena todo el job.
    signal: AbortSignal.timeout(20_000),
  });

  if (!res.ok) {
    throw new Error(
      `PriceSmart: la API de búsqueda respondió ${res.status} ${res.statusText}.`,
    );
  }

  return (await res.json()) as BrResponse;
}

export const priceSmartScraper: StoreScraper = {
  storeSlug: "pricesmart",
  storeName: "PriceSmart",
  implemented: true,
  async scrape(query = ""): Promise<ScrapedProduct[]> {
    const results: ScrapedProduct[] = [];
    let start = 0;
    let numFound = Infinity;

    while (start < numFound && start < MAX_PRODUCTS) {
      const page = await fetchPage(query, start);
      numFound = page.response.numFound;

      for (const doc of page.response.docs) {
        const fractionDigits = doc.fractionDigits ?? 2;
        const price = (doc.price_PA ?? 0) / 10 ** fractionDigits;
        if (price <= 0) continue;

        results.push({
          rawName: doc.title.trim(),
          price,
          url: `https://www.pricesmart.com/site/cr/es/pagina-producto/${doc.pid}`,
          imageUrl: doc.thumb_image,
          inStock: doc.availability_PA !== "false",
        });
      }

      if (page.response.docs.length === 0) break;
      start += ROWS_PER_PAGE;
    }

    return results;
  },
};

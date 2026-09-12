import type { ScrapedProduct, StoreScraper } from "./types";

/**
 * Scraper genérico para tiendas montadas sobre Magento. Confirmado
 * funcionando contra Riba Smith (corrido real vía GitHub Actions): su API
 * GraphQL pública responde catálogo completo sin autenticación.
 *
 *   POST https://{dominio}/graphql
 *   { "query": "{ products(search: \"...\") { ... } }" }
 *
 * Nota: a diferencia de VTEX, el esquema de Magento no trae un campo de
 * código de barras (EAN) estándar — cada tienda tendría que exponerlo como
 * atributo personalizado, y no sabemos cómo se llama ese atributo en cada
 * caso. Por eso estos productos caen al matching por nombre normalizado
 * (ver src/scrapers/upsert.ts) en vez de por EAN.
 */

interface MagentoMoney {
  value: number;
}

interface MagentoPriceRange {
  minimum_price: { final_price: MagentoMoney };
}

interface MagentoProduct {
  name: string;
  sku: string;
  url_key?: string;
  canonical_url?: string;
  price_range: MagentoPriceRange;
  small_image?: { url?: string };
  stock_status?: "IN_STOCK" | "OUT_OF_STOCK";
}

interface MagentoGraphQLResponse {
  data?: { products?: { items: MagentoProduct[] } };
  errors?: { message: string }[];
}

export interface MagentoScraperConfig {
  storeSlug: string;
  storeName: string;
  /** Ej: "https://www.ribasmith.com" (sin slash final). */
  baseUrl: string;
}

const PRODUCT_QUERY = `
  query Search($term: String!) {
    products(search: $term, pageSize: 50) {
      items {
        name
        sku
        url_key
        canonical_url
        price_range {
          minimum_price {
            final_price { value }
          }
        }
        small_image { url }
        stock_status
      }
    }
  }
`;

export function createMagentoScraper(config: MagentoScraperConfig): StoreScraper {
  return {
    storeSlug: config.storeSlug,
    storeName: config.storeName,
    async scrape(query = ""): Promise<ScrapedProduct[]> {
      const res = await fetch(`${config.baseUrl.replace(/\/$/, "")}/graphql`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: PRODUCT_QUERY,
          variables: { term: query },
        }),
        signal: AbortSignal.timeout(20_000),
      });

      if (!res.ok) {
        throw new Error(
          `${config.storeName}: la API respondió ${res.status} ${res.statusText}. ` +
            `Puede que este sitio no use Magento o que la ruta haya cambiado.`,
        );
      }

      const body = (await res.json()) as MagentoGraphQLResponse;
      if (body.errors?.length) {
        throw new Error(
          `${config.storeName}: GraphQL devolvió error — ${body.errors[0].message}`,
        );
      }

      const items = body.data?.products?.items ?? [];

      return items
        .filter((item) => item.price_range.minimum_price.final_price.value > 0)
        .map((item) => ({
          rawName: item.name,
          price: item.price_range.minimum_price.final_price.value,
          url:
            item.canonical_url ??
            (item.url_key
              ? new URL(`/${item.url_key}.html`, config.baseUrl).toString()
              : config.baseUrl),
          imageUrl: item.small_image?.url,
          inStock: item.stock_status !== "OUT_OF_STOCK",
        }));
    },
  };
}

import type { ScrapedProduct, StoreScraper } from "./types";

/**
 * Scraper genérico para tiendas montadas sobre VTEX (Super Xtra y El Machetazo
 * parecen usarlo, a juzgar por el patrón de URL `?map=category-1,brand` en sus
 * páginas de categoría). VTEX expone una API pública de búsqueda de catálogo
 * que no requiere autenticación ni renderizar JavaScript:
 *
 *   GET https://{dominio}/api/catalog_system/pub/products/search?ft={busqueda}
 *
 * IMPORTANTE: esto se armó a partir del esquema documentado/típico de VTEX,
 * pero no se pudo probar contra el sitio real porque este entorno de
 * desarrollo no tiene salida a internet hacia dominios externos. Antes de
 * confiar en los resultados, corré `npm run scrape:test -- <slug>` desde tu
 * máquina o un entorno con internet y revisá que:
 *   - la ruta /api/catalog_system/pub/... responda JSON (y no un 404/HTML)
 *   - los nombres de campo (productName, items, sellers, commertialOffer)
 *     coincidan con la respuesta real
 * Si el sitio no es VTEX, esto va a devolver un array vacío o tirar error,
 * y va a hacer falta un scraper a medida (ver README.md).
 */

interface VtexCommertialOffer {
  Price: number;
  AvailableQuantity: number;
}

interface VtexSeller {
  commertialOffer: VtexCommertialOffer;
}

interface VtexImage {
  imageUrl: string;
}

interface VtexItem {
  images?: VtexImage[];
  sellers: VtexSeller[];
  measurementUnit?: string;
}

interface VtexProduct {
  productName: string;
  link?: string;
  linkText?: string;
  items: VtexItem[];
}

export interface VtexScraperConfig {
  storeSlug: string;
  storeName: string;
  /** Ej: "https://www.superxtra.com" (sin slash final). */
  baseUrl: string;
}

export function createVtexScraper(config: VtexScraperConfig): StoreScraper {
  return {
    storeSlug: config.storeSlug,
    storeName: config.storeName,
    async scrape(query = ""): Promise<ScrapedProduct[]> {
      const searchUrl = new URL(
        "/api/catalog_system/pub/products/search",
        config.baseUrl,
      );
      if (query) searchUrl.searchParams.set("ft", query);
      searchUrl.searchParams.set("_from", "0");
      searchUrl.searchParams.set("_to", "49");

      const res = await fetch(searchUrl, {
        headers: { Accept: "application/json" },
      });
      if (!res.ok) {
        throw new Error(
          `${config.storeName}: la API respondió ${res.status} ${res.statusText}. ` +
            `Puede que este sitio no use VTEX o que la ruta haya cambiado.`,
        );
      }

      const products = (await res.json()) as VtexProduct[];

      const results: ScrapedProduct[] = [];
      for (const product of products) {
        const productUrl = product.linkText
          ? new URL(`/${product.linkText}/p`, config.baseUrl).toString()
          : (product.link ?? config.baseUrl);

        for (const item of product.items) {
          const seller = item.sellers[0];
          if (!seller || seller.commertialOffer.Price <= 0) continue;

          results.push({
            rawName: product.productName,
            price: seller.commertialOffer.Price,
            url: productUrl,
            imageUrl: item.images?.[0]?.imageUrl,
            unit: item.measurementUnit,
            inStock: seller.commertialOffer.AvailableQuantity > 0,
          });
        }
      }
      return results;
    },
  };
}

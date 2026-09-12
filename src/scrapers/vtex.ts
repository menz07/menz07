import type { ScrapedProduct, StoreScraper } from "./types";

/**
 * Scraper genérico para tiendas montadas sobre VTEX. Confirmado funcionando
 * contra Super Xtra y El Machetazo (corrido real vía GitHub Actions, no solo
 * en teoría): ambos exponen la API pública de búsqueda de catálogo, sin
 * autenticación ni necesidad de renderizar JavaScript:
 *
 *   GET https://{dominio}/api/catalog_system/pub/products/search?ft={busqueda}
 *
 * Si un súper nuevo también resulta ser VTEX, se puede reusar este scraper
 * tal cual (ver src/scrapers/stores/super-xtra.ts como ejemplo). Si no, va a
 * tirar 404/error y hace falta un scraper a medida (ver README.md).
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
  /** Código de barras. VTEX a veces usa "0" como valor por defecto cuando no hay uno cargado. */
  ean?: string;
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

          const ean = item.ean && item.ean !== "0" ? item.ean : undefined;

          results.push({
            rawName: product.productName,
            price: seller.commertialOffer.Price,
            url: productUrl,
            imageUrl: item.images?.[0]?.imageUrl,
            unit: item.measurementUnit,
            inStock: seller.commertialOffer.AvailableQuantity > 0,
            ean,
          });
        }
      }
      return results;
    },
  };
}

import type { StoreScraper } from "./types";

/**
 * Placeholder para súpers cuya plataforma todavía no identificamos con
 * certeza (no se pudo inspeccionar el sitio en vivo desde este entorno).
 * Reemplazar por un scraper real siguiendo el patrón de `vtex.ts` o uno
 * a medida con HTML scraping (cheerio) o un navegador headless (playwright)
 * si el sitio depende de JavaScript. Ver README.md → "Agregar un súper nuevo".
 */
export function notImplementedScraper(
  storeSlug: string,
  storeName: string,
): StoreScraper {
  return {
    storeSlug,
    storeName,
    async scrape() {
      throw new Error(
        `El scraper de ${storeName} todavía no está implementado. ` +
          `Hay que revisar su sitio (${storeSlug}) para ver qué API o estructura HTML usa.`,
      );
    },
  };
}

import * as cheerio from "cheerio";
import type { ScrapedProduct, StoreScraper } from "../types";

/**
 * Super Carnes usa Magento, pero a diferencia de los otros súpers Magento
 * (Riba Smith) su API GraphQL (/graphql) devuelve 403 "Access Forbidden"
 * para cualquier POST — un WAF (Fastly/Varnish) bloqueando ese endpoint en
 * particular.
 *
 * Sin embargo, inspeccionando el sitio con un navegador real (Playwright,
 * ver src/scrapers/capture-network.ts) se confirmó que su página de
 * resultados de búsqueda NO usa esa API: es una página HTML clásica
 * server-rendered (`/catalogsearch/result/?q=<busqueda>`), y un fetch()
 * plano a esa URL responde 200 sin problema — el WAF solo bloquea /graphql,
 * no el resto del sitio. Así que en vez de pelear con la API, parseamos el
 * HTML directamente.
 *
 * Cada resultado es un <li class="item product product-item" data-product-sku="...">
 * que trae adentro el precio (data-price-amount) y el link+nombre
 * (.product-item-link). El `data-product-sku` parece un código de barras
 * (13 dígitos), pero empieza en el rango 20-29 — reservado por el estándar
 * GS1 para códigos de circulación interna/uso propio de una tienda, no
 * códigos EAN reales compartidos entre fabricantes. O sea: probablemente es
 * un SKU interno de Super Carnes con forma de EAN, no un EAN real que vaya
 * a coincidir con el mismo producto en otro súper — por eso este scraper no
 * lo manda como `ean`, y el matching entre súpers cae en nombre/fuzzy como
 * con Riba Smith y PriceSmart.
 */

const SEARCH_URL = "https://www.supercarnes.com/catalogsearch/result/";

export const superCarnesScraper: StoreScraper = {
  storeSlug: "super-carnes",
  storeName: "Super Carnes",
  implemented: true,
  async scrape(query = ""): Promise<ScrapedProduct[]> {
    const url = new URL(SEARCH_URL);
    if (query) url.searchParams.set("q", query);

    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; PriceCompareBot/1.0)" },
      // Ver comentario en ../vtex.ts: sin esto una conexión colgada frena todo el job.
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      throw new Error(
        `Super Carnes: la página de búsqueda respondió ${res.status} ${res.statusText}.`,
      );
    }

    const html = await res.text();
    const $ = cheerio.load(html);

    const results: ScrapedProduct[] = [];
    $("li.product-item").each((_, el) => {
      const item = $(el);
      const link = item.find("a.product-item-link").first();
      const name = link.text().trim();
      const productUrl = link.attr("href");
      const priceText = item.find("[data-price-amount]").first().attr("data-price-amount");
      const price = priceText ? Number(priceText) : NaN;
      const imageUrl = item.find("img.product-image-photo").first().attr("src");

      if (!name || !productUrl || !Number.isFinite(price) || price <= 0) return;

      results.push({
        rawName: name,
        price,
        url: productUrl,
        imageUrl,
      });
    });

    return results;
  },
};

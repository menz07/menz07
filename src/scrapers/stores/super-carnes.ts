import { notImplementedScraper } from "../not-implemented";

// Confirmado: usa Magento (script `x-magento-init` en el HTML). Su API
// GraphQL (/graphql) devuelve 403 "Access Forbidden" (Fastly/Varnish) para
// cualquier POST, incluso agregando headers Origin/Referer del propio
// sitio — parece un WAF bloqueando activamente estas peticiones. No vale la
// pena insistir evadiéndolo; si se quiere scrapear este súper, la vía más
// realista es HTML scraping de sus páginas de categoría (supercarnes.com/
// ofertas) en vez de la API.
export const superCarnesScraper = notImplementedScraper("super-carnes", "Super Carnes");

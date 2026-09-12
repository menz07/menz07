import { notImplementedScraper } from "../not-implemented";

// Confirmado: plataforma propia sobre Nuxt/Vue (`window.__NUXT__` en el
// HTML). No es VTEX, WooCommerce ni Magento (sus endpoints públicos típicos
// devuelven 500/404 acá). Su catálogo probablemente se carga vía una API
// interna propia llamada desde el cliente — habría que inspeccionar las
// llamadas de red reales en el navegador (pestaña Network) para encontrar
// esa API, no hay un endpoint estándar que probar a ciegas.
export const priceSmartScraper = notImplementedScraper("pricesmart", "PriceSmart");

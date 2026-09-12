import { notImplementedScraper } from "../not-implemented";

// Confirmado: usa Magento (meta keywords "Magento, Varien, E-commerce" +
// API GraphQL en /graphql). Investigado a fondo (4 rondas de `npm run
// probe`), pero su catálogo no responde por ninguno de los caminos típicos:
//   - `products(search: "leche")` → HTTP 200 con "Internal server error".
//   - `products(filter: { name: { match: "leche" } })` → 0 resultados.
//   - `categoryList` → responde, pero TODAS las categorías reportan
//     product_count: 0.
//   - Probamos también mandando el header `Store: default` (y `base`, que
//     da "store not found") por si el problema era de scope multi-tienda —
//     mismos resultados exactos con o sin el header, así que no es eso.
// Con tres señales independientes fallando igual, esto parece un problema
// real del lado de Super 99 (índice de búsqueda/catálogo roto o productos
// no marcados visibles para el grupo de clientes anónimo), no algo
// resolvible ajustando la query desde acá. Si se quiere insistir, la
// alternativa sería HTML scraping directo de sus páginas de categoría
// (ej. super99.com/despensa) en vez de la API GraphQL.
export const super99Scraper = notImplementedScraper("super-99", "Super 99");

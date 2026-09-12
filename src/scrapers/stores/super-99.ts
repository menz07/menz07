import { notImplementedScraper } from "../not-implemented";

// Confirmado: usa Magento (meta keywords "Magento, Varien, E-commerce" +
// API GraphQL en /graphql). PERO su catálogo no responde por los caminos
// típicos:
//   - `products(search: "leche")` → HTTP 200 con "Internal server error"
//     (probablemente el buscador fulltext/Elasticsearch está roto o mal
//     configurado en su instancia).
//   - `products(filter: { name: { match: "leche" } })` → 0 resultados
//     (la query es válida, pero no encuentra nada — el atributo "name" tal
//     vez no está marcado como filtrable/buscable en su catálogo).
// Probablemente haga falta navegar por categoría (`categoryList` /
// `category(id: …) { products { … } }`) con IDs de categoría reales en vez
// de buscar por texto. Se puede reintentar con `npm run probe -- <url>`
// después de agregar esa variante.
export const super99Scraper = notImplementedScraper("super-99", "Super 99");

# Comparador de Precios de Supermercados (Panamá)

App web para comparar el precio de un mismo producto entre distintos
supermercados de Panamá y ver dónde conviene comprarlo.

Súpers objetivo: Super 99, Riba Smith, El Rey, El Machetazo, PriceSmart,
Super Xtra y Super Carnes.

**Estado actual (datos reales, no de ejemplo):** 4 de 7 súpers funcionando
(Super Xtra, El Machetazo, Riba Smith, PriceSmart) — **~4100 productos**,
**280 comparables entre súpers** (aparecen en 2+ súpers): 236 confirmados
100% por código de barras, y 44 con al menos un precio que entró por
similitud/coincidencia de nombre (marcados "🟡 Coincidencia probable" en la
UI — ni Riba Smith ni PriceSmart publican EAN, ver "Matching de productos"
abajo).

## Stack

- **Next.js (App Router) + TypeScript + Tailwind** — la app web.
- **Prisma + SQLite** — base de datos (fácil de migrar a Postgres más adelante
  si esto crece).
- **Scrapers en `src/scrapers/`** — un módulo por súper que sabe traer
  productos y precios de ese sitio.

## Cómo funciona el modelo de datos

- `Store`: un supermercado.
- `Product`: un producto "canónico" (ej. "Arroz Chino 5lb"), compartido entre
  súpers.
- `StoreProduct`: cómo aparece ese producto en un súper puntual (su nombre
  exacto ahí, precio, URL). Varios `StoreProduct` de distintos súpers se
  enlazan al mismo `Product` para poder compararlos.
- `PriceHistory`: historial de precios de un `StoreProduct` en el tiempo.

**Matching de productos entre súpers**: con data real ya cargada, quedó claro
que comparar nombres es poco confiable — cada súper describe/ordena/abrevia
los nombres a su manera, y la mayoría de las "coincidencias por nombre
parecido" en realidad eran marcas o tamaños distintos (ej. "Arroz Especial
Pelin 5lb" vs "Arroz Especial Del Oro 5lb" no son el mismo producto). Por eso
`Product` tiene un campo `ean` (código de barras): cuando el súper lo publica
(VTEX lo trae en su catálogo), lo usamos como clave principal de matching —
mismo EAN = mismo producto físico, sin importar cómo lo describa cada súper.

Cuando no hay EAN (ej. Magento no lo expone), el orden de fallback es:

1. Nombre normalizado exacto.
2. **Similitud de nombre** (`src/lib/fuzzy-match.ts`) — compara palabras y
   tamaño/unidad extraídos del nombre, con varias reglas pensadas para evitar
   falsos positivos: si un lado dice "sin sal" y el otro "con sal", si
   mencionan frijoles de colores distintos, o si uno declara un tamaño (ej.
   "5lb") y el otro no dice ningún tamaño, se rechaza el match aunque el
   resto del nombre coincida. Esto se ajustó probando contra datos reales:
   la primera versión encontraba 283 "coincidencias" para Riba Smith, pero
   varias eran errores reales (frijoles negros vs bayos, 30 huevos vs una
   docena); la versión final es más conservadora (14 matches) pero mucho más
   confiable.

Como igual puede fallar con nombres ambiguos, cada `StoreProduct` guarda
`matchMethod` (`"ean" | "name" | "fuzzy"`), y la UI marca con
"🟡 Coincidencia probable" los productos donde algún precio viene de un
fuzzy match, para que quien use la app sepa que conviene verificar antes de
ir a comprar.

## Empezar

```bash
npm install
cp .env.example .env
npx prisma migrate dev   # crea prisma/dev.db
npm run db:seed          # carga los 7 súpers + productos de ejemplo (precios ficticios)
npm run dev              # http://localhost:3000
```

## 🤖 Scraping automático (GitHub Actions)

`.github/workflows/scrape.yml` corre todos los días a las 7am hora de Panamá
(y también se puede disparar a mano desde la pestaña "Actions" del repo, botón
"Run workflow"). El job:

1. Crea/actualiza `prisma/data.db` a partir de las migraciones.
2. Asegura que los 7 súpers existan (`npm run db:seed:stores`).
3. Corre `npm run scrape:all`, que busca una canasta de ~25 términos comunes
   (arroz, leche, aceite, pollo, etc. — ver `src/scrapers/search-terms.ts`)
   en cada súper que ya tiene scraper implementado.
4. Si hubo cambios, commitea `prisma/data.db` de vuelta al repo.

`prisma/data.db` sí se versiona en git (a diferencia de `prisma/dev.db`, que
es solo para desarrollo local con datos de ejemplo) — es la forma más simple
de tener "una base de datos con los precios más recientes" sin pagar/armar
un hosting de base de datos aparte. Si el proyecto crece, conviene migrar
a una base de datos real (Postgres) en vez de un archivo SQLite commiteado.

Para ver los precios reales una vez que el workflow haya corrido al menos
una vez:

```bash
git pull
DATABASE_URL="file:./data.db" npm run dev
```

### Nota sobre el entorno de desarrollo

Este proyecto se desarrolló en un entorno con **acceso a internet
restringido** (solo puede llegar a dominios como GitHub/npm, no a los sitios
de los supermercados) — por política de la organización, no algo temporal.
El workflow de GitHub Actions de arriba corre en un runner con internet
completo, así que no depende de este entorno ni de tu computadora — y ya
corrió con éxito: trajo ~4100 productos reales de Super Xtra, El Machetazo,
Riba Smith y PriceSmart, y 280 comparables entre súpers (236 100% por EAN,
44 con algún precio por similitud/coincidencia de nombre).

Estado actual de cada súper (`src/scrapers/stores/`):

| Súper | Estado | Notas |
|---|---|---|
| Super Xtra | ✅ Funcionando (probado en vivo) | VTEX confirmado. Usa la API pública `/api/catalog_system/pub/products/search`. Trae código de barras (EAN). |
| El Machetazo | ✅ Funcionando (probado en vivo) | También VTEX, mismo scraper genérico. Trae EAN. |
| Riba Smith | ✅ Funcionando (probado en vivo) | Magento confirmado. Su API GraphQL pública (`/graphql`, query `search`) respondió 227 resultados reales para "leche". No trae EAN (Magento no lo expone por defecto), así que estos productos hacen fallback a matching por nombre. |
| Super 99 | ⛔ Investigado a fondo, sin suerte | Confirmado Magento, pero `search`, `filter` por nombre, y navegación por categoría (`categoryList`) fallan por igual — con o sin header `Store`. Parece un problema real del lado de ellos (índice de catálogo roto), no algo resolvible desde acá. Ver `src/scrapers/stores/super-99.ts`. |
| Super Carnes | ⛔ Pendiente | Confirmado Magento, pero su WAF (Fastly/Varnish) devuelve 403 a cualquier POST a `/graphql`, incluso con headers Origin/Referer propios del sitio. No se intentó evadirlo más allá de eso. |
| PriceSmart | ✅ Funcionando (probado en vivo) | Plataforma propia sobre Nuxt/Vue, pero su buscador llama a una API de terceros ("Bloomreach Discovery") a través de un proxy propio: `POST /api/br_discovery/getProductsByKeyword`. Se encontró inspeccionando el tráfico real con Playwright (`npm run capture`, ver abajo) — una vez encontrado el endpoint, se scrapea con `fetch` normal, sin necesitar navegador. No trae EAN, así que hace fallback a matching por nombre. |
| El Rey | ⛔ Pendiente | No se encontró catálogo web navegable con precios — su venta online parece estar solo en la app "Rey Delivery" y PedidosYa. Puede que solo se pueda cargar manualmente. |

Todo esto se investigó con `npm run probe -- <urls>` (`.github/workflows/probe.yml`), que corre en un runner con internet real y prueba firmas de plataforma + los endpoints públicos típicos de VTEX/WooCommerce/Magento/Shopify. Cuando un sitio no tiene ninguna API pública estándar (caso PriceSmart), el siguiente paso es `npm run capture -- <url> [término]` (`.github/workflows/capture.yml`), que abre la página con un navegador real (Playwright) y anota todas las llamadas XHR/fetch que dispara, para descubrir su API interna. Antes de confiar en un scraper nuevo, `.github/workflows/test-scraper.yml` lo corre contra una base de datos descartable y muestra qué guardó, sin tocar `prisma/data.db`.

### Probar un solo scraper a mano

```bash
npm run scrape -- "arroz" super-xtra
```

Esto va a pegarle a la API de Super Xtra, y si responde con el formato
esperado, va a guardar los productos/precios en la base de datos. Si el
sitio no es VTEX o cambió su API, va a tirar un error explicando qué pasó.
(`npm run scrape:all` es la versión que corre todos los súpers implementados
contra la canasta completa de términos — la que usa el workflow de CI.)

### Agregar un súper nuevo

1. Abrí el sitio del súper y revisá cómo carga los precios:
   - Si la lista de productos aparece en el HTML tal cual (sin JavaScript),
     se puede scrapear con `fetch` + un parser de HTML como `cheerio`.
   - Si hay una API JSON detrás (mirá la pestaña Network del navegador
     buscando XHR/fetch a `/api/...`), pegarle directo a esa API es más
     rápido y estable que parsear HTML.
   - Si el contenido solo aparece tras ejecutar JavaScript (SPA), hace falta
     un navegador headless (Playwright).
2. Creá `src/scrapers/stores/<nombre>.ts` implementando la interfaz
   `StoreScraper` de `src/scrapers/types.ts` (podés copiar `vtex.ts` como
   base si también es VTEX).
3. Agregalo a `src/scrapers/registry.ts`.
4. Probalo con `npm run scrape -- "<busqueda>" <slug>`.

## Próximos pasos sugeridos

- Afinar más el fuzzy matching: hoy es deliberadamente conservador (rechaza
  cualquier caso donde no pueda confirmar el tamaño/presentación), así que
  deja pasar bastante recall a cambio de precisión. Si el catálogo de algún
  súper Magento resulta tener un atributo custom tipo `barcode`/`ean`
  (`npm run probe` ya chequea esto vía introspección), sería un salto de
  calidad mejor que seguir afinando el matching por texto.
- Implementar los 3 súpers que faltan (Super 99, Super Carnes, El Rey — ver
  tabla de arriba para el detalle de cada bloqueo).
- Página de detalle de producto con historial de precios (ya se guarda en
  `PriceHistory`).
- "Lista de compras": elegir varios productos y ver en qué súper sale más
  barata la lista completa (no solo producto por producto).

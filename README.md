# Comparador de Precios de Supermercados (Panamá)

App web para comparar el precio de un mismo producto entre distintos
supermercados de Panamá y ver dónde conviene comprarlo.

Súpers objetivo: Super 99, Riba Smith, El Rey, El Machetazo, PriceSmart,
Super Xtra y Super Carnes.

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

El matching entre súpers hoy es simple: se normaliza el nombre del producto
(minúsculas, sin acentos/puntuación) y si dos súpers traen el mismo nombre
normalizado, se consideran "el mismo producto". Esto va a fallar con nombres
distintos para el mismo producto (ej. "Arroz Chino 5lb" vs "Arroz Chino
5 libras") — es el próximo problema a resolver a medida que entre data real
(fuzzy matching, o un mapeo manual para casos ambiguos).

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

### ⚠️ Por qué esto no se pudo probar desde este entorno de desarrollo

Este proyecto se desarrolló en un entorno con **acceso a internet
restringido** (solo puede llegar a dominios como GitHub/npm, no a los sitios
de los supermercados) — por política de la organización, no algo temporal.
Por eso los scrapers reales **no se pudieron probar contra los sitios en
vivo** todavía; el workflow de GitHub Actions de arriba es justamente la
forma de correrlos desde un lugar con internet completo sin depender de tu
computadora.

Estado actual de cada súper (`src/scrapers/stores/`):

| Súper | Estado | Notas |
|---|---|---|
| Super Xtra | ✅ Implementado (sin probar en vivo) | Parece usar VTEX (`?map=category-1,brand` en sus URLs de categoría). Usa la API pública `/api/catalog_system/pub/products/search`. |
| El Machetazo | ✅ Implementado (sin probar en vivo) | Mismo indicio de VTEX en sus URLs. |
| Super 99 | ⛔ Pendiente | Tiene "tienda en línea" en super99.com; no se pudo confirmar la plataforma. Revisar si el checkout real pasa por PedidosYa. |
| Riba Smith | ⛔ Pendiente | ribasmith.com — falta inspeccionar. |
| El Rey | ⛔ Pendiente | No se encontró catálogo web navegable con precios — su venta online parece estar solo en la app "Rey Delivery" y PedidosYa. Puede que solo se pueda cargar manualmente. |
| PriceSmart | ⛔ Pendiente | Plataforma propia (URLs tipo `/categoria/Alimentos-G10D03/G10D03`), no parece VTEX. |
| Super Carnes | ⛔ Pendiente | supercarnes.com — falta inspeccionar. |

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

- Automatizar el scraping con un cron (ej. GitHub Actions una vez al día)
  en vez de correrlo a mano.
- Mejorar el matching de productos entre súpers (fuzzy matching por
  nombre + marca + tamaño).
- Página de detalle de producto con historial de precios (ya se guarda en
  `PriceHistory`).
- "Lista de compras": elegir varios productos y ver en qué súper sale más
  barata la lista completa (no solo producto por producto).

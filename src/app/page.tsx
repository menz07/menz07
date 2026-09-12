import { prisma } from "@/lib/prisma";

function formatPrice(price: number) {
  return price.toLocaleString("es-PA", {
    style: "currency",
    currency: "USD",
  });
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const query = q?.trim() ?? "";

  const matches = await prisma.product.findMany({
    where: query ? { name: { contains: query } } : undefined,
    include: {
      storeProducts: {
        where: { inStock: true },
        include: { store: true },
        orderBy: { price: "asc" },
      },
    },
    orderBy: { name: "asc" },
    take: 200,
  });

  // Mostramos primero los productos que sí tenemos en 2+ súpers (donde la
  // comparación de precios realmente sirve), y dentro de esos, los que
  // aparecen en más súpers primero.
  const products = matches
    .map((product) => ({
      ...product,
      distinctStores: new Set(product.storeProducts.map((sp) => sp.storeId))
        .size,
    }))
    .sort((a, b) => b.distinctStores - a.distinctStores)
    .slice(0, 50);

  return (
    <div className="flex flex-col flex-1 bg-zinc-50 font-sans dark:bg-black">
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
          ¿Dónde me sale más barato?
        </h1>
        <p className="mt-2 text-zinc-600 dark:text-zinc-400">
          Compará precios del mismo producto entre supermercados de Panamá.
        </p>

        <form className="mt-6 flex gap-2" action="/">
          <input
            type="text"
            name="q"
            defaultValue={query}
            placeholder="Buscar producto, ej. arroz, leche, aceite..."
            className="flex-1 rounded-lg border border-zinc-300 bg-white px-4 py-2 text-zinc-950 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
          <button
            type="submit"
            className="rounded-lg bg-zinc-950 px-5 py-2 font-medium text-white hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
          >
            Buscar
          </button>
        </form>

        <div className="mt-8 flex flex-col gap-6">
          {products.length === 0 && (
            <p className="text-zinc-500">
              {query
                ? `No encontramos productos que coincidan con "${query}".`
                : "Todavía no hay productos cargados."}
            </p>
          )}

          {products.map((product) => {
            // Solo tiene sentido resaltar "más barato" si hay algo con qué
            // comparar (2+ súpers distintos) — si no, es el único precio
            // que encontramos, no una ganga.
            const cheapest =
              product.distinctStores > 1
                ? product.storeProducts[0]
                : undefined;
            // Si alguno de los precios se enlazó por similitud de nombre en
            // vez de código de barras/nombre exacto, no es 100% seguro que
            // sea el mismo producto físico — lo marcamos para ser honestos.
            const hasUncertainMatch =
              product.distinctStores > 1 &&
              product.storeProducts.some((sp) => sp.matchMethod === "fuzzy");
            return (
              <div
                key={product.id}
                className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <h2 className="text-lg font-medium text-zinc-950 dark:text-zinc-50">
                    {product.name}
                  </h2>
                  <div className="flex shrink-0 items-center gap-2">
                    {hasUncertainMatch && (
                      <span
                        title="Estos precios se cruzaron por parecido de nombre, no por código de barras — puede que no sea exactamente el mismo producto en cada súper."
                        className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
                      >
                        🟡 Coincidencia probable
                      </span>
                    )}
                    {product.category && (
                      <span className="text-sm text-zinc-500">
                        {product.category}
                      </span>
                    )}
                  </div>
                </div>

                <ul className="mt-4 flex flex-col gap-2">
                  {product.storeProducts.map((sp) => {
                    const isCheapest = cheapest && sp.id === cheapest.id;
                    return (
                      <li key={sp.id}>
                        <a
                          href={sp.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors ${
                            isCheapest
                              ? "bg-emerald-50 text-emerald-900 ring-1 ring-emerald-300 dark:bg-emerald-950 dark:text-emerald-200 dark:ring-emerald-800"
                              : "bg-zinc-50 text-zinc-700 hover:bg-zinc-100 dark:bg-zinc-800/60 dark:text-zinc-300 dark:hover:bg-zinc-800"
                          }`}
                        >
                          <span className="font-medium">
                            {sp.store.name}
                            {isCheapest && (
                              <span className="ml-2 rounded-full bg-emerald-600 px-2 py-0.5 text-xs font-semibold text-white">
                                Más barato
                              </span>
                            )}
                            {sp.matchMethod === "fuzzy" && (
                              <span className="ml-2 text-xs font-normal text-zinc-400">
                                (nombre distinto)
                              </span>
                            )}
                          </span>
                          <span className="tabular-nums">
                            {formatPrice(sp.price)}
                          </span>
                        </a>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>

        <p className="mt-10 text-xs text-zinc-400">
          Nota: mientras conectamos los scrapers reales, algunos precios de
          esta demo son datos de ejemplo, no precios verificados en tienda.
        </p>
      </main>
    </div>
  );
}

/** Un producto tal como lo extrajo el scraper de la página del súper, antes de guardarlo en la base de datos. */
export interface ScrapedProduct {
  rawName: string;
  price: number;
  url: string;
  imageUrl?: string;
  unit?: string;
  inStock?: boolean;
}

export interface StoreScraper {
  /** Debe coincidir con el `slug` del Store en la base de datos (ver prisma/seed-stores.ts). */
  storeSlug: string;
  storeName: string;
  /**
   * false para los súpers todavía sin scraper real (ver not-implemented.ts).
   * `run-all.ts` usa esto para no intentar scrapearlos ni llenar el log de errores.
   */
  implemented?: boolean;
  /**
   * Busca productos que coincidan con `query`. Si se omite, el scraper decide
   * qué traer (p.ej. una categoría fija) — útil solo para pruebas rápidas.
   */
  scrape(query?: string): Promise<ScrapedProduct[]>;
}

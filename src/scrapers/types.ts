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
  /** Debe coincidir con el `slug` del Store en la base de datos (ver prisma/seed.ts). */
  storeSlug: string;
  storeName: string;
  /**
   * Busca productos que coincidan con `query`. Si se omite, el scraper decide
   * qué traer (p.ej. una categoría fija) — útil solo para pruebas rápidas.
   */
  scrape(query?: string): Promise<ScrapedProduct[]>;
}

import { createMagentoScraper } from "../magento";

export const ribaSmithScraper = createMagentoScraper({
  storeSlug: "riba-smith",
  storeName: "Riba Smith",
  baseUrl: "https://www.ribasmith.com",
});

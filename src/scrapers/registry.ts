import type { StoreScraper } from "./types";
import { superXtraScraper } from "./stores/super-xtra";
import { elMachetazoScraper } from "./stores/el-machetazo";
import { super99Scraper } from "./stores/super-99";
import { ribaSmithScraper } from "./stores/riba-smith";
import { elReyScraper } from "./stores/el-rey";
import { priceSmartScraper } from "./stores/pricesmart";
import { superCarnesScraper } from "./stores/super-carnes";

export const allScrapers: StoreScraper[] = [
  superXtraScraper,
  elMachetazoScraper,
  super99Scraper,
  ribaSmithScraper,
  elReyScraper,
  priceSmartScraper,
  superCarnesScraper,
];

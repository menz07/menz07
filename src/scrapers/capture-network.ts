/**
 * Herramienta de diagnóstico para súpers sin API pública conocida (ej.
 * PriceSmart): abre la página con un navegador real (Playwright) y anota
 * todas las llamadas XHR/fetch que dispara, para descubrir qué API interna
 * usa el sitio al buscar/listar productos. Pensada para correr en
 * `.github/workflows/capture.yml` (con internet real) — este repo se
 * desarrolla en un entorno sandboxeado sin salida a los sitios de los súpers.
 *
 * Uso: npm run capture -- <url> [terminoDeBusqueda]
 *
 * Si se pasa un término de búsqueda, intenta escribirlo en el primer input
 * de tipo búsqueda/texto que encuentre y apretar Enter, además de solo
 * cargar la URL tal cual.
 */
import { chromium } from "playwright";

const TIMEOUT_MS = 30_000;

interface Captured {
  method: string;
  status: number;
  url: string;
  body: string;
}

async function main() {
  const [url, searchTerm] = process.argv.slice(2);
  if (!url) {
    console.error("Uso: npm run capture -- <url> [terminoDeBusqueda]");
    process.exit(1);
  }

  const browser = await chromium.launch();
  const page = await browser.newPage({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  });

  const captured: Captured[] = [];
  page.on("response", async (response) => {
    const req = response.request();
    const type = req.resourceType();
    if (type !== "xhr" && type !== "fetch") return;
    let body = "";
    try {
      body = await response.text();
    } catch {
      body = "(no se pudo leer el body)";
    }
    captured.push({
      method: req.method(),
      status: response.status(),
      url: response.url(),
      body: body.slice(0, 3000),
    });
  });

  console.log(`Cargando ${url} ...`);
  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: TIMEOUT_MS });
  } catch (err) {
    console.log(`  (timeout esperando networkidle, seguimos igual: ${(err as Error).message})`);
  }

  if (searchTerm) {
    console.log(`Buscando "${searchTerm}" en algún input de la página...`);
    console.log(`  URL antes de buscar: ${page.url()}`);
    const selectors = [
      'input[type="search"]',
      'input[placeholder*="uscar" i]',
      'input[name*="search" i]',
      'input[aria-label*="uscar" i]',
      "#search",
      ".search-input input",
    ];
    let typed = false;
    let usedSelector = "";
    for (const sel of selectors) {
      const input = page.locator(sel).first();
      if ((await input.count()) > 0) {
        try {
          await input.click({ timeout: 3000 });
          await input.fill(searchTerm, { timeout: 3000 });
          typed = true;
          usedSelector = sel;
          console.log(`  Escrito en el selector: ${sel}`);
          break;
        } catch {
          // probamos el siguiente selector
        }
      }
    }
    if (!typed) {
      console.log("  No encontramos un input de búsqueda obvio en la página.");
    } else {
      const before = captured.length;
      await page.locator(usedSelector).first().press("Enter");
      console.log("  Enter presionado, esperando actividad de red...");
      await page.waitForTimeout(4000);
      console.log(`  Llamadas nuevas tras Enter: ${captured.length - before}`);
      for (const c of captured.slice(before)) console.log(`    -> ${c.method} ${c.status} ${c.url}`);
      console.log(`  URL tras Enter: ${page.url()}`);

      if (captured.length === before) {
        console.log("  Enter no disparó llamadas nuevas, probando botón de búsqueda...");
        const buttonSelectors = [
          'button[type="submit"]',
          'button[aria-label*="uscar" i]',
          ".search-button",
          "button.search",
          '[class*="search"] button',
          '[class*="Search"] button',
        ];
        for (const bsel of buttonSelectors) {
          const btn = page.locator(bsel).first();
          if ((await btn.count()) > 0) {
            try {
              await btn.click({ timeout: 3000 });
              console.log(`  Click en botón: ${bsel}`);
              await page.waitForTimeout(4000);
              console.log(`  Llamadas nuevas tras click: ${captured.length - before}`);
              console.log(`  URL tras click: ${page.url()}`);
              break;
            } catch {
              // probamos el siguiente
            }
          }
        }
      }

      try {
        await page.waitForLoadState("networkidle", { timeout: TIMEOUT_MS });
      } catch {
        console.log("  (timeout esperando networkidle tras la búsqueda)");
      }
    }
  }

  await browser.close();

  console.log(`\n${captured.length} llamadas XHR/fetch capturadas:\n`);
  for (const c of captured) {
    console.log(`\n=== ${c.method} ${c.status} ${c.url} ===`);
    console.log(c.body);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

// Helper compartido para los tests Playwright (Fase 0).
// - Sin rutas absolutas: usa channel "chrome" del sistema o CHROMIUM_PATH.
// - BASE_URL configurable: process.env.BASE_URL ?? http://localhost:5199
// - Captura uniforme de errores de consola/pageerror.
import { chromium } from "playwright-core";

export const BASE_URL = process.env.BASE_URL ?? "http://localhost:5199";

const launchArgs = ["--no-sandbox", "--autoplay-policy=no-user-gesture-required"];

export async function launchBrowser() {
  // 1. Override explícito (CI con ruta propia)
  if (process.env.CHROMIUM_PATH) {
    return chromium.launch({ executablePath: process.env.CHROMIUM_PATH, args: launchArgs });
  }
  // 2. Lanzamiento estándar: deja que playwright resuelva el binario.
  //    En Windows usa el Chrome instalado; en CI con `npx playwright install`
  //    usa su caché sin hardcodear versiones (antes: chromium-1243).
  try {
    return await chromium.launch({ args: launchArgs });
  } catch {
    // 3. Fallback: canal chrome del sistema.
    return await chromium.launch({ channel: "chrome", args: launchArgs });
  }
}

export function collectErrors(page) {
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + String(e).slice(0, 300)));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push("console: " + m.text().slice(0, 300));
  });
  return errors;
}

export function assertNoErrors(errors, label = "") {
  if (errors.length) {
    throw new Error(
      `hubo ${errors.length} errores de consola ${label}: ` + errors.slice(0, 5).join(" | ")
    );
  }
}

/** Click por texto (los menús usan divs/buttons sin testids). */
export const jsClick = (page, sel, text) =>
  page.evaluate(
    ([s, t]) => {
      const el = [...document.querySelectorAll(s)].find((x) =>
        (x.textContent || "").includes(t)
      );
      if (el) {
        el.click();
        return true;
      }
      return false;
    },
    [sel, text]
  );

/** Flujo menú → equipos → versus → alineaciones → partido (playing). */
export async function gotoMatch(page, { home = "Real Madrid", away = "Barcelona", duration = "3 min" } = {}) {
  await page.goto(BASE_URL, { waitUntil: "networkidle" });
  await jsClick(page, "button", "Jugar partido");
  await page.waitForTimeout(300);
  await jsClick(page, ".team-card", home);
  await page.waitForTimeout(300);
  await jsClick(page, ".team-card", away);
  await page.waitForTimeout(300);
  await jsClick(page, "button", "Continuar");
  await page.waitForTimeout(400);
  if (duration) {
    await jsClick(page, ".duration-btn", duration);
    await page.waitForTimeout(300);
  }
  await jsClick(page, "button", "Ver alineaciones");
  await page.waitForTimeout(400);
  await jsClick(page, "button", "¡A jugar!");
  await page.waitForFunction(() => window.__match?.phase === "playing", null, {
    timeout: 30000,
  });
  // En headless los efectos de Simulation (teclado/Esc dentro del Canvas R3F)
  // tardan en registrarse: esperar a que la entrada esté enganchada antes de
  // pulsar teclas (flushInput lo expone ese mismo efecto).
  await page.waitForFunction(() => typeof window.__match?.engine?.flushInput === "function", null, {
    timeout: 60000,
  });
}

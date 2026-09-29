// Prueba de humo completa (Fase 0.3): cubre en una sola pasada
// menú → selección de equipos → partido → gol → repetición → final → revancha.
// - Usa el helper compartido (sin rutas absolutas, BASE_URL configurable).
// - Registra todos los errores de consola/pageerror y falla si hay alguno.
// - Guarda capturas en test/shots/smoke_*.png y vuelca console-errors.log.
import fs from "node:fs";
import { launchBrowser, BASE_URL, collectErrors, jsClick, gotoMatch } from "./helpers.mjs";

const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors = collectErrors(page);
const step = (m) => console.log("[smoke]", m);

try {
  // 1. Menú visible
  await page.goto(BASE_URL + "/", { waitUntil: "networkidle" });
  const menuOk = await page.evaluate(() => document.body.textContent.includes("FÚTBOL 3D"));
  if (!menuOk) throw new Error("menú principal no visible");
  await page.screenshot({ path: "test/shots/smoke_01_menu.png" });
  step("menú OK");

  // 2. Selección de equipos → partido (3 min, la más corta)
  await gotoMatch(page, { home: "Real Madrid", away: "Barcelona", duration: "3 min" });
  await page.screenshot({ path: "test/shots/smoke_02_partido.png" });
  step("navegación a partido OK (playing)");

  // 3. El controlado se mueve con input real (I = atacar/arriba).
  // En headless el render va a ~0,5 FPS: se espera en tiempo de SIMULACIÓN
  // (no de pared) para no medir en frío durante la compilación de shaders.
  await page.waitForFunction(() => window.__match.engine.time > 1, null, { timeout: 120000 });
  const pos0 = await page.evaluate(() => {
    const { engine, getControlled } = window.__match;
    const c = getControlled(engine);
    return { x: c.x, z: c.z, t: engine.time };
  });
  await page.keyboard.down("i");
  await page.waitForFunction(
    (t0) => window.__match.engine.time > t0 + 1,
    pos0.t, { timeout: 120000 }
  );
  await page.keyboard.up("i");
  const pos1 = await page.evaluate(() => {
    const { engine, getControlled } = window.__match;
    const c = getControlled(engine);
    return { x: c.x, z: c.z };
  });
  const moved = Math.hypot(pos1.x - pos0.x, pos1.z - pos0.z);
  step(`movimiento del controlado: ${moved.toFixed(2)} m`);
  if (!(moved > 0.1)) throw new Error("el controlado no se movió con el teclado");

  // 4. Gol determinista → banner → repetición automática
  await page.evaluate(() => window.__match.provokeGoal("home"));
  await page.waitForFunction(() => window.__match?.phase === "goal", null, { timeout: 30000 });
  const banner = await page.waitForFunction(() => document.querySelector(".goal-banner"), null, {
    timeout: 30000, polling: 100,
  });
  const bannerText = await banner.evaluate((el) =>
    el.textContent.replace(/\s+/g, " ").slice(0, 80)
  );
  step(`banner de gol: ${bannerText}`);
  await page.screenshot({ path: "test/shots/smoke_03_gol.png" });
  await page.waitForFunction(() => !!document.querySelector(".replay-label"), null, {
    timeout: 30000, polling: 200,
  });
  const replayText = await page.evaluate(() =>
    document.querySelector(".replay-label").textContent.replace(/\s+/g, " ").slice(0, 80)
  );
  step(`repetición: ${replayText}`);
  await page.waitForTimeout(2000);
  await page.screenshot({ path: "test/shots/smoke_04_replay.png" });

  // 5. Saltar repetición con tecla dedicada (Enter) → vuelta a playing
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => window.__match?.phase === "playing", null, { timeout: 60000 });
  const score = await page.evaluate(() =>
    document.querySelector(".scoreboard .goals").textContent.trim()
  );
  step(`repetición saltada, marcador: ${score}`);
  if (!score.includes("1")) throw new Error("el gol no subió al marcador: " + score);

  // 6. Final del partido (forzamos el reloj al límite de 3 min)
  await page.evaluate(() => {
    window.__match.engine.matchTime = 3 * 60 - 0.05;
  });
  await page.waitForFunction(() => !!document.querySelector(".overlay h2"), null, { timeout: 60000 });
  const finalTitle = await page.evaluate(() => document.querySelector(".overlay h2").textContent);
  step(`pantalla final: ${finalTitle}`);
  if (!/FINAL/i.test(finalTitle)) throw new Error("no apareció la pantalla final");
  await page.screenshot({ path: "test/shots/smoke_05_final.png" });

  // 7. Revancha → partido limpio (0-0, playing)
  await jsClick(page, "button", "Revancha");
  await page.waitForTimeout(3000);
  const revancha = await page.evaluate(() => ({
    phase: window.__match?.phase,
    score: document.querySelector(".scoreboard .goals")?.textContent.trim(),
  }));
  step(`tras revancha: ${JSON.stringify(revancha)}`);
  if (revancha.phase !== "playing") throw new Error("la revancha no volvió a playing");
  if (revancha.score !== "0 - 0" && revancha.score !== "0-0")
    throw new Error("la revancha no reinició el marcador: " + revancha.score);
  await page.screenshot({ path: "test/shots/smoke_06_revancha.png" });

  step("HUMO COMPLETO: TODO OK");
} finally {
  fs.writeFileSync("test/shots/console-errors.log", errors.length ? errors.join("\n") + "\n" : "0 errores\n");
  console.log(`[smoke] errores de consola: ${errors.length}`);
  for (const e of errors.slice(0, 10)) console.log("  -", e);
  await browser.close();
  if (errors.length) process.exit(1);
}

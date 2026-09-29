// Test Fase 6: entrenamiento.
// - Lista de 7 drills desde el menú; progreso persistido.
// - Cada drill arranca con su tarjeta; completar/teleportar marca ✅.
// - Pase (2 reales), cambio (Q real), falta (ejecución real) y tiro (gol real).
// - Repetir / Saltar / Salir por UI. 0 errores de consola.
import { launchBrowser, BASE_URL, jsClick } from "./helpers.mjs";

const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + String(e).slice(0, 220)));
page.on("console", (m) => {
  if (m.type() === "error") errors.push("console: " + m.text().slice(0, 220));
});
const ev = (fn, arg) => page.evaluate(fn, arg);
const doneCard = () => page.waitForFunction(
  () => document.querySelector(".drill-card")?.textContent.includes("superado"),
  null, { timeout: 30000, polling: 300 }
);

try {
  // 1. Menú → Entrenamiento → lista de 7.
  await page.goto(BASE_URL + "/", { waitUntil: "networkidle" });
  await jsClick(page, "button", "Entrenamiento");
  await page.waitForTimeout(500);
  const items = await ev(() => [...document.querySelectorAll(".drill-item-title")].map((e) => e.textContent));
  console.log("drills:", JSON.stringify(items));
  if (items.length !== 7) throw new Error("se esperaban 7 drills: " + items.length);

  // 2. Drill 1 (movimiento): tarjeta + completar por posición.
  await jsClick(page, ".drill-item", "Movimiento");
  await page.waitForFunction(() => window.__match?.phase === "playing", null, { timeout: 30000 });
  await page.waitForFunction(() => !!document.querySelector(".drill-card"), null, { timeout: 15000 });
  console.log("tarjeta drill 1: OK");
  // Esperar la firma del setup (colocado en -20,0) antes de teletransportar.
  await page.waitForFunction(() => {
    const c = window.__match.engine.players.find((p) => p.controlled);
    return Math.hypot(c.x + 20, c.z) < 1;
  }, null, { timeout: 30000, polling: 300 });
  await ev(() => {
    const c = window.__match.engine.players.find((p) => p.controlled);
    c.x = 10; c.z = 0; c.vx = 0; c.vz = 0;
  });
  await doneCard();
  const saved = await ev(() => window.localStorage.getItem("f3d.drillsDone"));
  if (!/move/.test(saved || "")) throw new Error("el progreso no persistió");
  console.log("drill 1 superado + persistido: OK");
  await page.screenshot({ path: "test/shots/fase6_drill.png" });

  // 3. Botones por UI: Siguiente → drill 2, Repetir, Salir.
  await jsClick(page, ".drill-btns button", "Siguiente");
  await page.waitForTimeout(1500);
  const d2 = await ev(() => window.__store.getState().drillId);
  if (d2 !== "sprint") throw new Error("Siguiente no avanzó: " + d2);
  await page.waitForFunction(() => {
    const c = window.__match.engine.players.find((p) => p.controlled);
    return Math.hypot(c.x + 30, c.z) < 1;
  }, null, { timeout: 30000, polling: 300 });
  await ev(() => {
    const c = window.__match.engine.players.find((p) => p.controlled);
    c.x = 30; c.z = 0; c.stamina = 90;
  });
  await doneCard();
  console.log("drill 2 (sprint) superado: OK");
  await jsClick(page, ".drill-btns button", "Repetir");
  await page.waitForTimeout(1500);
  const still = await ev(() => window.__store.getState().drillId);
  if (still !== "sprint") throw new Error("Repetir salió del drill");
  console.log("Repetir: OK");
  await jsClick(page, ".drill-btns button", "Salir");
  await page.waitForFunction(
    () => [...document.querySelectorAll("button")].some((b) => b.textContent.includes("Entrenamiento")),
    null, { timeout: 15000 }
  );
  console.log("Salir: OK");

  // 4. Drill 3 (pase): 2 pases reales por la vía del motor.
  await jsClick(page, "button", "Entrenamiento");
  await page.waitForTimeout(500);
  await jsClick(page, ".drill-item", "3 · Pase");
  await page.waitForFunction(() => window.__match?.phase === "playing", null, { timeout: 30000 });
  await page.waitForTimeout(1500); // deja que el setup del drill se aplique
  const onePass = (idx, dz) => ev(async ({ i, z }) => {
    const { engine } = window.__match;
    const { doGroundPass } = await import("/src/game/passing.js");
    const c = engine.players.find((p) => p.controlled);
    const mates = engine.players.filter((p) => p.side === c.side && p !== c && p.role !== "GK");
    const mate = mates[i];
    for (const p of engine.players) p.hasBall = false;
    c.hasBall = true;
    const b = engine.ball;
    b.x = c.x; b.z = c.z; b.y = 0.22; b.vx = b.vy = b.vz = 0;
    mate.x = c.x + 8; mate.z = c.z + z;
    mate.vx = 0; mate.vz = 0;
    doGroundPass(engine, c, { x: 1, z: 0 }, mate);
  }, { i: idx, z: dz });
  await onePass(0, -4);
  await page.waitForTimeout(700); // deja que el overlay cuente el pase
  await onePass(1, 4);
  await doneCard();
  console.log("drill 3 (pase x2) superado: OK");

  // 5. Drill 6 (cambio): Q real.
  await ev(() => window.__store.getState().quitDrill());
  await page.waitForTimeout(800);
  await jsClick(page, "button", "Entrenamiento");
  await page.waitForTimeout(500);
  await jsClick(page, ".drill-item", "6 · Cambio");
  await page.waitForFunction(() => window.__match?.phase === "playing", null, { timeout: 30000 });
  await page.waitForTimeout(1500);
  // Reintento: en headless frío la pulsación puede caer entre frames lentos.
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press("q");
    try {
      await doneCard();
      break;
    } catch {
      if (i === 2) throw new Error("Q no cambió de jugador tras 3 intentos");
    }
  }
  console.log("drill 6 (cambio) superado: OK");

  // 6. Drill 7 (falta): ejecución real con A.
  await ev(() => window.__store.getState().quitDrill());
  await page.waitForTimeout(800);
  await jsClick(page, "button", "Entrenamiento");
  await page.waitForTimeout(500);
  await jsClick(page, ".drill-item", "7 · Balón");
  await page.waitForFunction(() => window.__match?.phase === "playing", null, { timeout: 30000 });
  await page.waitForFunction(
    () => window.__match.engine.deadBall?.state === "DEAD_BALL_READY",
    null, { timeout: 30000, polling: 300 }
  );
  await page.keyboard.down("a");
  await page.waitForTimeout(150);
  await page.keyboard.up("a");
  // Reintento si el tap cayó entre frames lentos de headless.
  for (let i = 0; i < 3; i++) {
    const st = await ev(() => window.__match.engine.deadBall?.state);
    if (st !== "DEAD_BALL_READY") break;
    await page.waitForTimeout(2500);
    await page.keyboard.down("a");
    await page.waitForTimeout(150);
    await page.keyboard.up("a");
  }
  await doneCard();
  console.log("drill 7 (falta) superado: OK");

  // 7. Drill 4 (tiro): tiro real con carga desde cerca, a la esquina.
  await ev(() => window.__store.getState().quitDrill());
  await page.waitForTimeout(800);
  await jsClick(page, "button", "Entrenamiento");
  await page.waitForTimeout(500);
  await jsClick(page, ".drill-item", "4 · Tiro");
  await page.waitForFunction(() => window.__match?.phase === "playing", null, { timeout: 30000 });
  await page.waitForTimeout(1500);
  await ev(async () => {
    const { engine } = window.__match;
    const { startShotCharge, releaseShot } = await import("/src/game/shooting.js");
    const c = engine.players.find((p) => p.controlled);
    for (const p of engine.players) p.hasBall = false;
    c.x = 44; c.z = -6; c.vx = 0; c.vz = 0; c.hasBall = true;
    const b = engine.ball;
    b.x = 44; b.z = -6; b.y = 0.22; b.vx = b.vy = b.vz = 0;
    const dx = 52.5 - 44, dz = 2.5 - -6;
    const l = Math.hypot(dx, dz);
    startShotCharge(engine, c, { x: dx / l, z: dz / l });
    engine.charge.t = 0.9;
    releaseShot(engine);
  });
  for (let i = 0; i < 6; i++) {
    await page.waitForTimeout(5000);
    const dbg = await ev(() => JSON.stringify({
      ball: { x: +window.__match.engine.ball.x.toFixed(1), z: +window.__match.engine.ball.z.toFixed(1) },
      phase: window.__match.phase,
      events: window.__store.getState().events.length,
      card: document.querySelector(".drill-card")?.textContent.replace(/\s+/g, " ").slice(0, 50),
    }));
    console.log("tiro:", dbg);
    if (/superado/.test(dbg)) break;
  }
  await doneCard();
  console.log("drill 4 (tiro) superado: OK");

  // 8. Drill 5 (defensa): al lado del corredor → disputa real.
  await ev(() => window.__store.getState().quitDrill());
  await page.waitForTimeout(800);
  await jsClick(page, "button", "Entrenamiento");
  await page.waitForTimeout(500);
  await jsClick(page, ".drill-item", "5 · Defensa");
  await page.waitForFunction(() => window.__match?.phase === "playing", null, { timeout: 30000 });
  await page.waitForTimeout(2500); // setup + guion en marcha
  const tackle = await ev(async () => {
    const { engine, processActions } = window.__match;
    const { stepEngine } = await import("/src/game/engine.js");
    const c = engine.players.find((p) => p.controlled);
    const b = engine.ball;
    // Detrás del balón largo, con el rival suficientemente lejos: entrada
    // limpia. Avanzamos la física directamente para que la prueba no dependa
    // de los FPS de SwiftShader en el navegador headless.
    c.x = b.x - 0.9; c.z = b.z; c.vx = 0; c.vz = 0;
    c.tackleCd = 0; c.tackleT = 0;
    processActions(engine, {
      move: { x: 0, z: 0 }, switchMove: null, sprint: false,
      events: ["tackleDown"], device: "keyboard",
    }, 1 / 60);
    for (let i = 0; i < 20 && !c.hasBall; i++) {
      stepEngine(engine, 1 / 60, { x: 0, z: 0 }, {});
    }
    return { hasBall: c.hasBall, tackleCd: c.tackleCd, lastTouch: b.lastTouch };
  });
  console.log("entrada drill 5:", JSON.stringify(tackle));
  if (!tackle.hasBall) throw new Error("la entrada del drill 5 no recuperó el balón");
  await doneCard();
  console.log("drill 5 (defensa) superado: OK");

  const allDone = await ev(() => window.localStorage.getItem("f3d.drillsDone"));
  console.log("progreso:", allDone);

  console.log("errores de consola:", errors.length);
  for (const e of errors.slice(0, 10)) console.log("  -", e);
  await browser.close();
  if (errors.length) process.exit(1);
  console.log("FASE 6 OK");
} catch (e) {
  console.log("errores de consola:", errors.length);
  for (const err of errors.slice(0, 10)) console.log("  -", err);
  await browser.close();
  throw e;
}

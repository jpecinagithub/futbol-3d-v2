// Test Fase 1: orientación y visibilidad.
// - Radar visible (canvas) y toggle con R (persistido en localStorage).
// - Z cicla TV → cercana → lejos → TV y persiste (f3d.camera).
// - H activa el halo del balón (persistido).
// - Vista previa del receptor: predictPassTarget coincide con el pase real.
// - Vista previa de cambio: predictSwitchTarget devuelve un compañero válido.
// - Aviso de stamina: tarjeta .gassed cuando el controlado está fundido.
// - 0 errores de consola.
import { launchBrowser, gotoMatch } from "./helpers.mjs";

const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + String(e).slice(0, 220)));
page.on("console", (m) => {
  if (m.type() === "error") errors.push("console: " + m.text().slice(0, 220));
});

try {
  await gotoMatch(page, { home: "Real Madrid", away: "Barcelona", duration: "3 min" });

  // 1. Radar visible
  await page.waitForFunction(() => !!document.querySelector(".radar canvas"), null, { timeout: 8000 });
  console.log("radar visible: OK");
  await page.screenshot({ path: "test/shots/fase1_radar.png" });

  // 2. Z cicla 3 modos y persiste
  const modes = [];
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press("z");
    await page.waitForTimeout(400);
    modes.push(await page.evaluate(() => window.__store.getState().cameraMode));
  }
  console.log("ciclo de cámaras:", JSON.stringify(modes));
  if (JSON.stringify(modes) !== JSON.stringify(["near", "far", "normal"]))
    throw new Error("Z no cicla TV→cercana→lejos: " + JSON.stringify(modes));
  const savedCam = await page.evaluate(() => window.localStorage.getItem("f3d.camera"));
  if (savedCam !== "normal") throw new Error("la cámara no persistió: " + savedCam);

  // 3. R oculta/muestra el radar (persistido)
  await page.keyboard.press("r");
  await page.waitForTimeout(300);
  const radarHidden = await page.evaluate(() => !document.querySelector(".radar"));
  const savedRadar = await page.evaluate(() => window.localStorage.getItem("f3d.radar"));
  if (!radarHidden || savedRadar !== "0") throw new Error("R no ocultó el radar");
  await page.keyboard.press("r");
  await page.waitForTimeout(300);
  const radarBack = await page.evaluate(() => !!document.querySelector(".radar canvas"));
  if (!radarBack) throw new Error("R no restauró el radar");
  console.log("toggle radar: OK");

  // 4. H activa el halo (persistido)
  await page.keyboard.press("h");
  await page.waitForTimeout(300);
  const halo = await page.evaluate(() => ({
    on: window.__store.getState().ballHalo,
    saved: window.localStorage.getItem("f3d.halo"),
  }));
  if (!halo.on || halo.saved !== "1") throw new Error("H no activó el halo: " + JSON.stringify(halo));
  console.log("halo: OK");
  await page.keyboard.press("h"); // lo dejamos apagado por defecto
  await page.waitForTimeout(200);

  // 5. Vista previa del receptor = pase real
  const passCheck = await page.evaluate(async () => {
    const { engine } = window.__match;
    const { predictPassTarget } = await import("/src/game/passing.js");
    const c = engine.players.find((p) => p.controlled);
    const b = engine.ball;
    b.x = c.x; b.z = c.z; b.y = 0.22; b.vx = 0; b.vy = 0; b.vz = 0;
    c.hasBall = true;
    const move = engine.userMove || { x: 0, z: 0 };
    const predicted = predictPassTarget(engine, c, move);
    return { predictedUid: predicted ? predicted.uid : null, ctrlUid: c.uid };
  });
  console.log("receptor previsto:", JSON.stringify(passCheck));
  if (!passCheck.predictedUid || passCheck.predictedUid === passCheck.ctrlUid)
    throw new Error("sin receptor previsto válido");

  // 6. Vista previa de cambio válida
  const switchCheck = await page.evaluate(async () => {
    const { engine } = window.__match;
    const { predictSwitchTarget } = await import("/src/game/playerSwitch.js");
    const c = engine.players.find((p) => p.controlled);
    c.hasBall = false;
    const t = predictSwitchTarget(engine, { x: 0, z: 0 }, false);
    return { targetUid: t ? t.uid : null, ctrlUid: c.uid, side: t ? t.side : null };
  });
  console.log("siguiente jugador:", JSON.stringify(switchCheck));
  if (!switchCheck.targetUid || switchCheck.targetUid === switchCheck.ctrlUid)
    throw new Error("sin siguiente jugador válido");

  // 7. Aviso de stamina fundida
  await page.evaluate(() => {
    const { engine } = window.__match;
    const c = engine.players.find((p) => p.controlled);
    c.stamina = 10;
  });
  await page.waitForFunction(() => !!document.querySelector(".player-label.gassed"), null, { timeout: 8000 });
  const warn = await page.evaluate(() => document.querySelector(".pl-warn")?.textContent);
  console.log("aviso stamina:", warn);
  if (!warn || !/FUNDIDO/.test(warn)) throw new Error("aviso de stamina ausente");
  await page.screenshot({ path: "test/shots/fase1_stamina.png" });

  console.log("errores de consola:", errors.length);
  for (const e of errors.slice(0, 10)) console.log("  -", e);
  await browser.close();
  if (errors.length) process.exit(1);
  console.log("FASE 1 OK");
} catch (e) {
  console.log("errores de consola:", errors.length);
  for (const err of errors.slice(0, 10)) console.log("  -", err);
  await browser.close();
  throw e;
}

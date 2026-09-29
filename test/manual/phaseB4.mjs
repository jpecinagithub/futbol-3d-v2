// Test Fase B (4): stamina por pasos directos + aviso de falta en el store.
import { launchBrowser, BASE_URL } from "./helpers.mjs";
const errors = [];
const browser = await launchBrowser();
const page = await browser.newPage();
page.on("pageerror", (e) => errors.push("pageerror: " + String(e).slice(0, 200)));
await page.goto(BASE_URL + "/", { waitUntil: "networkidle" });
const jsClick = (sel, text) =>
  page.evaluate(([s, t]) => {
    const el = [...document.querySelectorAll(s)].find((x) => x.textContent.includes(t));
    if (el) el.click();
  }, [sel, text]);
await jsClick("button", "Jugar partido"); await page.waitForTimeout(300);
await jsClick(".team-card", "Real Madrid"); await page.waitForTimeout(300);
await jsClick(".team-card", "Barcelona"); await page.waitForTimeout(300);
await jsClick("button", "Continuar"); await page.waitForTimeout(400);
await jsClick("button", "Ver alineaciones"); await page.waitForTimeout(400);
await jsClick("button", "¡A jugar!"); await page.waitForTimeout(1500);

const res = await page.evaluate(() => {
  const { engine, stepEngine, getControlled } = window.__match;
  const c = getControlled(engine);
  c.stamina = 100;
  // 10 s simulados esprintando
  for (let i = 0; i < 600; i++) {
    stepEngine(engine, 1 / 60, { x: 0, z: -1, sprint: true }, {});
  }
  const afterSprint = c.stamina;
  const spd = Math.hypot(c.vx, c.vz);
  // 20 s trotando recupera
  for (let i = 0; i < 1200; i++) {
    stepEngine(engine, 1 / 60, { x: 0, z: -1, sprint: false }, {});
  }
  return { afterSprint: +afterSprint.toFixed(1), spd: +spd.toFixed(2), afterRest: +c.stamina.toFixed(1), max: +c.maxSpeed.toFixed(2) };
});
console.log("stamina:", JSON.stringify(res));

// aviso de falta en el store (simula registerFoul vía entrada directa)
const notice = await page.evaluate(async () => {
  const { engine } = window.__match;
  const mod = await import("/src/game/fouls.js");
  const c = engine.players.find((p) => p.uid === engine.controlledUid);
  const opp = engine.players.find((p) => p.side === "away" && p.role !== "GK");
  mod.registerFoul(engine, { by: c, victim: opp, touchedBallFirst: false, intensity: 8 });
  const { useMatchStore } = await import("/src/stores/useMatchStore.js");
  return { notice: useMatchStore.getState().notice, freeze: engine.foulFreeze, fouls: engine.fouls.length };
});
console.log("notice:", JSON.stringify(notice));
console.log("consoleErrors:", JSON.stringify(errors));
await browser.close();
if (errors.length) process.exitCode = 2;

// Test Fase B (3): falta por entrada + robo limpio, por pasos directos del motor.
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

const setup = (tacklerDist) => page.evaluate((td) => {
  const { engine } = window.__match;
  const c = engine.players.find((p) => p.uid === engine.controlledUid);
  const opp = engine.players.find((p) => p.side === "away" && p.role !== "GK");
  for (const p of engine.players) { p.hasBall = false; p.tackleT = 0; p.passCd = 999; }
  opp.x = 10; opp.z = 0; opp.vx = opp.vz = 0; opp.facing = 0;
  const b = engine.ball;
  b.x = 10.4; b.z = 0; b.y = 0.11; b.vx = b.vy = b.vz = 0;
  b.lastTouch = null; b.touchCooldown = 0; b.spin = 0;
  opp.hasBall = true; opp.touchTimer = 99; // que no toque: mantiene el balón quieto
  c.x = 10 + td; c.z = 0; c.vx = c.vz = 0; c.facing = Math.PI; c.tackleCd = 0;
  engine.fouls.length = 0; engine.foulFreeze = 0; engine.charge = null;
  return { oppUid: opp.uid, ctrlUid: c.uid };
}, tacklerDist);

const stepMany = (events, n) => page.evaluate(([evs, n]) => {
  const { engine, stepEngine, processActions } = window.__match;
  for (let i = 0; i < n; i++) {
    const fin = {
      move: { x: 0, z: 0 }, downCodes: {}, sprint: false, sprintPressed: false,
      dribbleMod: false, helper: false, shootHeld: false,
      events: i === 0 ? evs : [],
    };
    processActions(engine, fin, 1 / 60);
    stepEngine(engine, 1 / 60, { x: 0, z: 0 }, {});
  }
  const c = getControlled(engine);
  return {
    fouls: engine.fouls.length,
    byName: engine.fouls[0]?.byName || null,
    touchedBallFirst: engine.fouls[0]?.touchedBallFirst ?? null,
    freeze: +engine.foulFreeze.toFixed(2),
    ctrlHasBall: c.hasBall,
  };
}, [events, n]);

// CASO 1: entrada al cuerpo (tackler a 1.6 m del balón, rival pegado) => FALTA
await setup(1.6);
const foulCase = await stepMany(["shootDown"], 40);
console.log("falta:", JSON.stringify(foulCase));

// CASO 2: robo limpio (tackler a 0.9 m, encara balón, rival a 0.45 m del balón pero
// el tackler llega antes al balón) => el controlado se queda el balón, sin falta
await setup(0.9);
const cleanCase = await stepMany(["shootDown"], 40);
console.log("robo:", JSON.stringify(cleanCase));

console.log("consoleErrors:", JSON.stringify(errors));
await browser.close();
if (errors.length) process.exitCode = 2;

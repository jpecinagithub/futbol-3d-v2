// Verifica el arreglo del "pase sin autorización" (punto 3):
// A1: A pulsada para ENTRAR (sin balón), se gana el balón a mitad de
//     pulsación y se suelta -> NO debe salir un pase.
// A2: A pulsada y soltada CON balón -> SÍ sale el pase (comportamiento normal).
// B:  Q con balón -> el ex-controlado (IA) no pasa/tira en los primeros 2 s.
// Uso: node test/fix3.mjs
import { launchBrowser, BASE_URL } from "./helpers.mjs";

const errors = [];
const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 200)); });
page.on("pageerror", (e) => errors.push("pageerror: " + String(e).slice(0, 200)));
await page.goto(BASE_URL + "/", { waitUntil: "networkidle" });
const jsClick = (sel, text) => page.evaluate(([s, t]) => {
  const el = [...document.querySelectorAll(s)].find((x) => x.textContent.includes(t));
  if (!el) return "NOT-FOUND:" + t; el.click(); return "ok";
}, [sel, text]);
await jsClick("button", "Jugar partido"); await page.waitForTimeout(400);
await jsClick(".team-card", "Real Madrid"); await page.waitForTimeout(400);
await jsClick(".team-card", "Barcelona"); await page.waitForTimeout(400);
await jsClick("button", "Continuar"); await page.waitForTimeout(600);
await jsClick("button", "Ver alineaciones"); await page.waitForTimeout(600);
await jsClick("button", "¡A jugar!");
await page.waitForFunction(
  () => { const m = window.__match; return m && m.engine.deadBall && m.engine.deadBall.state === "OPEN_PLAY"; },
  { polling: 200, timeout: 60000 }
);
await page.waitForTimeout(1500);
const st = (fn, arg) => page.evaluate(fn, arg);
await st(() => window.__store.getState().pause());

const results = [];
const check = (name, ok, extra = "") =>
  results.push((ok ? "OK   " : "FAIL ") + name + (extra ? " - " + extra : ""));

const r = await st(() => {
  const m = window.__match;
  const e = m.engine;
  const mkFin = (events, downCodes = {}) => ({
    move: { x: 0, z: 0 }, downCodes, sprint: false, sprintPressed: false,
    dribbleMod: false, helper: false, shootHeld: !!downCodes["KeyA"], events,
  });
  const giveBall = (p) => {
    for (const q of e.players) q.hasBall = false;
    p.hasBall = true; p.vx = p.vz = 0;
    const b = e.ball;
    b.x = p.x; b.z = p.z; b.y = 0.17; b.vx = b.vy = b.vz = 0;
    b.lastTouch = null; b.touchCooldown = 0;
  };
  const out = {};

  // A1: entrada (sin balón) -> gana el balón -> suelta: NO debe pasar
  {
    const c = m.getControlled(e);
    for (const q of e.players) q.hasBall = false;
    e.ball.x = c.x + 1; e.ball.z = c.z; e.ball.vx = e.ball.vz = 0; e.ball.vy = 0;
    e.passTarget = null; e.actionDownHadBall = undefined;
    m.processActions(e, mkFin(["actionDown"], { KeyA: true }), 1 / 60);
    giveBall(c); // la entrada gana el balón a mitad de pulsación
    m.processActions(e, mkFin(["actionUp"], {}), 1 / 60);
    out.a1 = { stillHasBall: c.hasBall, passTarget: e.passTarget };
  }
  // A2: toque con balón -> SÍ pasa
  {
    const c = m.getControlled(e);
    giveBall(c);
    e.passTarget = null;
    m.processActions(e, mkFin(["actionDown"], { KeyA: true }), 1 / 60);
    m.processActions(e, mkFin(["actionUp"], {}), 1 / 60);
    out.a2 = { stillHasBall: c.hasBall, passTarget: e.passTarget };
  }
  // B: Q con balón -> la IA no lo rifa en 1,8 s
  {
    const c = m.getControlled(e);
    giveBall(c);
    for (const p of e.away) { p.x = -40; p.z = (p.x % 7) * 5; p.vx = p.vz = 0; }
    e.passTarget = null;
    const oldUid = c.uid;
    m.processActions(e, mkFin(["switch"], {}), 1 / 60); // Q
    const switched = e.controlledUid !== oldUid;
    const old = e.players.find((p) => p.uid === oldUid);
    for (let i = 0; i < 108; i++) m.stepEngine(e, 1 / 60, { x: 0, z: 0 }, {}); // 1,8 s
    out.b = { switched, oldStillHasBall: old.hasBall, passTarget: e.passTarget };
  }
  return out;
});

check("A1: entrar, ganar el balón y soltar NO pasa", r.a1.stillHasBall && r.a1.passTarget === null,
  JSON.stringify(r.a1));
check("A2: toque con balón SÍ pasa", !r.a2.stillHasBall && r.a2.passTarget !== null,
  JSON.stringify(r.a2));
check("B: tras Q la IA no rifa el balón en 1,8 s", r.b.switched && r.b.oldStillHasBall && r.b.passTarget === null,
  JSON.stringify(r.b));

console.log(results.join("\n"));
console.log("errores de consola:", errors.length ? errors : "ninguno");
await browser.close();
if (results.some((x) => x.startsWith("FAIL")) || errors.length) process.exit(1);

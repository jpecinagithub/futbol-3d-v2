// Reproduce el reporte del usuario: libre indirecto dentro del área.
// Caso A: lo saca la IA (equipo rival) -> debe ejecutar en ~1.5-2.5 s y volver a OPEN_PLAY.
// Caso B: lo saca el usuario -> debe aparecer el aviso en el store.
// Uso: node test/deadballFrozen.mjs
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

const r = await page.evaluate(async () => {
  const m = window.__match; const e = m.engine;
  const dbMod = await import("/src/game/deadball.js");
  const out = {};
  const step = (n) => { for (let i = 0; i < n; i++) m.stepEngine(e, 1 / 60, { x: 0, z: 0 }, {}); };

  // Caso A: libre indirecto para el AWAY (IA) dentro del área HOME (x=+52.5)
  dbMod.enterDeadBall(e, "free-kick", {
    takerSide: "away", spot: { x: 52.5 - 8, z: 3 }, indirect: true,
  });
  const s0 = e.deadBall.state;
  step(60); // 1 s (SETUP)
  const s1 = e.deadBall.state;
  step(300); // 5 s más
  out.a = { s0, s1, sEnd: e.deadBall.state, t: +e.deadBall.t.toFixed(1) };

  // Caso B: libre indirecto para el HOME (usuario): ¿hay aviso?
  dbMod.enterDeadBall(e, "free-kick", {
    takerSide: "home", spot: { x: 52.5 - 8, z: -3 }, indirect: true,
  });
  step(200); // >2.5 s -> READY seguro
  out.b = {
    state: e.deadBall.state,
    userKicking: e.deadBall.userKicking,
    notice: window.__store.getState().notice,
  };
  return out;
});
console.log(JSON.stringify(r, null, 1));
console.log("errores de consola:", errors.length ? errors : "ninguno");
await browser.close();

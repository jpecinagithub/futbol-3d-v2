// Verifica que esprintar con el balón (S) no hace perder la posesión.
// El jugador controlado recibe el balón, corre 3 s de juego a sprint y debe
// seguir siendo el dueño, con el balón a distancia de control.
// Uso: node test/sprint.mjs
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

const r = await page.evaluate(() => {
  const m = window.__match; const e = m.engine;
  const c = m.getControlled(e);
  // Rivales lejos para que no haya disputas: solo importa la conducción.
  for (const p of e.players) if (p.side !== c.side) { p.x = -45; p.z = (p.uid * 7) % 40 - 20; p.vx = p.vz = 0; }
  for (const q of e.players) q.hasBall = false;
  c.hasBall = true; c.vx = c.vz = 0;
  const b = e.ball;
  b.x = c.x; b.z = c.z; b.y = 0.17; b.vx = b.vy = b.vz = 0;
  b.lastTouch = null; b.touchCooldown = 0;
  let maxBallSp = 0, maxD = 0, lostAt = -1;
  const N = 180; // 3 s de juego a sprint
  for (let i = 0; i < N; i++) {
    m.stepEngine(e, 1 / 60, { x: 0, z: 1, sprint: true }, {});
    const sp = Math.hypot(b.vx, b.vz);
    const d = Math.hypot(c.x - b.x, c.z - b.z);
    if (sp > maxBallSp) maxBallSp = sp;
    if (d > maxD) maxD = d;
    if (!c.hasBall && lostAt < 0) lostAt = (i / 60).toFixed(2);
  }
  return {
    stillHasBall: c.hasBall,
    lostAt,
    maxBallSp: +maxBallSp.toFixed(1),
    maxD: +maxD.toFixed(2),
    finalSpeed: +Math.hypot(c.vx, c.vz).toFixed(1),
  };
});

const results = [];
const check = (name, ok, extra = "") =>
  results.push((ok ? "OK   " : "FAIL ") + name + (extra ? " - " + extra : ""));
check("sprint 3 s con balón: mantiene la posesión", r.stillHasBall, JSON.stringify(r));
check("el balón nunca supera el umbral de pérdida (12 m/s)", r.maxBallSp < 12, `max ${r.maxBallSp} m/s`);
check("el balón no se escapa (>1,7 m)", r.maxD <= 1.7, `max ${r.maxD} m`);
check("el jugador realmente esprinta (>6 m/s)", r.finalSpeed > 6, `${r.finalSpeed} m/s`);
console.log(results.join("\n"));
console.log("errores de consola:", errors.length ? errors : "ninguno");
await browser.close();
if (results.some((x) => x.startsWith("FAIL")) || errors.length) process.exit(1);

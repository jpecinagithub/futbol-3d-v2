// Regresión del punto 1: el equipo rival debe moverse, presionar y disputar
// el balón aunque el usuario no toque ninguna tecla. Avanza el motor
// manualmente con entrada neutra (sin pasar por processActions).
// Uso: node test/rivalIndependent.mjs
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
  null,
  { polling: 200, timeout: 60000 }
);
await page.waitForTimeout(1500);
await page.evaluate(() => window.__store.getState().pause());

const r = await page.evaluate(() => {
  const m = window.__match;
  const e = m.engine;
  const neutral = { x: 0, z: 0 };
  const start = e.players
    .filter((p) => p.side === "away" && !p.isGK)
    .map((p) => ({ uid: p.uid, x: p.x, z: p.z }));
  let minDistToBall = Infinity;
  let stole = false;
  // 15 s simulados sin tocar ninguna tecla
  for (let i = 0; i < 900; i++) {
    m.stepEngine(e, 1 / 60, neutral, {});
    if (i % 10 === 0) {
      for (const p of e.players) {
        if (p.side !== "away") continue;
        const d = Math.hypot(p.x - e.ball.x, p.z - e.ball.z);
        if (d < minDistToBall) minDistToBall = d;
      }
    }
    if (e.ball.lastTouch && e.ball.lastTouch.startsWith("away")) stole = true;
  }
  const moved = start.map((s) => {
    const p = e.players.find((q) => q.uid === s.uid);
    return Math.hypot(p.x - s.x, p.z - s.z);
  });
  const avg = moved.reduce((a, b) => a + b, 0) / moved.length;
  return { avgMove: avg, maxMove: Math.max(...moved), minDistToBall, stole };
});

const results = [];
const check = (name, ok, extra = "") =>
  results.push((ok ? "OK   " : "FAIL ") + name + (extra ? " - " + extra : ""));
check("rivales de campo se desplazan sin entrada", r.avgMove > 5,
  `media ${r.avgMove.toFixed(1)} m, máx ${r.maxMove.toFixed(1)} m`);
check("rival presiona (se acerca al balón)", r.minDistToBall < 3,
  `distancia mín ${r.minDistToBall.toFixed(2)} m`);
check("rival llega a tocar/disputar el balón", r.stole, String(r.stole));

console.log(results.join("\n"));
console.log("errores de consola:", errors.length ? errors : "ninguno");
await browser.close();
if (results.some((x) => x.startsWith("FAIL")) || errors.length) process.exit(1);

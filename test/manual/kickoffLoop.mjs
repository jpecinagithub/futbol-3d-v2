// Deja correr el bucle REAL de la app (sin stepEngine manual) 12 s y comprueba
// si los jugadores se mueven solos desde el saque inicial.
// Uso: node test/kickoffLoop.mjs
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
await jsClick(".team-card", "Barcelona"); await page.waitForTimeout(400);
await jsClick(".team-card", "Real Madrid"); await page.waitForTimeout(400);
await jsClick("button", "Continuar"); await page.waitForTimeout(600);
await jsClick("button", "Ver alineaciones"); await page.waitForTimeout(600);
await jsClick("button", "¡A jugar!");
await page.waitForFunction(
  () => { const m = window.__match; return m && m.engine.deadBall && m.engine.deadBall.state === "OPEN_PLAY"; },
  { polling: 200, timeout: 60000 }
);
const p0 = await page.evaluate(() => window.__match.engine.players.map((p) => ({ uid: p.uid, x: +p.x.toFixed(1), z: +p.z.toFixed(1) })));
await page.evaluate(() => { window.__t0 = window.__match.engine.time; });
await page.waitForTimeout(12000); // el bucle real corre solo
const r = await page.evaluate((prev) => {
  const e = window.__match.engine;
  let movers = 0, maxMove = 0;
  for (const p of e.players) {
    const q = prev.find((x) => x.uid === p.uid);
    const d = Math.hypot(p.x - q.x, p.z - q.z);
    if (d > 0.5) movers++;
    if (d > maxMove) maxMove = d;
  }
  return {
    phase: window.__store.getState().phase,
    engineTimeDelta: +(e.time - window.__t0).toFixed(1),
    movers, maxMove: +maxMove.toFixed(1),
    ball: { x: +e.ball.x.toFixed(1), z: +e.ball.z.toFixed(1) },
  };
}, p0);
console.log(JSON.stringify(r, null, 1));
console.log("errores de consola:", errors.length ? errors : "ninguno");
await browser.close();

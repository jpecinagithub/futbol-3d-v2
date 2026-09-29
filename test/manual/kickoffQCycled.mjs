// Sesión fiel al usuario: Q pulsada 3 veces al inicio y luego 10 s sin tocar nada.
// Uso: node test/kickoffQCycled.mjs
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
await page.waitForTimeout(1500);

const r = await page.evaluate(async () => {
  const m = window.__match; const e = m.engine;
  const { switchPlayer } = await import("/src/game/playerSwitch.js");
  // El usuario pulsa Q 3 veces (cicla hasta un defensa, como Cubarsí)
  switchPlayer(e, { x: 0, z: 0 }); switchPlayer(e, { x: 0, z: 0 }); switchPlayer(e, { x: 0, z: 0 });
  const controlled = e.players.find((p) => p.uid === e.controlledUid);
  const step = (n) => { for (let i = 0; i < n; i++) m.stepEngine(e, 1 / 60, { x: 0, z: 0 }, {}); };
  const bx0 = e.ball.x, bz0 = e.ball.z;
  step(600); // 10 s de juego sin tocar nada
  const bd = Math.hypot(e.ball.x - bx0, e.ball.z - bz0);
  const movers = e.players.filter((p) => Math.hypot(p.vx, p.vz) > 0.5).length;
  return {
    controlled: controlled.name || controlled.uid,
    ballMoved: +bd.toFixed(1),
    ballAt: { x: +e.ball.x.toFixed(1), z: +e.ball.z.toFixed(1) },
    moversNow: movers,
    hasBall: (e.players.find((p) => p.hasBall) || {}).uid || "nadie",
  };
});
console.log(JSON.stringify(r, null, 1));
console.log("errores de consola:", errors.length ? errors : "ninguno");
await browser.close();

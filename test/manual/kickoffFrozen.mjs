// Reproduce el reporte: tras el saque inicial, sin tocar nada, ¿se mueve alguien?
// Uso: node test/kickoffFrozen.mjs
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
  const before = e.players.map((p) => ({ uid: p.uid, x: p.x, z: p.z }));
  const states0 = [...new Set(e.players.map((p) => p.ai && p.ai.state))];
  // 10 s sin tocar nada (input neutro)
  for (let i = 0; i < 600; i++) m.stepEngine(e, 1 / 60, { x: 0, z: 0 }, {});
  const moved = e.players.map((p) => {
    const b0 = before.find((q) => q.uid === p.uid);
    return { uid: p.uid, moved: +Math.hypot(p.x - b0.x, p.z - b0.z).toFixed(1), st: p.ai && p.ai.state };
  });
  const movers = moved.filter((x) => x.moved > 0.5).length;
  return {
    dbState: e.deadBall.state,
    frozen: e.frozen,
    ball: { x: +e.ball.x.toFixed(1), z: +e.ball.z.toFixed(1) },
    states0,
    movers,
    top: moved.sort((a, b) => b.moved - a.moved).slice(0, 5),
    none: moved.filter((x) => x.moved <= 0.5).map((x) => x.uid).length,
  };
});
console.log(JSON.stringify(r, null, 1));
console.log("errores de consola:", errors.length ? errors : "ninguno");
await browser.close();

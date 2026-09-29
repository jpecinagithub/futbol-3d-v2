import { launchBrowser, BASE_URL } from "./helpers.mjs";
const errors = [];
const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0,200)); });
page.on("pageerror", (e) => errors.push("pageerror: " + String(e).slice(0,200)));
await page.goto(BASE_URL + "/", { waitUntil: "networkidle" });
const jsClick = (sel, text) =>
  page.evaluate(([s, t]) => {
    const el = [...document.querySelectorAll(s)].find((x) => x.textContent.includes(t));
    if (!el) return "NOT-FOUND";
    el.click(); return "ok";
  }, [sel, text]);
await jsClick("button", "Jugar partido");
await page.waitForTimeout(300);
await jsClick(".team-card", "Real Madrid");
await page.waitForTimeout(300);
await jsClick(".team-card", "Barcelona");
await page.waitForTimeout(300);
await jsClick("button", "Continuar");
await page.waitForTimeout(400);
await jsClick("button", "Ver alineaciones");
await page.waitForTimeout(400);
await jsClick("button", "¡A jugar!");
await page.waitForTimeout(2000);

const st = (fn) => page.evaluate(fn);
const ballSpeed = () => st(() => { const b = window.__match.engine.ball; return Math.hypot(b.vx,b.vz); });

// 1. Pase al hueco (W con balón)
await st(() => {
  const e = window.__match.engine;
  const c = e.players.find((p) => p.uid === e.controlledUid);
  for (const p of e.players) p.hasBall = false;
  e.ball.x = c.x + 0.4; e.ball.z = c.z; e.ball.y = 0.11;
  e.ball.vx = e.ball.vy = e.ball.vz = 0; e.ball.lastTouch = null; e.ball.touchCooldown = 0;
  c.hasBall = true; c.touchTimer = 0.5;
});
await page.keyboard.press("w");
await page.waitForTimeout(600);
const throughSpeed = await ballSpeed();

// 2. Centro (A con balón)
await st(() => {
  const e = window.__match.engine;
  const c = e.players.find((p) => p.uid === e.controlledUid);
  for (const p of e.players) p.hasBall = false;
  c.x = 30; c.z = 18; c.vx = c.vz = 0; // banda, cerca del área rival
  e.ball.x = 30.4; e.ball.z = 18; e.ball.y = 0.11;
  e.ball.vx = e.ball.vy = e.ball.vz = 0; e.ball.lastTouch = null; e.ball.touchCooldown = 0;
  c.hasBall = true; c.touchTimer = 0.5;
});
await page.keyboard.press("a");
await page.waitForTimeout(500);
const crossUp = await st(() => window.__match.engine.ball.vy);
const crossSpeed = await ballSpeed();

// 3. Falta: rival con balón, entrada al cuerpo
await st(() => {
  const e = window.__match.engine;
  const c = e.players.find((p) => p.uid === e.controlledUid);
  const opp = e.away.find((p) => p.role === "CM");
  for (const p of e.players) p.hasBall = false;
  opp.x = 10; opp.z = 0; opp.vx = opp.vz = 0;
  e.ball.x = 10.4; e.ball.z = 0; e.ball.y = 0.11;
  e.ball.vx = e.ball.vy = e.ball.vz = 0; e.ball.lastTouch = null; e.ball.touchCooldown = 0;
  opp.hasBall = true;
  c.x = 11.6; c.z = 0; c.vx = c.vz = 0; c.facing = Math.PI;
  e.fouls.length = 0;
});
await page.keyboard.press("d"); // entrada sin balón -> hacia el balón (donde está el rival)
await page.waitForTimeout(600);
const foul = await st(() => ({
  count: window.__match.engine.fouls.length,
  freeze: window.__match.engine.foulFreeze,
  by: window.__match.engine.fouls[0]?.byName || null,
}));
await page.waitForTimeout(1500);
const noticeGone = await st(() => window.__match.engine.foulFreeze <= 0.01);
await page.screenshot({ path: "test/shots/faseB_falta.png" });

// 4. Stamina: esprintar drena
const stamBefore = await st(() => {
  const e = window.__match.engine;
  return e.players.find((p) => p.uid === e.controlledUid).stamina;
});
await page.keyboard.down("Shift");
await page.keyboard.down("w");
await page.waitForTimeout(2500);
await page.keyboard.up("w");
await page.keyboard.up("Shift");
const stamAfter = await st(() => {
  const e = window.__match.engine;
  return e.players.find((p) => p.uid === e.controlledUid).stamina;
});

console.log(JSON.stringify({
  throughSpeed: +throughSpeed.toFixed(2), throughOk: throughSpeed > 5,
  crossVy: +crossUp.toFixed(2), crossOk: crossUp > 1.5 && crossSpeed > 5,
  foulCount: foul.count, foulBy: foul.by, foulFreezeSeen: foul.freeze > 0 || foul.count > 0,
  freezeOver: noticeGone,
  stamina: { before: +stamBefore.toFixed(1), after: +stamAfter.toFixed(1), drained: stamAfter < stamBefore },
  consoleErrors: errors,
}, null, 2));
await browser.close();
if (errors.length) process.exitCode = 2;

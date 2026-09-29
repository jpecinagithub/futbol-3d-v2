// Reproduce el reporte: en juego abierto, el equipo del usuario tiene el balón
// dentro del área rival. ¿Los rivales se mueven a disputar o se quedan parados?
// Uso: node test/rivalFrozen.mjs
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
  const c = m.getControlled(e); // equipo del usuario (home)
  // Balón al área rival: portería away en x = -52.5 (home ataca a +x)
  // Poner al controlado con el balón dentro del área rival.
  const gx = 52.5 - 7; // 7 m de la portería rival (dentro del área)
  for (const q of e.players) q.hasBall = false;
  c.hasBall = true; c.vx = c.vz = 0; c.x = gx; c.z = 2;
  const b = e.ball;
  b.x = c.x; b.z = c.z; b.y = 0.17; b.vx = b.vy = b.vz = 0;
  b.lastTouch = null; b.touchCooldown = 0;
  // Foto inicial de los rivales (away)
  const rivals = e.players.filter((p) => p.side !== c.side && p.role !== "GK");
  const before = rivals.map((p) => ({ uid: p.uid, x: +p.x.toFixed(1), z: +p.z.toFixed(1) }));
  const states0 = rivals.map((p) => p.ai && p.ai.state);
  // 5 s de juego abierto; el usuario quieto con el balón
  for (let i = 0; i < 300; i++) m.stepEngine(e, 1 / 60, { x: 0, z: 0 }, {});
  const after = rivals.map((p) => {
    const b0 = before.find((q) => q.uid === p.uid);
    return {
      uid: p.uid,
      moved: +Math.hypot(p.x - b0.x, p.z - b0.z).toFixed(1),
      dBall: +Math.hypot(p.x - e.ball.x, p.z - e.ball.z).toFixed(1),
      state: p.ai && p.ai.state,
      goal: p.ai && p.ai.goal ? [+p.ai.goal.x.toFixed(1), +p.ai.goal.z.toFixed(1)] : null,
    };
  });
  const presser = e._ai ? e._ai.away.presserUid : null;
  return {
    dbState: e.deadBall.state,
    carrierStillHasBall: c.hasBall,
    presser,
    states0: [...new Set(states0)],
    rivals: after.sort((a, b2) => a.dBall - b2.dBall).slice(0, 6),
  };
});
console.log(JSON.stringify(r, null, 1));
console.log("errores de consola:", errors.length ? errors : "ninguno");
await browser.close();

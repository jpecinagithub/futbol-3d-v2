// El usuario parado con el balón la conserva: no hay poke contra él y el
// presionador contiene sin entrar. La IA (no controlada) sí sigue perdiéndola.
// Uso: node test/userKeepsBall.mjs
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
  const { ballPlayerContact } = await import("/src/game/ballContact.js");
  const out = {};
  const setup = (userControlled) => {
    for (const p of e.players) { p.hasBall = false; p.controlled = false; p.pokeCd = 0; p.vx = p.vz = 0; }
    const carrier = e.players.find((p) => p.side === "home" && p.role !== "GK");
    const rival = e.players.find((p) => p.side === "away" && p.role !== "GK");
    carrier.x = 20; carrier.z = 0; carrier.controlled = userControlled;
    e.controlledUid = userControlled ? carrier.uid : e.players.find((p) => p.side === "home" && p !== carrier && p.role !== "GK").uid;
    if (!userControlled) e.players.find((p) => p.uid === e.controlledUid).controlled = true;
    const b = e.ball;
    b.x = 20.3; b.z = 0; b.y = 0.17; b.vx = b.vy = b.vz = 0;
    b.lastTouch = carrier.uid; b.touchCooldown = 0;
    carrier.hasBall = true; carrier.touchTimer = 0.2;
    rival.x = 20.7; rival.z = 0; rival.pokeCd = 0;
    return { carrier, rival };
  };
  // A) poke directo contra el USUARIO parado -> conserva
  let s = setup(true);
  ballPlayerContact(e, 1 / 60);
  out.userKeepsPoke = s.carrier.hasBall === true;
  // B) poke directo contra la IA parada -> lo pierde (comportamiento anterior)
  s = setup(false);
  ballPlayerContact(e, 1 / 60);
  out.aiLosesPoke = s.carrier.hasBall === false;
  // C) integración: 5 s con el usuario parado, la IA contiene y no se la quita
  s = setup(true);
  // el rival vuelve a su sitio para que venga el presionador de verdad
  s.rival.x = s.rival.homeSpot.x; s.rival.z = s.rival.homeSpot.z;
  let kept = true, minD = Infinity;
  for (let i = 0; i < 300; i++) {
    m.stepEngine(e, 1 / 60, { x: 0, z: 0 }, {});
    if (!s.carrier.hasBall) kept = false;
    // Contención asentada: solo los últimos 30 pasos (la llegada es transitoria).
    if (i < 270) continue;
    for (const p of e.players) {
      if (p.side === "away" && p.role !== "GK") {
        const d = Math.hypot(p.x - e.ball.x, p.z - e.ball.z);
        if (d < minD) minD = d;
      }
    }
  }
  out.integrationKeeps = kept;
  out.nearestRival = +minD.toFixed(2);
  out.contained = minD > 0.9;
  out.nearest3 = e.players.filter((p) => p.side === "away" && p.role !== "GK")
    .map((p) => ({ uid: p.uid, dBall: +Math.hypot(p.x - e.ball.x, p.z - e.ball.z).toFixed(2),
      st: p.ai ? p.ai.state : "?" }))
    .sort((a, b) => a.dBall - b.dBall).slice(0, 3);
  return out;
});
console.log(JSON.stringify(r, null, 1));
const ok = r.userKeepsPoke && r.aiLosesPoke && r.integrationKeeps && r.contained;
console.log(ok ? "USER KEEPS BALL: OK" : "USER KEEPS BALL: FALLO");
console.log("errores de consola:", errors.length ? errors : "ninguno");
await browser.close();
if (!ok) process.exit(1);

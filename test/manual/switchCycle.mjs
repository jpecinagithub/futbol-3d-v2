// Q sin dirección: 1ª pulsación -> más cercano al balón; 2ª -> segundo;
// 3ª -> tercero; tras 2 s sin pulsar, vuelve al más cercano.
// Uso: node test/switchCycle.mjs
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
  const { switchPlayer } = await import("/src/game/playerSwitch.js");
  const step = (n) => { for (let i = 0; i < n; i++) m.stepEngine(e, 1 / 60, { x: 0, z: 0 }, {}); };
  // Balón quieto en el centro; jugadores quietos para distancias estables.
  const b = e.ball;
  b.x = 0; b.z = 0; b.y = 0.17; b.vx = b.vy = b.vz = 0;
  for (const p of e.players) { p.vx = p.vz = 0; }
  const cur0 = e.players.find((p) => p.uid === e.controlledUid);
  const mates = e.players
    .filter((p) => p.side === cur0.side && p.uid !== cur0.uid && p.role !== "GK")
    .map((p) => ({ uid: p.uid, d: Math.hypot(p.x - b.x, p.z - b.z) }))
    .sort((x, y) => x.d - y.d);
  const pick = [];
  switchPlayer(e, { x: 0, z: 0 }); pick.push(e.controlledUid); step(10);
  switchPlayer(e, { x: 0, z: 0 }); pick.push(e.controlledUid); step(10);
  switchPlayer(e, { x: 0, z: 0 }); pick.push(e.controlledUid);
  step(150); // 2,5 s > ventana de 1,5 s
  switchPlayer(e, { x: 0, z: 0 }); pick.push(e.controlledUid);
  return {
    esperado: [mates[0].uid, mates[1].uid, mates[2].uid, mates[0].uid],
    obtenido: pick,
  };
});
const ok = JSON.stringify(r.esperado) === JSON.stringify(r.obtenido);
console.log("esperado:", JSON.stringify(r.esperado));
console.log("obtenido:", JSON.stringify(r.obtenido));
console.log(ok ? "CICLO Q: OK" : "CICLO Q: FALLO");
console.log("errores de consola:", errors.length ? errors : "ninguno");
await browser.close();
if (!ok) process.exit(1);

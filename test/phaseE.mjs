// Test Fase E: presentación (HUD, repetición automática, audio, pantallas).
// Flujo determinista:
//  1. Posesión: el motor acumula segundos con balón por equipo.
//  2. Tiro del controlado (vía real releaseShot, sin marcar) -> stats.tiros = 1;
//     tiro a puerta (vía directa countShot) -> stats.tirosAPuerta = 1.
//  3. Gol provocado -> banner "¡GOOOL!" con goleador -> celebración ->
//     repetición automática con rótulo "REPETICIÓN" -> salto con Enter ->
//     saque de centro, fase "playing", sin errores.
//  4. Tab abre/cierra el overlay de estadísticas.
//  5. Fin del partido: pantalla final con goleadores + comparativa;
//     "Revancha" reinicia limpio (0-0, fase playing).
//  6. Pausa: pestaña "Cambios" hace una sustitución real por UI.
//  - 0 errores de consola. Capturas en test/shots/faseE_*.png
import { launchBrowser, BASE_URL } from "./helpers.mjs";

const errors = [];
const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.on("pageerror", (e) => errors.push("pageerror: " + String(e).slice(0, 220)));
page.on("console", (m) => {
  if (m.type() === "error") errors.push("console: " + m.text().slice(0, 220));
});
await page.goto(BASE_URL + "/", { waitUntil: "networkidle" });
const jsClick = (sel, text) =>
  page.evaluate(([s, t]) => {
    const el = [...document.querySelectorAll(s)].find((x) => x.textContent.includes(t));
    if (el) el.click();
  }, [sel, text]);
await jsClick("button", "Jugar partido"); await page.waitForTimeout(300);
await jsClick(".team-card", "Real Madrid"); await page.waitForTimeout(300);
await jsClick(".team-card", "Barcelona"); await page.waitForTimeout(300);
await jsClick("button", "Continuar"); await page.waitForTimeout(400);
await jsClick("button", "Ver alineaciones"); await page.waitForTimeout(400);
await page.screenshot({ path: "test/shots/faseE_alineaciones.png" });
await jsClick("button", "¡A jugar!"); await page.waitForTimeout(3000);
const navPhase = await page.evaluate(() => window.__match?.phase ?? "(sin __match)");
console.log("fase tras navegación:", navPhase);
if (navPhase !== "playing") throw new Error("la navegación no llegó al partido");

// ---- 1. La posesión acumula segundos (mecanismo del motor) ----
await page.evaluate(() => {
  const { engine } = window.__match;
  const p = engine.players.find((q) => q.side === "home" && q.role !== "GK" && !q.sentOff);
  const b = engine.ball;
  p.hasBall = true; // balón a los pies (el contacto lo respeta si d < 1,7 m)
  b.x = p.x; b.y = 0.11; b.z = p.z; b.vx = 0; b.vy = 0; b.vz = 0;
  window.__possP = p;
});
await page.waitForTimeout(4000);
const poss = await page.evaluate(() => {
  const e = window.__match.engine;
  const r = {
    home: +e.possTime.home.toFixed(2),
    away: +e.possTime.away.toFixed(2),
    storeHome: +window.__store.getState().stats.home.possession.toFixed(2),
  };
  window.__possP.hasBall = false;
  return r;
});
console.log("posesión acumulada (s):", JSON.stringify(poss));

// ---- 2a. Tiro real del controlado, dirigido FUERA (a lo largo del campo) ----
const shot = await page.evaluate(async () => {
  const { engine } = window.__match;
  const sh = await import("/src/game/shooting.js");
  const getState = () => window.__store.getState();
  const p = engine.players.find((q) => q.controlled);
  engine.charge = null;
  p.x = 0; p.z = -20; p.vx = 0; p.vz = 0;
  p.hasBall = true;
  const b = engine.ball;
  b.x = p.x; b.y = 0.11; b.z = p.z; b.vx = 0; b.vy = 0; b.vz = 0;
  sh.startShotCharge(engine, p, { x: 1, z: 0 }); // a lo largo del campo, sin portería
  engine.charge.t = 0.8;
  sh.releaseShot(engine);
  const s = getState().stats.home;
  // Limpieza: saque de centro para dejar el partido en juego abierto
  const eng = await import("/src/game/engine.js");
  eng.kickoff(engine);
  return {
    shots: s.shots, onTarget: s.shotsOnTarget,
    phase: getState().phase, matchPhase: window.__match.phase,
  };
});
console.log("tras tiro dirigido fuera:", JSON.stringify(shot));

// ---- 2b. Tiro a puerta por la vía directa (sin mover el balón) ----
const onTarget = await page.evaluate(async () => {
  const { engine } = window.__match;
  const sh = await import("/src/game/shooting.js");
  const getState = () => window.__store.getState();
  const p = engine.players.find((q) => q.controlled);
  const b = engine.ball;
  p.x = 37.5; p.z = 0; b.x = 37.5; b.y = 0.11; b.z = 0;
  sh.countShot(engine, p, 1, 0, 26, 4); // dirección a portería
  const eng = await import("/src/game/engine.js");
  eng.kickoff(engine);
  const s = getState().stats.home;
  return { shots: s.shots, onTarget: s.shotsOnTarget, phase: getState().phase };
});
console.log("tras tiro a puerta:", JSON.stringify(onTarget));

// ---- 3. Gol provocado -> banner -> repetición -> salto -> saque de centro ----
await page.evaluate(() => window.__match.provokeGoal("home"));
// Polling por intervalo (no rAF: aquí renderiza a ~0,5 fps) y el texto se
// captura dentro del propio wait: el banner solo vive 1,6 s.
const bannerHandle = await page.waitForFunction(
  () => document.querySelector(".goal-banner") || null,
  null,
  { timeout: 30000, polling: 100 }
);
await page.screenshot({ path: "test/shots/faseE_gol.png" });
const bannerText = await bannerHandle.evaluate((el) =>
  el ? el.textContent.replace(/\s+/g, " ").slice(0, 90) : "(banner ya desmontado)"
);
console.log("banner de gol:", bannerText);
await page.waitForFunction(() => !!document.querySelector(".replay-label"), null, { timeout: 30000, polling: 200 });
const replayText = await page.evaluate(() =>
  document.querySelector(".replay-label").textContent.replace(/\s+/g, " ").slice(0, 90)
);
console.log("rótulo replay:", replayText);
await page.waitForTimeout(4000); // deja que la cámara del replay renderice algún frame
await page.screenshot({ path: "test/shots/faseE_replay.png" });
const scoreShown = await page.evaluate(() =>
  document.querySelector(".scoreboard .goals").textContent.trim()
);
console.log("marcador en el HUD:", scoreShown);
// Salto con Enter (tecla dedicada): vuelve a playing en saque de centro
await page.keyboard.press("Enter");
await page.waitForFunction(() => window.__match.phase === "playing", null, { timeout: 15000 });
await page.waitForTimeout(1500);
const resumed = await page.evaluate(() => {
  const { engine } = window.__match;
  return {
    ballX: +engine.ball.x.toFixed(2),
    ballZ: +engine.ball.z.toFixed(2),
    dbState: engine.deadBall.state,
    score: document.querySelector(".scoreboard .goals").textContent.trim(),
  };
});
console.log("tras salto del replay:", JSON.stringify(resumed));

// ---- 4. Tab: overlay de estadísticas ----
await page.keyboard.press("Tab");
await page.waitForFunction(() => !!document.querySelector(".stats-overlay"), null, { timeout: 8000 });
await page.waitForTimeout(500);
await page.screenshot({ path: "test/shots/faseE_stats.png" });
const statsRows = await page.evaluate(() =>
  [...document.querySelectorAll(".stats-overlay .stats-table tbody tr")].length
);
const statsVals = await page.evaluate(() =>
  document.querySelector(".stats-overlay .stats-table").textContent.replace(/\s+/g, " ").slice(0, 120)
);
console.log("filas stats:", statsRows, "|", statsVals);
await page.keyboard.press("Tab");
await page.waitForFunction(() => !document.querySelector(".stats-overlay"), null, { timeout: 8000 });
console.log("Tab cierra el overlay: OK");

// ---- 5. Fin del partido ----
await page.evaluate(() => { window.__match.engine.matchTime = 299.99; });
await page.waitForFunction(() => !!document.querySelector(".overlay h2"), null, { timeout: 30000 });
const finalTitle = await page.evaluate(() => document.querySelector(".overlay h2").textContent);
const finalTables = await page.evaluate(() => document.querySelectorAll(".overlay .stats-table").length);
console.log("pantalla final:", finalTitle, "| tablas:", finalTables);
await page.waitForTimeout(1000);
await page.screenshot({ path: "test/shots/faseE_final.png" });

// ---- 5b. Revancha ----
await jsClick("button", "Revancha");
await page.waitForTimeout(4000);
const revancha = await page.evaluate(() => ({
  phase: window.__match.phase,
  hud: !!document.querySelector(".hud"),
  overlay: !!document.querySelector(".overlay"),
  score: document.querySelector(".scoreboard .goals").textContent.trim(),
}));
console.log("tras revancha:", JSON.stringify(revancha));

// ---- 6. Pausa: pestaña de cambios por UI ----
await page.keyboard.press("Escape");
await page.waitForFunction(() => !!document.querySelector(".overlay h2"), null, { timeout: 8000 });
await jsClick(".pause-tabs button", "Cambios");
await page.waitForTimeout(800);
await page.screenshot({ path: "test/shots/faseE_pausa_cambios.png" });
const subOpts = await page.evaluate(() => {
  const sels = [...document.querySelectorAll(".subs-row select")];
  return {
    titulares: sels[0].options.length - 1,
    suplentes: sels[1].options.length - 1,
    primerTitular: sels[0].options[1]?.value || "",
    primerSuplente: sels[1].options[1]?.value || "",
  };
});
console.log("opciones de cambio:", JSON.stringify(subOpts));
await page.locator(".subs-row select").nth(0).selectOption(subOpts.primerTitular);
await page.locator(".subs-row select").nth(1).selectOption(subOpts.primerSuplente);
await jsClick("button", "Hacer cambio");
await page.waitForTimeout(800);
const subMsg = await page.evaluate(() =>
  document.querySelector(".subs-msg")?.textContent || "(sin mensaje)"
);
const subUsed = await page.evaluate(() => window.__match.engine.subsUsed.home.size);
console.log("sustitución:", subMsg, "| cambios usados (local):", subUsed);
await jsClick("button", "Continuar");
await page.waitForTimeout(1500);
console.log("fase tras continuar:", await page.evaluate(() => window.__match.phase));

console.log("errores de consola:", errors.length);
for (const e of errors.slice(0, 10)) console.log("  -", e);
await browser.close();
if (errors.length > 0) process.exit(1);
console.log("FASE E OK");

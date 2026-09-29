// Test humo "partido completo" (Fase F): un partido de 3 min a escala x6
// (~30 s de simulación) avanzado por pasos del motor, con IA + input del
// usuario. Verifica con cifras reales:
//  - el controlado se mueve con el teclado (input real, no sintético)
//  - el usuario ejecuta un pase y un tiro con carga por la vía real
//    (processActions, la misma que usa el teclado)
//  - la IA juega: pases con pases completados, reloj que avanza
//  - el partido TERMINA a los 180 s y aparece la pantalla final
//  - 0 errores de consola
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

// ---- navegación: menú -> equipos -> duración 3 min -> alineaciones -> partido ----
await jsClick("button", "Jugar partido"); await page.waitForTimeout(300);
await jsClick(".team-card", "Real Madrid"); await page.waitForTimeout(300);
await jsClick(".team-card", "Barcelona"); await page.waitForTimeout(300);
await jsClick("button", "Continuar"); await page.waitForTimeout(400);
await jsClick(".duration-btn", "3 min"); await page.waitForTimeout(300);
await jsClick("button", "Ver alineaciones"); await page.waitForTimeout(400);
await jsClick("button", "¡A jugar!");
await page.waitForFunction(() => window.__match?.phase === "playing", null, { timeout: 30000 });
console.log("fase: playing, duración 3 min");

// ---- 1. Input REAL del usuario: mover al controlado con el teclado ----
// (esquema WASD: la W mueve hacia arriba; también cubre el cambio de esquema)
await page.evaluate(() => window.__store.getState().setControlScheme("wasd"));
// En headless se espera en tiempo de simulación (no mide en frío).
await page.waitForFunction(() => window.__match.engine.time > 1, null, { timeout: 120000 });
const pos0 = await page.evaluate(() => {
  const { engine, getControlled } = window.__match;
  const c = getControlled(engine);
  return { x: c.x, z: c.z, t: engine.time };
});
await page.keyboard.down("w");
await page.waitForFunction(
  (t0) => window.__match.engine.time > t0 + 1,
  pos0.t, { timeout: 120000 }
);
await page.keyboard.up("w");
const pos1 = await page.evaluate(() => {
  const { engine, getControlled } = window.__match;
  const c = getControlled(engine);
  return { x: c.x, z: c.z };
});
const moved = Math.hypot(pos1.x - pos0.x, pos1.z - pos0.z);
console.log("movimiento del usuario con W:", moved.toFixed(2), "m");
if (!(moved > 0.1)) throw new Error("el controlado no se movió con el teclado");

// ---- 2. Simulación por pasos del motor hasta los 180 s de partido ----
const sim = await page.evaluate(async () => {
  const { engine, stepEngine, processActions, getControlled } = window.__match;
  const { resolveBindings } = await import("/src/game/input.js");
  const DT = 1 / 60, input = { x: 0, z: 0 }; // controlado quieto: juega la IA
  const TARGET = 180; // 3 min de partido
  const store = window.__store.getState();
  const shotsBefore = store.stats.home.shots + store.stats.away.shots;
  let passes = 0, userPasses = 0, userShots = 0, completed = 0, aiShots = 0, goals = 0;
  let lastFx = engine.passFx, steps = 0, pendingPass = null, userPendingPass = false;
  let shotPhase = 0, shotHold = 0; // 0 idle, 1 balón colocado, 2 cargando
  const lastShotT = {};
  const ev = { onGoal: () => { goals++; } };
  const fin = { move: { x: 0, z: 0 }, downCodes: {}, sprint: false, sprintPressed: false,
    dribbleMod: false, helper: false, shootHeld: false, events: [],
    // Fase 11: processActions exige la entrada con forma completa (Fase 3+).
    bindings: resolveBindings("wasd", {}), scheme: "wasd",
    shootCodes: ["Space"], passHeld: false, switchMove: null, actionHeld: false };
  const openPlay = () => !engine.deadBall || engine.deadBall.state === "OPEN_PLAY";
  // Reloj en tiempo real (Fase 0): 180 s de partido = 10800 pasos + margen.
  const maxSteps = 60 * 200;
  while (engine.matchTime < TARGET && steps < maxSteps) {
    const ctrl = getControlled(engine);
    // --- tiro con carga del usuario (vía real processActions) ---
    if (userShots === 0 && openPlay() && ctrl && !engine.frozen) {
      if (shotPhase === 0) {
        if (!ctrl.hasBall) {
          const b = engine.ball; // balón a los pies (ballContact lo recoge)
          b.x = ctrl.x; b.z = ctrl.z; b.y = 0.22; b.vx = 0; b.vy = 0; b.vz = 0;
          b.lastTouch = ctrl.uid; shotPhase = 1;
        } else { shotPhase = 1; }
      } else if (shotPhase === 1) {
        if (ctrl.hasBall) {
          processActions(engine, { ...fin, events: ["shootDown"] }, DT); shotPhase = 2;
        } else shotPhase = 0; // se lo quitaron antes de cargar: reintentar
      } else if (shotPhase === 2) {
        if (!engine.charge) { shotPhase = 0; shotHold = 0; } // robo durante la carga
        else {
          processActions(engine, { ...fin, shootHeld: true }, DT);
          if (++shotHold >= 30) {
            processActions(engine, { ...fin, events: ["shootUp"] }, DT); shotPhase = 3;
          }
        }
      } else if (shotPhase === 3) {
        const s = window.__store.getState().stats;
        if (s.home.shots + s.away.shots > shotsBefore) { userShots = 1; }
        else { shotPhase = 0; shotHold = 0; } // no contó: reintentar
      }
    }
    // --- pase del usuario (vía real processActions) ---
    if (userShots === 1 && userPasses === 0 && openPlay() && ctrl && !engine.frozen) {
      if (!ctrl.hasBall && !userPendingPass) {
        const b = engine.ball;
        b.x = ctrl.x; b.z = ctrl.z; b.y = 0.22; b.vx = 0; b.vy = 0; b.vz = 0;
        b.lastTouch = ctrl.uid;
      } else if (ctrl.hasBall) {
        processActions(engine, { ...fin, events: ["pass"] }, DT);
        userPendingPass = true;
      }
    }
    stepEngine(engine, DT, input, ev);
    steps++;
    const b = engine.ball;
    if (engine.passFx !== lastFx) {
      lastFx = engine.passFx; passes++;
      const k = engine.players.find((q) => q.uid === b.lastTouch);
      if (userPendingPass && k && ctrl && k.uid === ctrl.uid) { userPasses++; userPendingPass = false; }
      pendingPass = { until: engine.time + 2.5, side: k ? k.side : null };
    }
    let poss = null;
    for (const p of engine.players) if (p.hasBall) { poss = p; break; }
    if (pendingPass && poss && poss.side === pendingPass.side && poss.role !== "GK"
        && engine.time < pendingPass.until) { completed++; pendingPass = null; }
    if (pendingPass && engine.time >= pendingPass.until) pendingPass = null;
    if (steps % 6 === 0) {
      for (const p of engine.players) {
        const t = p.ai && p.ai.lastShotT ? p.ai.lastShotT : -1;
        if (t > (lastShotT[p.uid] || -1)) { aiShots++; lastShotT[p.uid] = t; }
      }
    }
  }
  const st = window.__store.getState().stats;
  return {
    matchTime: engine.matchTime, steps, passes, userPasses, userShots, completed,
    aiShots, goals, storeShots: st.home.shots + st.away.shots,
    possession: { home: +st.home.possession.toFixed(0), away: +st.away.possession.toFixed(0) },
  };
});
console.log("simulación:", JSON.stringify(sim, (k, v) => typeof v === "number" ? +v.toFixed(1) : v));
if (sim.matchTime < 180) throw new Error("el reloj no llegó a 180 s");
if (sim.passes < 1) throw new Error("la IA no dio ningún pase en 3 min: " + sim.passes);
if (sim.userPasses < 1) throw new Error("el pase del usuario no se ejecutó");
if (sim.userShots < 1) throw new Error("el tiro con carga del usuario no se ejecutó");

// ---- 3. El partido termina: la UI detecta el fin y muestra la pantalla final ----
await page.waitForFunction(() => window.__match?.phase === "fulltime", null, { timeout: 60000 });
const finState = await page.evaluate(() => {
  const st = window.__store.getState();
  return { phase: st.phase, score: st.score, clock: st.clock };
});
console.log("final:", JSON.stringify(finState.score), "reloj:", finState.clock.toFixed(0), "s");
await page.screenshot({ path: "test/shots/faseF_final.png" });
const finalVisible = await page.evaluate(() =>
  document.body.textContent.includes("FINAL DEL PARTIDO"));
if (!finalVisible) throw new Error("no se encontró la pantalla final");

console.log("errores de consola:", JSON.stringify(errors));
if (errors.length) throw new Error("hubo errores de consola: " + errors[0]);
console.log("HUMO PARTIDO COMPLETO: TODO OK");
await browser.close();

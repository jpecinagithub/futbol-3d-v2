// Test Fase C: IA colectiva en partido solo-IA (demo, controlado quieto).
// Métricas con números reales:
//  - dispersión: distancia media al balón de los jugadores de campo
//    no-poseedores y no-presionadores (excluye porteros y controlado).
//  - comparación contra base "todos al balón" (gancho engine._aiChaseAll).
//  - pases intentados (passFx) y completados (el receptor gana posesión).
//  - tiros (estado SHOOTING) y goles.
//  - desplazamiento de los porteros + estados de portero visitados.
//  - estados de rol y fases colectivas visitados.
//  - el controlado NO es tocado por la IA (moveTarget null, aiActive false).
//  - apelotonamiento: jugadores a <6 m del balón; rivales a <3.5 m del poseedor.
//  - prueba dirigida: tiro franco al portero -> debe reaccionar (DIVE/CATCH).
//  - 0 errores de consola.
import { launchBrowser, BASE_URL } from "./helpers.mjs";

const errors = [];
const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
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
await jsClick("button", "¡A jugar!"); await page.waitForTimeout(1500);

const res = await page.evaluate(async () => {
  const { stepEngine } = window.__match;
  const eng = await import("/src/game/engine.js");
  // Motor nuevo: evita que los frames transcurridos durante la navegación
  // consuman RNG o alteren posiciones antes de la simulación medida.
  const live = window.__match.engine;
  const engine = eng.createMatch(live.homeTeam, live.awayTeam);
  window.__AI_DEBUG = true; // ejercita el volcado de estados para el debug
  const input = { x: 0, z: 0 }; // controlado quieto: partido 100 % IA
  const DT = 1 / 60;
  const out = {};

  function runSim(seconds, chaseAll) {
    engine._aiChaseAll = !!chaseAll;
    eng.kickoff(engine);
    let passes = 0, lastFx = engine.passFx;
    let shots = 0;
    const prevState = {};
    // Puede ejecutarse más de una simulación sobre el mismo motor; partir del
    // sello actual evita atribuir al baseline tiros de la corrida anterior.
    const lastShotT = Object.fromEntries(
      engine.players.map((p) => [p.uid, p.ai?.lastShotT ?? -1])
    );
    let completed = 0;
    let pendingPass = null; // {until, side}
    let goals = 0;
    let minCarrierGoalDist = Infinity, minCarrierGoalPoint = null, carrierShotZoneTicks = 0;
    let needKickoff = false;
    let dispSum = 0, dispN = 0;
    let crowdSum = 0, crowdN = 0, crowdMax = 0;
    let pressSum = 0, pressN = 0;
    const states = new Set(), phases = new Set(), gkStates = new Set();
    const gkH = engine.home.find((p) => p.role === "GK");
    const gkA = engine.away.find((p) => p.role === "GK");
    const gkH0 = { x: gkH.x, z: gkH.z }, gkA0 = { x: gkA.x, z: gkA.z };
    let gkMove = 0;
    let deadT = 0, deadFlag = false, deadInfo = "", deadMark = 0, deadNd = Infinity, deadStuck = 0;
    const events = { onGoal: () => { goals++; needKickoff = true; } };
    const steps = Math.round(seconds * 60);
    for (let i = 0; i < steps; i++) {
      stepEngine(engine, DT, input, events);
      if (needKickoff) { eng.kickoff(engine); needKickoff = false; lastFx = engine.passFx; }
      const b = engine.ball;
      if (engine.passFx !== lastFx) {
        lastFx = engine.passFx; passes++;
        const k = engine.players.find((q) => q.uid === b.lastTouch);
        pendingPass = { until: engine.time + 2.5, side: k ? k.side : null };
      }
      let poss = null;
      for (const p of engine.players) if (p.hasBall) { poss = p; break; }
      if (poss) {
        const gx = (poss.isHome ? 1 : -1) * 52.5;
        const dg = Math.hypot(gx - poss.x, poss.z);
        if (dg < minCarrierGoalDist) {
          minCarrierGoalDist = dg;
          minCarrierGoalPoint = { x: +poss.x.toFixed(2), z: +poss.z.toFixed(2) };
        }
        if (dg < 30.5 && Math.abs(poss.z) < 18) carrierShotZoneTicks++;
      }
      if (pendingPass && poss && poss.side === pendingPass.side && poss.role !== "GK"
          && engine.time < pendingPass.until) {
        completed++; pendingPass = null;
      }
      if (pendingPass && engine.time >= pendingPass.until) pendingPass = null;
      // balón muerto: suelto y casi parado. Solo cuenta como atasco real si el
      // jugador de campo más cercano NO se acerca (un balón parado lejos del
      // único presionador tarda >3 s en ser alcanzado: eso no es un atasco).
      if (!poss && Math.hypot(b.vx, b.vz) < 0.4 && b.y < 0.3) {
        deadT += DT;
        if (deadT > 3) {
          let nd = Infinity;
          for (const q of engine.players) {
            if (q.role === "GK" || q.aiActive === false) continue;
            nd = Math.min(nd, Math.hypot(q.x - b.x, q.z - b.z));
          }
          if (deadT === DT || deadT > deadMark + 1) {
            if (deadMark === 0 || nd > deadNd - 0.5) deadStuck++;
            deadMark = deadT; deadNd = nd;
          }
          if (deadT > 8 && deadStuck >= 3) {
            deadFlag = true;
            deadInfo = `ball=(${b.x.toFixed(0)},${b.z.toFixed(0)}) nearest=${nd.toFixed(1)}m`;
          }
        }
      } else { deadT = 0; deadMark = 0; deadNd = Infinity; deadStuck = 0; }

      if (i % 6 === 0) {
        // dispersión: no-poseedores, no-presionadores, sin porteros ni controlado
        for (const t of ["home", "away"]) {
          const tai = engine._ai?.[t];
          const pr = tai?.presserUid;
          let s = 0, n = 0;
          for (const p of engine[t]) {
            if (p.role === "GK" || p.controlled || p.hasBall || p.uid === pr) continue;
            s += Math.hypot(p.x - b.x, p.z - b.z); n++;
          }
          if (n) { dispSum += s / n; dispN++; }
        }
        let crowd = 0;
        for (const p of engine.players) {
          if (Math.hypot(p.x - b.x, p.z - b.z) < 6) crowd++;
        }
        crowdSum += crowd; crowdN++; crowdMax = Math.max(crowdMax, crowd);
        if (poss) {
          let k = 0;
          for (const p of engine.players) {
            if (p.side !== poss.side && Math.hypot(p.x - poss.x, p.z - poss.z) < 3.5) k++;
          }
          pressSum += k; pressN++;
        }
        if (engine.aiDebug) {
          for (const uid of Object.keys(engine.aiDebug)) {
            const st = engine.aiDebug[uid].s;
            states.add(st);
            phases.add(engine.aiDebug[uid].ph);
            if (String(st).startsWith("GK_")) gkStates.add(st);
            prevState[uid] = st;
          }
        }
        // Tiros: tryShootAI sella p.ai.lastShotT al disparar (el estado
        // SHOOTING dura <1 tick de decisión y el muestreo lo pierde).
        for (const p of engine.players) {
          const t = p.ai && p.ai.lastShotT ? p.ai.lastShotT : -1;
          if (t > (lastShotT[p.uid] || -1)) { shots++; lastShotT[p.uid] = t; }
        }
        gkMove = Math.max(gkMove,
          Math.hypot(gkH.x - gkH0.x, gkH.z - gkH0.z),
          Math.hypot(gkA.x - gkA0.x, gkA.z - gkA0.z));
      }
    }
    engine._aiChaseAll = false;
    return {
      seconds, passes, completed, shots, goals,
      minCarrierGoalDist: Number.isFinite(minCarrierGoalDist) ? +minCarrierGoalDist.toFixed(2) : null,
      minCarrierGoalPoint,
      carrierShotZoneS: +(carrierShotZoneTicks / 60).toFixed(2),
      disp: dispN ? +(dispSum / dispN).toFixed(2) : 0,
      crowd: crowdN ? +(crowdSum / crowdN).toFixed(2) : 0,
      crowdMax,
      pressers: pressN ? +(pressSum / pressN).toFixed(2) : 0,
      gkMove: +gkMove.toFixed(2),
      ballDeadlock: deadFlag,
      deadlockInfo: deadInfo,
      states: [...states].sort(),
      phases: [...phases].sort(),
      gkStates: [...gkStates].sort(),
    };
  }

  // Un partido corto completo: la producción ofensiva se evalúa sobre una
  // ventana representativa y no sobre una única posesión de 90 segundos.
  out.main = runSim(180, false);
  await new Promise((r) => setTimeout(r, 0));
  out.baseline = runSim(30, true); // todos al balón

  // --- Controlado intacto tras la simulación ---
  const c = engine.players.find((p) => p.uid === engine.controlledUid);
  out.controlled = {
    uid: c.uid,
    aiUndefined: c.ai === undefined,
    aiActive: !!c.aiActive,
    moveTargetNull: c.moveTarget === null,
    moved: +Math.hypot(c.x - c.homeSpot.x, c.z - c.homeSpot.z).toFixed(2),
  };

  // --- Prueba dirigida del portero: tiro franco a su portería ---
  eng.kickoff(engine);
  for (const p of engine.players) p.hasBall = false;
  const gkA = engine.away.find((p) => p.role === "GK");
  const bb = engine.ball;
  bb.x = 30; bb.z = 2.5; bb.y = 0.6;
  bb.vx = 26; bb.vy = 1; bb.vz = -2; bb.spin = 0;
  bb.lastTouch = null; bb.touchCooldown = 0;
  const gx0 = gkA.x, gz0 = gkA.z;
  const gkSeen = new Set();
  let goalConceded = false;
  const ev2 = { onGoal: () => { goalConceded = true; } };
  for (let i = 0; i < 150; i++) {
    stepEngine(engine, DT, input, ev2);
    if (gkA.ai) gkSeen.add(gkA.ai.state);
    if (goalConceded || engine.frozen) break;
  }
  out.gkTest = {
    disp: +Math.hypot(gkA.x - gx0, gkA.z - gz0).toFixed(2),
    states: [...gkSeen],
    goalConceded,
    finalState: gkA.ai ? gkA.ai.state : "?",
  };
  window.__AI_DEBUG = false;
  return out;
});

console.log("RESULT:", JSON.stringify(res, null, 1));
await page.screenshot({ path: "test/shots/shot_final.png" });
console.log("consoleErrors:", JSON.stringify(errors));
await browser.close();
const failures = [];
if (res.main.ballDeadlock) failures.push(`balón bloqueado: ${res.main.deadlockInfo}`);
if (res.main.passes < 5 || res.main.completed < 2) {
  failures.push(`circulación insuficiente (${res.main.completed}/${res.main.passes} pases)`);
}
if (res.main.shots < 1) failures.push("la IA no generó tiros");
if (!(res.main.disp > res.baseline.disp && res.main.crowd < res.baseline.crowd)) {
  failures.push("la IA colectiva no mejora la estructura respecto a todos-al-balón");
}
if (res.main.states.length < 8 || res.main.phases.length < 4) {
  failures.push("faltan estados o fases colectivas durante la simulación");
}
if (!res.controlled.aiUndefined || res.controlled.aiActive || !res.controlled.moveTargetNull || res.controlled.moved > 1.5) {
  failures.push("la IA tomó control del jugador del usuario");
}
if (!(res.gkTest.disp > 0.5) || !res.gkTest.states.some((s) => /GK_(DIVE|SAVE|CATCH|RUSH_OUT)/.test(s))) {
  failures.push("el portero no reaccionó al tiro dirigido");
}
if (errors.length) failures.push(`${errors.length} errores de consola`);
if (failures.length) throw new Error(`FASE C: ${failures.join("; ")}`);
console.log("FASE C OK");

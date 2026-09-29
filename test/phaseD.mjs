// Test Fase D: arbitraje y balón parado (escenarios dirigidos, cifras reales).
//  1. Saque de banda: el balón cruza la línea lateral -> SETUP -> READY ->
//     la IA ejecuta -> EXECUTED -> OPEN_PLAY.
//  2. Córner: balón fuera por la línea de fondo tras toque del defensor.
//  3. Saque de puerta: balón fuera por la línea de fondo tras toque del atacante.
//  4. Falta + amarilla determinista (hook __foulHook) -> libre directo.
//  5. Doble amarilla -> expulsión (sentOff): no se mueve, no decide.
//  6. Fuera de juego: snapshot + toque del receptor -> libre indirecto;
//     sin participación no se pita.
//  7. Penalti a favor (lo lanza el usuario con X) y verificación de la
//     estirada del portero IA.
//  8. Tiro libre con barrera: rivales a 9.15 m (captura).
//  - 0 errores de consola. Capturas en test/shots/faseD_*.png
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

// ---------------------------------------------------------------- 1. BANDA
const r1 = await page.evaluate(async () => {
  const { engine, stepEngine } = window.__match;
  const DT = 1 / 60;
  const eng = await import("/src/game/engine.js");
  eng.kickoff(engine);
  const b = engine.ball;
  // Cerca de la banda y rápido: cruza en ~4 pasos, nadie puede interceptar.
  b.x = 20; b.z = 33.5; b.y = 0.11; b.vx = 1; b.vy = 0; b.vz = 6;
  b.lastTouch = engine.home[1].uid; b.touchCooldown = 0; b.spin = 0;
  let steps = 0, sawSetup = false, sawReady = false, sawExec = false, kind = null, taker = null;
  for (let i = 0; i < 60 * 9; i++) {
    stepEngine(engine, DT, { x: 0, z: 0 }, {});
    steps++;
    const st = engine.deadBall.state;
    if (st === "DEAD_BALL_SETUP") sawSetup = true;
    if (st === "DEAD_BALL_READY") { sawReady = true; kind = engine.deadBall.kind; taker = engine.deadBall.takerSide; }
    if (st === "DEAD_BALL_EXECUTED") sawExec = true;
    if ((sawSetup || sawReady || sawExec) && st === "OPEN_PLAY") break;
  }
  return { steps, sawSetup, sawReady, sawExec, kind, taker, final: engine.deadBall.state };
});
console.log("1 banda:", JSON.stringify(r1));

// ---------------------------------------------------------------- 2. CÓRNER
const r2 = await page.evaluate(async () => {
  const { engine, stepEngine } = window.__match;
  const DT = 1 / 60;
  const eng = await import("/src/game/engine.js");
  eng.kickoff(engine);
  const b = engine.ball;
  b.x = 50; b.z = 10; b.y = 0.11; b.vx = 9; b.vy = 0; b.vz = 0;
  b.lastTouch = engine.away[3].uid; b.touchCooldown = 0; b.spin = 0; // la desvía un defensor
  for (const p of engine.players) { p.x = -45; p.z = -30; p.vx = p.vz = 0; p.hasBall = false; }
  for (let i = 0; i < 60 * 9 && engine.deadBall.state === "OPEN_PLAY"; i++)
    stepEngine(engine, DT, { x: 0, z: 0 }, {});
  const db = engine.deadBall;
  return { kind: db.kind, taker: db.takerSide, state: db.state, cornersHome: engine.stats.home.corners };
});
console.log("2 corner:", JSON.stringify(r2));

// ---------------------------------------------------------------- 3. PUERTA
const r3 = await page.evaluate(async () => {
  const { engine, stepEngine } = window.__match;
  const DT = 1 / 60;
  const eng = await import("/src/game/engine.js");
  eng.kickoff(engine);
  const b = engine.ball;
  b.x = 50; b.z = -8; b.y = 0.11; b.vx = 9; b.vy = 0; b.vz = 0;
  b.lastTouch = engine.home[8].uid; b.touchCooldown = 0; b.spin = 0; // la manda fuera el atacante
  for (const p of engine.players) { p.x = -45; p.z = -30; p.vx = p.vz = 0; p.hasBall = false; }
  for (let i = 0; i < 60 * 9 && engine.deadBall.state === "OPEN_PLAY"; i++)
    stepEngine(engine, DT, { x: 0, z: 0 }, {});
  const db = engine.deadBall;
  return { kind: db.kind, taker: db.takerSide, state: db.state };
});
console.log("3 puerta:", JSON.stringify(r3));

// ------------------------------------------------- 4. FALTA + AMARILLA
const r4 = await page.evaluate(async () => {
  const { engine, stepEngine, processActions } = window.__match;
  const DT = 1 / 60;
  const eng = await import("/src/game/engine.js");
  eng.kickoff(engine);
  const mod = await import("/src/game/fouls.js");
  engine.__foulHook = { whistle: true }; // determinista
  const by = engine.away.find((p) => p.role === "CM" && !p.sentOff);
  const victim = engine.home.find((p) => p.role === "CM");
  for (const p of engine.players) { p.x = -45; p.z = -30; p.vx = p.vz = 0; p.hasBall = false; }
  by.x = 5; by.z = 2; victim.x = 5.4; victim.z = 2.4;
  victim.facing = 0; by.facing = Math.PI;
  const rec = mod.registerFoul(engine, {
    by, victim, touchedBallFirst: false, intensity: 0.8, fromBehind: true,
  });
  // El aviso se verifica en el DOM (misma instancia del store que el HUD).
  await new Promise((r) => setTimeout(r, 120));
  const noticeAtWhistle = document.querySelector(".notice-toast")?.textContent || null;
  // Capturar la reanudación en el momento del pitido (antes de que el juego avance)
  const kindAtWhistle = engine.deadBall.kind;
  const takerAtWhistle = engine.deadBall.takerSide;
  const spotAtWhistle = engine.deadBall.spot ? { ...engine.deadBall.spot } : null;
  const db = engine.deadBall;
  // El usuario (home) ejecuta el libre con X (raso)
  for (let i = 0; i < 60 * 4 && db.state !== "DEAD_BALL_READY"; i++)
    stepEngine(engine, DT, { x: 0, z: 0 }, {});
  const userKicking = db.userKicking;
  const fin = { move: { x: 1, z: 0 }, downCodes: {}, sprint: false, sprintPressed: false, dribbleMod: false, helper: false, shootHeld: false, events: ["pass"] };
  processActions(engine, fin, DT);
  const afterUser = db.state;
  for (let i = 0; i < 60 * 4 && db.state !== "OPEN_PLAY"; i++)
    stepEngine(engine, DT, { x: 0, z: 0 }, {});
  return {
    whistled: !!rec, card: rec && rec.card, yellow: by.cards.yellow,
    kind: kindAtWhistle, taker: takerAtWhistle, spot: spotAtWhistle,
    userKicking, afterUser, final: db.state,
    foulsAway: engine.stats.away.fouls, yellowAway: engine.stats.away.yellow,
    notice: noticeAtWhistle,
  };
});
console.log("4 falta+amarilla:", JSON.stringify(r4));

// ------------------------------------------------- 5. DOBLE AMARILLA
const r5 = await page.evaluate(async () => {
  const { engine, stepEngine } = window.__match;
  const DT = 1 / 60;
  const eng = await import("/src/game/engine.js");
  eng.kickoff(engine);
  const mod = await import("/src/game/fouls.js");
  engine.__foulHook = { whistle: true };
  const by = engine.away.find((p) => p.cards.yellow > 0 && !p.sentOff);
  const victim = engine.home.find((p) => p.role === "CM");
  by.x = 0; by.z = 0; victim.x = 0.4; victim.z = 0.2;
  const rec = mod.registerFoul(engine, {
    by, victim, touchedBallFirst: false, intensity: 0.8, fromBehind: true,
  });
  const soUid = by.uid;
  const sx = by.x, sz = by.z; // posición tras la expulsión: no debe moverse
  for (let i = 0; i < 120; i++) stepEngine(engine, DT, { x: 0, z: 0 }, {});
  const so = engine.players.find((p) => p.uid === soUid);
  const moved = Math.hypot(so.x - sx, so.z - sz);
  return {
    card: rec && rec.card, yellow: by.cards.yellow, red: by.cards.red,
    sentOff: by.sentOff, moved: +moved.toFixed(3),
    redAway: engine.stats.away.red, yellowAway: engine.stats.away.yellow,
  };
});
console.log("5 doble amarilla:", JSON.stringify(r5));

// ------------------------------------------------- 6. FUERA DE JUEGO
const r6 = await page.evaluate(async () => {
  const { engine, stepEngine } = window.__match;
  const off = await import("/src/game/offside.js");
  const DT2 = 1 / 60;
  engine.__foulHook = null; // las entradas de la IA no pitan en este escenario
  const eng = await import("/src/game/engine.js");
  eng.kickoff(engine);
  for (const p of engine.players) { p.hasBall = false; p.vx = p.vz = 0; }
  const passer = engine.home.find((p) => p.role === "CM");
  const rec = engine.players.find((p) => p.uid === engine.controlledUid); // el ST controlado
  passer.x = 10; passer.z = 0; passer.hasBall = true;
  rec.x = 30; rec.z = 2;
  for (const d of engine.away) { if (d.role !== "GK") { d.x = 20; d.z = d.homeSpot.z * 0.3; d.vx = d.vz = 0; } }
  const b = engine.ball;
  b.x = 10; b.z = 0; b.y = 0.11; b.vx = b.vy = b.vz = 0;
  b.lastTouch = passer.uid; b.touchCooldown = 0; b.spin = 0;
  const wasOff = off.wouldBeOffside(engine, passer, rec);
  off.snapshotPass(engine, passer, rec, {});
  const watchCreated = !!engine.offsideWatch;
  // El pase "llega": balón junto al receptor
  passer.hasBall = false;
  b.x = rec.x; b.z = rec.z;
  for (const p of engine.players) {
    if (p !== rec && Math.hypot(p.x - b.x, p.z - b.z) < 3) { p.x = b.x - 10; p.z = b.z; }
  }
  for (let i = 0; i < 30 && engine.deadBall.state === "OPEN_PLAY"; i++)
    stepEngine(engine, DT2, { x: 0, z: 0 }, {});
  const db = engine.deadBall;
  return {
    wasOff, watchCreated, state: db.state, kind: db.kind,
    indirect: db.indirect, offsidesHome: engine.stats.home.offsides,
  };
});
console.log("6 fuera de juego:", JSON.stringify(r6));

// --------------------------------------- 6b. SIN PARTICIPACIÓN NO SE PITA
const r6b = await page.evaluate(async () => {
  const { engine, stepEngine } = window.__match;
  const off = await import("/src/game/offside.js");
  const DT2 = 1 / 60;
  engine.__foulHook = null; // las entradas de la IA no pitan en este escenario
  const eng = await import("/src/game/engine.js");
  eng.kickoff(engine);
  for (const p of engine.players) { p.hasBall = false; p.vx = p.vz = 0; }
  const passer = engine.home.find((p) => p.role === "CM");
  const rec = engine.home.find((p) => p.role === "LW");
  const mate = engine.home.find((p) => p.role === "RW");
  passer.x = 10; passer.z = 0; passer.hasBall = true;
  rec.x = 30; rec.z = -15; // adelantado pero lejos del balón
  mate.x = 12; mate.z = 5; // habilitado, cerca
  for (const d of engine.away) { if (d.role !== "GK") { d.x = 20; d.z = d.homeSpot.z * 0.3; d.vx = d.vz = 0; } }
  const b = engine.ball;
  b.x = 10; b.z = 0; b.y = 0.11; b.vx = b.vy = b.vz = 0;
  b.lastTouch = passer.uid; b.touchCooldown = 0; b.spin = 0;
  off.snapshotPass(engine, passer, rec, {});
  const watchCreated = !!engine.offsideWatch;
  // El balón va al compañero habilitado, que lo controla
  passer.hasBall = false;
  b.x = mate.x; b.z = mate.z;
  // Determinista: el resto aparcado lejos, sin entradas de la IA
  for (const p of engine.players) {
    if (p !== passer && p !== rec && p !== mate) { p.x = -45; p.z = -30; p.vx = p.vz = 0; }
  }
  for (let i = 0; i < 60; i++) stepEngine(engine, DT2, { x: 0, z: 0 }, {});
  return {
    watchCreated, state: engine.deadBall.state, kind: engine.deadBall.kind,
    mateHasBall: mate.hasBall, watchAfter: !!engine.offsideWatch,
  };
});
console.log("6b sin participación:", JSON.stringify(r6b));

// ------------------------------------------------- 7. PENALTI
const r7 = await page.evaluate(async () => {
  const { engine, stepEngine, processActions } = window.__match;
  const dbm = await import("/src/game/deadball.js");
  const DT2 = 1 / 60;
  engine.__foulHook = null;
  const eng = await import("/src/game/engine.js");
  eng.kickoff(engine);
  for (const p of engine.players) { p.hasBall = false; p.vx = p.vz = 0; }
  dbm.enterDeadBall(engine, "penalty", { takerSide: "home" });
  let reachedReady = false;
  for (let i = 0; i < 60 * 4 && engine.deadBall.state !== "DEAD_BALL_READY"; i++)
    stepEngine(engine, DT2, { x: 0, z: 0 }, {});
  reachedReady = engine.deadBall.state === "DEAD_BALL_READY";
  const db = engine.deadBall;
  const gk = engine.players.find((p) => p.uid === db.keeperUid);
  const gkSpot = { x: +gk.x.toFixed(1), z: +gk.z.toFixed(1) };
  const kicker = engine.players.find((p) => p.uid === db.kickerUid);
  const kickSpot = { x: +kicker.x.toFixed(1), z: +kicker.z.toFixed(1) };
  // El usuario ejecuta con X (colocado raso hacia la portería)
  const fin = { move: { x: 1, z: 0.15 }, downCodes: {}, sprint: false, sprintPressed: false, dribbleMod: false, helper: false, shootHeld: false, events: ["pass"] };
  processActions(engine, fin, DT2);
  const afterUser = db.state;
  const ballSp = +Math.hypot(engine.ball.vx, engine.ball.vz).toFixed(1);
  let keeperDove = false, goal = null;
  for (let i = 0; i < 60 * 4; i++) {
    stepEngine(engine, DT2, { x: 0, z: 0 }, { onGoal: (s) => { goal = s; } });
    if (gk.ai && gk.ai.state === "GK_DIVE") keeperDove = true;
    if (goal || db.state === "OPEN_PLAY") break;
  }
  return {
    reachedReady, userKicking: db.userKicking,
    gkSpot, kickSpot, afterUser, ballSp, keeperDove, goal,
    penaltiesHome: engine.stats.home.penalties,
  };
});
console.log("7 penalti:", JSON.stringify(r7));
await page.screenshot({ path: "test/shots/faseD_penalti.png" });

// ------------------------------------------------- 8. BARRERA (captura)
const r8 = await page.evaluate(async () => {
  const { engine, stepEngine } = window.__match;
  const eng = await import("/src/game/engine.js");
  eng.kickoff(engine);
  const mod = await import("/src/game/fouls.js");
  engine.__foulHook = { whistle: true };
  const by = engine.away.find((p) => p.role === "LCB" && !p.sentOff);
  const victim = engine.home.find((p) => p.role === "ST");
  for (const p of engine.players) { p.hasBall = false; p.vx = p.vz = 0; }
  victim.x = 32; victim.z = 3; victim.facing = 0; // falta frontal a ~20 m
  by.x = 31.4; by.z = 2.6; by.facing = Math.PI;
  mod.registerFoul(engine, { by, victim, touchedBallFirst: false, intensity: 0.7 });
  const DT2 = 1 / 60;
  for (let i = 0; i < 60 * 4 && engine.deadBall.state !== "DEAD_BALL_READY"; i++)
    stepEngine(engine, DT2, { x: 0, z: 0 }, {});
  const db = engine.deadBall;
  // Distancia de la barrera al punto de falta
  const wall = engine.players.filter((p) => p.side === "away" && p.role !== "GK" && !p.sentOff)
    .map((p) => +Math.hypot(p.x - db.spot.x, p.z - db.spot.z).toFixed(1))
    .sort((a, b) => a - b).slice(0, 6);
  return { kind: db.kind, state: db.state, spot: db.spot, wallDists: wall };
});
console.log("8 barrera:", JSON.stringify(r8));
await page.waitForTimeout(400);
await page.screenshot({ path: "test/shots/faseD_tiro_libre.png" });

console.log("consoleErrors:", JSON.stringify(errors));
console.log("stats:", await page.evaluate(() => JSON.stringify(window.__match.stats)));
await browser.close();
if (errors.length) process.exitCode = 2;

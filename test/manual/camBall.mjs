// Verifica los 3 cambios (2026-09-28):
// 1. Balón más manso: pase raso y tiro salen con menos velocidad inicial.
// 2. Cámara Z: alterna broadcast/cercana (store + captura visual).
// 3. Retención: el poseedor no pierde el balón por disputa suave a 0,6 m;
//    a 0,4 m el poke es débil (balón queda cerca).
// Uso: node test/camBall.mjs
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
  null,
  { polling: 200, timeout: 60000 }
);
await page.waitForTimeout(4000); // la cámara broadcast se asienta

const results = [];
const check = (name, ok, extra = "") =>
  results.push((ok ? "OK   " : "FAIL ") + name + (extra ? " - " + extra : ""));

// ---- 2. Cámara: Z alterna el modo + capturas ----
const mode0 = await page.evaluate(() => window.__store.getState().cameraMode);
await page.screenshot({ path: "test/shots/cam_broadcast.png" });
await page.keyboard.press("KeyZ");
await page.waitForTimeout(2500); // la cámara viaja hasta la posición cercana
const mode1 = await page.evaluate(() => window.__store.getState().cameraMode);
await page.screenshot({ path: "test/shots/cam_close.png" });
await page.keyboard.press("KeyZ");
await page.waitForTimeout(500);
const mode2 = await page.evaluate(() => window.__store.getState().cameraMode);
check("Z alterna broadcast -> cercana", mode0 === "broadcast" && mode1 === "close",
  `${mode0} -> ${mode1}`);
check("Z vuelve a broadcast", mode2 === "broadcast", mode2);
const badge = await page.evaluate(() => document.querySelector(".camera-badge")?.textContent || "");
check("insignia de cámara visible", badge.includes("Z"), badge.trim());

// ---- 1 y 3. Motor parado: pases/tiro y retención ----
await page.evaluate(() => window.__store.getState().pause());
const r = await page.evaluate(async () => {
  const m = window.__match;
  const e = m.engine;
  const mkFin = (events, downCodes = {}) => ({
    move: { x: 0, z: 0 }, downCodes, sprint: false, sprintPressed: false,
    dribbleMod: false, helper: false, shootHeld: !!downCodes["KeyA"], events,
  });
  const giveBall = (p) => {
    for (const q of e.players) q.hasBall = false;
    p.hasBall = true; p.vx = p.vz = 0; p.touchTimer = 9;
    const b = e.ball;
    b.x = p.x; b.z = p.z; b.y = 0.17; b.vx = b.vy = b.vz = 0;
    b.lastTouch = null; b.touchCooldown = 0;
  };
  const out = {};
  // 1a. Pase raso (toque A): velocidad inicial
  {
    const c = m.getControlled(e);
    giveBall(c);
    m.processActions(e, mkFin(["actionDown"], { KeyA: true }), 1 / 60);
    m.processActions(e, mkFin(["actionUp"], {}), 1 / 60);
    out.passSpeed = Math.hypot(e.ball.vx, e.ball.vz);
  }
  // 1b. Tiro a media carga
  {
    const c = m.getControlled(e);
    giveBall(c);
    c.x = 30; c.z = 0; giveBall(c);
    m.processActions(e, mkFin(["actionDown"], { KeyA: true }), 1 / 60);
    for (let i = 0; i < 30; i++) m.processActions(e, mkFin([], { KeyA: true }), 1 / 60); // 0,5 s carga
    m.processActions(e, mkFin(["actionUp"], {}), 1 / 60);
    out.shotSpeed = Math.hypot(e.ball.vx, e.ball.vz);
  }
  // 3a. Rival FIJADO a 0,65 m del poseedor quieto (sin entradas): a 0,6 m
  // ya puede pokear, pero a 0,65 m no debe quitarle el balón en 2 s
  {
    const c = m.getControlled(e);
    c.x = 0; c.z = 10; giveBall(c);
    const riv = e.players.filter((p) => p.side === "away" && p.role !== "GK")[0];
    for (const p of e.players) { if (p !== c && p !== riv) { p.x = -40; p.vx = p.vz = 0; } }
    for (let i = 0; i < 120; i++) {
      riv.x = 0.65; riv.z = 10; riv.vx = riv.vz = 0;
      riv.tackleT = 0; riv.tackleCd = 1; riv.pokeCd = 0; // sin entradas; poke permitido
      m.stepEngine(e, 1 / 60, { x: 0, z: 0 }, {});
    }
    out.keepsAt065 = c.hasBall;
  }
  // 3b. Rival a 0,4 m: puede pokear, pero débil (balón queda a < 3 m)
  {
    const c = m.getControlled(e);
    c.x = 0; c.z = -10; giveBall(c);
    const riv = e.players.filter((p) => p.side === "away" && p.role !== "GK")[0];
    riv.x = 0.4; riv.z = -10; riv.vx = riv.vz = 0; riv.tackleT = 0; riv.pokeCd = 0;
    for (const p of e.players) { if (p !== c && p !== riv) { p.x = -40; p.vx = p.vz = 0; } }
    let poked = false;
    for (let i = 0; i < 120; i++) {
      m.stepEngine(e, 1 / 60, { x: 0, z: 0 }, {});
      if (!c.hasBall) { poked = true; break; }
    }
    out.pokeWeak = !poked || Math.hypot(e.ball.x - c.x, e.ball.z - c.z) < 3;
    out.poked = poked;
  }
  // 3c. Rival a distancia de poke del balón de un poseedor quieto: SÍ
  // disputa con el poke (geometría real: balón a 0,45 m del dueño tras un
  // buen control; el presionador que entra queda a 0,45 m del balón).
  {
    const c = m.getControlled(e);
    c.x = 0; c.z = 10; c.facing = 0;
    for (const q of e.players) q.hasBall = false;
    c.hasBall = true; c.vx = c.vz = 0; c.touchTimer = 9;
    const b = e.ball;
    b.x = 0.45; b.z = 10; b.y = 0.17; b.vx = b.vy = b.vz = 0;
    b.lastTouch = null; b.touchCooldown = 0;
    const riv = e.players.filter((p) => p.side === "away" && p.role !== "GK")[0];
    for (const p of e.players) { if (p !== c && p !== riv) { p.x = -40; p.vx = p.vz = 0; } }
    riv.x = 0.9; riv.z = 10; riv.vx = riv.vz = 0; // separación 0,9: sin empujón
    riv.tackleT = 0; riv.tackleCd = 1; riv.pokeCd = 0;
    m.stepEngine(e, 1 / 60, { x: 0, z: 0 }, {});
    out.pokeAt045 = !c.hasBall;
  }
  // 3d. Pase firme (14 m/s) a receptor decente: control BUENO, el balón
  // queda a los pies (antes la penalización por velocidad lo hacía malo
  // casi siempre: "el rebote").
  {
    const c = m.getControlled(e);
    for (const q of e.players) { q.hasBall = false; q.aiActive = false; q.x = -40; q.vx = q.vz = 0; }
    c.x = 0; c.z = 10; c.vx = c.vz = 0; c.hasBall = false;
    c.data.dribbling = 75;
    const b = e.ball;
    b.x = -8; b.z = 10; b.y = 0.17; b.vx = 14; b.vy = 0; b.vz = 0;
    b.lastTouch = null; b.touchCooldown = 0;
    c.facing = Math.atan2(10 - 10, -8 - 0); // de cara al balón
    for (let i = 0; i < 120 && !c.hasBall; i++) m.stepEngine(e, 1 / 60, { x: 0, z: 0 }, {});
    const dAfter = Math.hypot(b.x - c.x, b.z - c.z);
    out.firmCatch = c.hasBall && dAfter < 0.6;
    out.firmCatchD = dAfter.toFixed(2);
  }
  {
    const c = m.getControlled(e);
    for (const q of e.players) { q.hasBall = false; q.aiActive = false; }
    const b = e.ball;
    b.x = -5; b.z = 0; b.y = 0.17; b.vx = 6; b.vy = 0; b.vz = 0;
    b.lastTouch = null; b.touchCooldown = 0;
    const riv = e.players.filter((p) => p.side === "away" && p.role !== "GK")[0];
    riv.x = 0; riv.z = 0; riv.vx = riv.vz = 0; riv.tackleT = 0; riv.tackleCd = 1;
    for (const p of e.players) { if (p !== riv) { p.x = -40; p.vx = p.vz = 0; } }
    let picked = false;
    for (let i = 0; i < 240 && !picked; i++) {
      riv.x = 0; riv.z = 0; riv.vx = riv.vz = 0; // quieto en la trayectoria
      m.stepEngine(e, 1 / 60, { x: 0, z: 0 }, {});
      if (riv.hasBall) picked = true;
    }
    out.intercepted = picked;
    void c;
  }
  return out;
});

check("pase raso sale más manso (<=19 m/s)", r.passSpeed <= 19,
  r.passSpeed.toFixed(1) + " m/s");
check("tiro a media carga más manso (<=21 m/s)", r.shotSpeed <= 21,
  r.shotSpeed.toFixed(1) + " m/s");
check("poseedor conserva el balón con rival a 0,65 m", r.keepsAt065 === true,
  String(r.keepsAt065));
check("rival a 0,45 m del balón disputa con el poke", r.pokeAt045 === true,
  String(r.pokeAt045));
check("pase firme 14 m/s: control bueno, balón a los pies", r.firmCatch === true,
  `dist=${r.firmCatchD} m`);
check("poke a 0,4 m es débil (balón queda cerca)", r.pokeWeak === true,
  `poke=${r.poked}`);
check("balón suelto: el rival lo recoge", r.intercepted === true,
  String(r.intercepted));

console.log(results.join("\n"));
console.log("errores de consola:", errors.length ? errors : "ninguno");
await browser.close();
if (results.some((x) => x.startsWith("FAIL")) || errors.length) process.exit(1);

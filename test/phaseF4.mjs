// Test Fase 4: profundidad de control y jugabilidad.
// - Pase con potencia (E mantener/soltar, 1x–1,6x) y tenso.
// - Bombeado (X: vy alta) y hueco (C: objetivo).
// - Colocado (raso), potente (sprint) y vaselina (chip).
// - Primer toque orientado + protección (guardT).
// - Entradas Buffs (cd 0,7, lunge 9) y stick derecho que cambia.
// - Stamina: drenaje/recuperación y la IA fundida no esprinta.
// - 0 errores de consola.
import { launchBrowser, gotoMatch } from "./helpers.mjs";

const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + String(e).slice(0, 220)));
page.on("console", (m) => {
  if (m.type() === "error") errors.push("console: " + m.text().slice(0, 220));
});
const ev = (fn, arg) => page.evaluate(fn, arg);

const giveBall = () => ev(() => {
  const { engine, getControlled } = window.__match;
  const c = getControlled(engine);
  for (const p of engine.players) p.hasBall = false;
  c.hasBall = true;
  const b = engine.ball;
  b.x = c.x; b.z = c.z; b.y = 0.22; b.vx = b.vy = b.vz = 0;
  b.lastTouch = null; b.touchCooldown = 0;
  engine.charge = null; engine.passCharge = null; engine.passTarget = null;
});

try {
  await gotoMatch(page, { home: "Real Madrid", away: "Barcelona", duration: "3 min" });
  await ev(() => window.__store.getState().setControlScheme("wasd"));
  await page.waitForFunction(() => window.__match.engine.time > 1, null, { timeout: 120000 });

  // 1. Pase con potencia: E mantenido carga, al soltar pasa más fuerte.
  await giveBall();
  await page.keyboard.down("e");
  await page.waitForFunction(() => {
    const pc = window.__match.engine.passCharge;
    return pc && pc.t > 0.3;
  }, null, { timeout: 30000 });
  await page.keyboard.up("e");
  await page.waitForTimeout(600);
  const charged = await ev(() => ({
    target: !!window.__match.engine.passTarget,
    spd: +Math.hypot(window.__match.engine.ball.vx, window.__match.engine.ball.vz).toFixed(1),
  }));
  console.log("pase cargado:", JSON.stringify(charged));
  if (!charged.target || !(charged.spd > 10)) throw new Error("el pase cargado no salió");

  // 1b. powerMult determinista a nivel de motor (misma geometría).
  const mult = await ev(async () => {
    const { engine } = window.__match;
    const { doGroundPass } = await import("/src/game/passing.js");
    const c = engine.players.find((p) => p.controlled);
    const mate = engine.players.find((p) => p.side === c.side && p !== c && p.role !== "GK");
    mate.x = c.x + 10; mate.z = c.z; mate.vx = 0; mate.vz = 0;
    c.hasBall = true;
    const b = engine.ball;
    const spds = [];
    for (const mm of [1, 1.6]) {
      b.x = c.x; b.z = c.z; b.y = 0.22; b.vx = b.vy = b.vz = 0;
      c.hasBall = true;
      doGroundPass(engine, c, { x: 1, z: 0 }, mate, { powerMult: mm });
      spds.push(+Math.hypot(b.vx, b.vz).toFixed(1));
    }
    return spds;
  });
  console.log("potencia 1x vs 1,6x:", JSON.stringify(mult));
  if (!(mult[1] > mult[0] * 1.3)) throw new Error("la potencia no escala");

  // 2. X = bombeado (llega por la vía real del teclado) y su vy inicial es
  // alta (verificación determinista a nivel de motor en el mismo tick).
  await giveBall();
  await page.keyboard.press("x");
  await page.waitForFunction(() => !!window.__match.engine.passTarget, null, { timeout: 15000 });
  console.log("X = bombeado (vía teclado): OK");
  const lobVy = await ev(async () => {
    const { engine } = window.__match;
    const { doLobbedPass } = await import("/src/game/passing.js");
    const c = engine.players.find((p) => p.controlled);
    for (const p of engine.players) p.hasBall = false;
    c.hasBall = true;
    const b = engine.ball;
    b.x = c.x; b.z = c.z; b.y = 0.22; b.vx = b.vy = b.vz = 0;
    doLobbedPass(engine, c, { x: 1, z: 0 });
    return +b.vy.toFixed(2);
  });
  console.log("bombeado vy0:", lobVy);
  if (!(lobVy > 4)) throw new Error("el bombeado no se elevó");
  await giveBall();
  await page.keyboard.press("c");
  await page.waitForTimeout(800);
  const thru = await ev(() => !!window.__match.engine.passTarget);
  if (!thru) throw new Error("el hueco no buscó receptor");
  console.log("hueco: OK");

  // 3. Colocado (carga 0,3, sin sprint): raso y manso.
  const placed = await ev(async () => {
    const { engine } = window.__match;
    const { startShotCharge, releaseShot } = await import("/src/game/shooting.js");
    const c = engine.players.find((p) => p.controlled);
    for (const p of engine.players) p.hasBall = false;
    c.hasBall = true;
    const b = engine.ball;
    b.x = c.x; b.z = c.z; b.y = 0.22; b.vx = b.vy = b.vz = 0;
    c.vx = 0; c.vz = 0;
    startShotCharge(engine, c, { x: 1, z: 0 });
    engine.charge.t = 0.3;
    releaseShot(engine);
    return { spd: +Math.hypot(b.vx, b.vz).toFixed(1), vy: +b.vy.toFixed(2) };
  });
  console.log("colocado:", JSON.stringify(placed));
  if (!(placed.spd < 15 && placed.vy < 2.2)) throw new Error("el colocado no es raso/manso");

  // 4. Potente (driven): claramente más rápido.
  const driven = await ev(async () => {
    const { engine } = window.__match;
    const { startShotCharge, releaseShot } = await import("/src/game/shooting.js");
    const c = engine.players.find((p) => p.controlled);
    for (const p of engine.players) p.hasBall = false;
    c.hasBall = true;
    const b = engine.ball;
    b.x = c.x; b.z = c.z; b.y = 0.22; b.vx = b.vy = b.vz = 0;
    c.vx = 0; c.vz = 0;
    startShotCharge(engine, c, { x: 1, z: 0 });
    engine.charge.t = 0.8;
    engine.charge.driven = true;
    releaseShot(engine);
    return { spd: +Math.hypot(b.vx, b.vz).toFixed(1) };
  });
  console.log("potente:", JSON.stringify(driven));
  if (!(driven.spd > 19)) throw new Error("el potente no corre");

  // 5. Vaselina (chip): parábola alta.
  const chip = await ev(async () => {
    const { engine } = window.__match;
    const { startShotCharge, releaseShot } = await import("/src/game/shooting.js");
    const c = engine.players.find((p) => p.controlled);
    for (const p of engine.players) p.hasBall = false;
    c.hasBall = true;
    const b = engine.ball;
    b.x = c.x; b.z = c.z; b.y = 0.22; b.vx = b.vy = b.vz = 0;
    c.vx = 0; c.vz = 0;
    startShotCharge(engine, c, { x: 1, z: 0 });
    engine.charge.t = 0.5;
    engine.charge.chip = true;
    releaseShot(engine);
    return { vy: +b.vy.toFixed(2) };
  });
  console.log("vaselina vy:", chip.vy);
  if (!(chip.vy > 3)) throw new Error("la vaselina no se elevó");

  // 6. Primer toque orientado + protección (tras kickoff limpio).
  const touch = await ev(async () => {
    const { engine, stepEngine } = window.__match;
    const { kickoff } = await import("/src/game/engine.js");
    kickoff(engine); // estado abierto y posiciones reglamentarias
    const c = engine.players.find((p) => p.controlled);
    for (const p of engine.players) p.hasBall = false;
    c.x = -30; c.z = 20; c.vx = 0; c.vz = 0; c.facing = 0; // de cara al balón que viene de +x
    const b = engine.ball;
    b.x = c.x + 0.6; b.z = c.z; b.y = 0.22; b.vx = -1.2; b.vy = 0; b.vz = 0;
    b.lastTouch = null; b.touchCooldown = 0;
    engine.userMove = { x: 1, z: 0 }; // el usuario pide +x (contrario al facing)
    const DT = 1 / 60;
    for (let i = 0; i < 40 && !c.hasBall; i++) stepEngine(engine, DT, { x: 0, z: 0 }, {});
    return { hasBall: c.hasBall, ahead: b.x > c.x, guardT: +(c.guardT || 0).toFixed(2) };
  });
  console.log("primer toque:", JSON.stringify(touch));
  if (!touch.hasBall || !touch.ahead || !(touch.guardT > 0))
    throw new Error("toque no orientado o sin protección");

  // 7. Entradas: cd 0,7 y lunge 9.
  const tack = await ev(async () => {
    const { engine } = window.__match;
    const { startTackle } = await import("/src/game/tackling.js");
    const c = engine.players.find((p) => p.controlled);
    c.tackleCd = 0; c.tackleT = 0;
    startTackle(engine, c, { x: 1, z: 0 });
    return { cd: c.tackleCd, spd: c.tackleSpeed };
  });
  console.log("entrada:", JSON.stringify(tack));
  if (!(tack.cd === 0.7 && tack.spd === 9)) throw new Error("buffs de entrada ausentes");

  // 8. Stick derecho: golpe seco cambia de jugador.
  const rs = await ev(async () => {
    const { engine, processActions } = window.__match;
    const { createInputState, pollFrameInput } = await import("/src/game/input.js");
    const st = window.__store.getState();
    const before = engine.players.find((p) => p.controlled).uid;
    const btns = Array.from({ length: 17 }, () => ({ pressed: false, value: 0 }));
    const orig = navigator.getGamepads;
    navigator.getGamepads = () => [{ connected: true, buttons: btns, axes: [0, 0, 0.9, 0.1] }];
    // Sondeo directo: prueba la ruta real gamepad -> input -> acción sin
    // depender de que requestAnimationFrame avance en SwiftShader headless.
    const input = createInputState();
    const fin = pollFrameInput(input, {
      scheme: st.controlScheme,
      overrides: st.bindings,
      padDeadzone: st.padDeadzone,
      padSensitivity: st.padSensitivity,
    });
    processActions(engine, fin, 1 / 60);
    const after = engine.players.find((p) => p.controlled).uid;
    navigator.getGamepads = orig;
    return { before, after, events: fin.events, switchMove: fin.switchMove };
  });
  console.log("stick derecho:", JSON.stringify(rs));
  if (rs.before === rs.after) throw new Error("el stick derecho no cambió de jugador");

  // 8b. Drift del stick derecho: mantenido en 0.8 NO repite cambios (rearme).
  const drift = await ev(async () => {
    const { createInputState, pollFrameInput } = await import("/src/game/input.js");
    const st = window.__store.getState();
    const btns = Array.from({ length: 17 }, () => ({ pressed: false, value: 0 }));
    const orig = navigator.getGamepads;
    navigator.getGamepads = () => [{ connected: true, buttons: btns, axes: [0, 0, 0.8, 0] }];
    const input = createInputState();
    const opts = {
      scheme: st.controlScheme,
      overrides: st.bindings,
      padDeadzone: st.padDeadzone,
      padSensitivity: st.padSensitivity,
    };
    let switches = 0;
    try {
      for (let i = 0; i < 200; i++) {
        const fin = pollFrameInput(input, opts);
        if (fin.events.includes("switch")) switches++;
      }
    } finally {
      navigator.getGamepads = orig;
    }
    return { switches };
  });
  console.log("drift stick derecho:", JSON.stringify(drift));
  if (drift.switches !== 1) throw new Error("el drift repite cambios: " + drift.switches);

  // 9. Stamina: drenaje 8,5/s, recupero 6,5/s parado.
  const stam = await ev(async () => {
    const { updateStamina } = await import("/src/game/stamina.js");
    const p = { stamina: 50 };
    updateStamina(p, 1, true, true);
    const afterDrain = +p.stamina.toFixed(1);
    p.stamina = 50;
    updateStamina(p, 1, false, false);
    return { afterDrain, afterIdle: +p.stamina.toFixed(1) };
  });
  console.log("stamina:", JSON.stringify(stam));
  if (!(stam.afterDrain === 41.5 && stam.afterIdle === 56.5))
    throw new Error("tasas de stamina incorrectas");

  // 10. La IA fundida no esprinta.
  const aiCap = await ev(async () => {
    const { engine, stepEngine } = window.__match;
    const p = engine.players.find((q) => !q.controlled && q.role !== "GK");
    p.stamina = 10;
    p.desiredSpeed = p.maxSpeed;
    p.moveTarget = { x: p.x + 30, z: p.z };
    p.vx = 0; p.vz = 0;
    stepEngine(engine, 1 / 60, { x: 0, z: 0 }, {});
    return { spd: +Math.hypot(p.vx, p.vz).toFixed(2), cap: +(p.maxSpeed * 0.7).toFixed(2) };
  });
  console.log("IA fundida:", JSON.stringify(aiCap));
  if (!(aiCap.spd <= aiCap.cap + 0.6)) throw new Error("la IA fundida esprinta");

  console.log("errores de consola:", errors.length);
  for (const e of errors.slice(0, 10)) console.log("  -", e);
  await browser.close();
  if (errors.length) process.exit(1);
  console.log("FASE 4 OK");
} catch (e) {
  console.log("errores de consola:", errors.length);
  for (const err of errors.slice(0, 10)) console.log("  -", err);
  await browser.close();
  throw e;
}

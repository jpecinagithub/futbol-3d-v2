// Test Fase 8: animaciones procedurales.
// - Unitario del animator (sin render): suavizado, kick con estilo, receive,
//   slide, fall y 3 variantes de celebración.
// - Integración: control→receive, entrada→slide, tiro→power/style,
//   falta→fall en la víctima, gol→variante de celebración.
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
const mkParts = () => `{
  const R = () => ({ x: 0, z: 0 });
  const P = () => ({ y: 1.16 });
  return {
    thighL: { rotation: R() }, thighR: { rotation: R() },
    shinL: { rotation: R() }, shinR: { rotation: R() },
    armL: { rotation: R() }, armR: { rotation: R() },
    torso: { rotation: R(), position: P(), userData: { baseY: 1.16 } },
    head: { rotation: R() },
  };
}`;

try {
  await gotoMatch(page, { home: "Real Madrid", away: "Barcelona", duration: "3 min" });

  // 1. Unitario del animator.
  const unit = await ev(async (mk) => {
    const { createAnimState, posePlayer } = await import("/src/animation/animator.js");
    // eslint-disable-next-line no-new-func
    const parts = new Function(mk)();
    const out = {};
    // Suavizado: de parado a 7 m/s, el primer frame NO salta al máximo.
    let st = createAnimState();
    st.phase = 0;
    const idle = { vx: 0, vz: 0, facing: 0, anim: {} };
    posePlayer(parts, idle, 0.016, st);
    const run = { vx: 7, vz: 0, facing: 0, anim: {} };
    posePlayer(parts, run, 0.016, st);
    out.smoothFirst = +Math.abs(parts.thighL.rotation.x).toFixed(3);
    // Kick chip vs normal a mitad de envolvente.
    const kick = (style, power) => {
      const pp = new Function(mk)();
      const s2 = createAnimState(); s2.phase = 0;
      posePlayer(pp, { vx: 0, vz: 0, facing: 0, anim: { action: "kick", timer: 0.16, power, style } }, 0.016, s2);
      return +Math.abs(pp.thighR.rotation.x).toFixed(3);
    };
    out.chipLift = kick("chip", 0.9);
    out.normalLift = kick("normal", 0.9);
    // Receive agacha, slide baja más, fall tumba de lado.
    const pose = (action, timer) => {
      const pp = new Function(mk)();
      const s2 = createAnimState(); s2.phase = 0;
      posePlayer(pp, { vx: 0, vz: 0, facing: 0, anim: { action, timer } }, 0.016, s2);
      return { y: +pp.torso.position.y.toFixed(3), rz: +pp.torso.rotation.z.toFixed(3) };
    };
    out.receive = pose("receive", 0.15);
    out.slide = pose("slide", 0.2);
    out.fall = pose("fall", 0.45);
    // Celebraciones: variante 1 con muslos fijos a -1.0.
    const cel = (v) => {
      const pp = new Function(mk)();
      const s2 = createAnimState(); s2.phase = 1;
      posePlayer(pp, { vx: 3, vz: 0, facing: 0, anim: { action: "celebrate", timer: 5, celebr: v } }, 0.016, s2);
      return +pp.thighL.rotation.x.toFixed(3);
    };
    out.cel0 = cel(0); out.cel1 = cel(1); out.cel2 = cel(2);
    return out;
  }, mkParts());
  console.log("animator:", JSON.stringify(unit));
  if (!(unit.smoothFirst < 0.12)) throw new Error("sin suavizado walk->run: " + unit.smoothFirst);
  if (!(unit.chipLift < unit.normalLift)) throw new Error("el chip no varía la pose");
  if (!(unit.receive.y < 1.16)) throw new Error("receive no amortigua");
  if (!(unit.slide.y < 1.16 - 0.2)) throw new Error("slide no baja el cuerpo");
  if (!(Math.abs(unit.fall.rz) > 0.2)) throw new Error("fall no tumba");
  if (!(unit.cel1 === -1)) throw new Error("variante rodillas ausente");

  // 2. Control limpio → receive.
  const recv = await ev(async () => {
    const { engine, stepEngine } = window.__match;
    const { kickoff } = await import("/src/game/engine.js");
    kickoff(engine);
    const c = engine.players.find((p) => p.controlled);
    for (const p of engine.players) p.hasBall = false;
    c.x = -30; c.z = 20; c.vx = 0; c.vz = 0; c.facing = 0;
    const b = engine.ball;
    b.x = c.x + 0.6; b.z = c.z; b.y = 0.22; b.vx = -1.2; b.vy = 0; b.vz = 0;
    b.lastTouch = null; b.touchCooldown = 0;
    const DT = 1 / 60;
    for (let i = 0; i < 40 && !c.hasBall; i++) stepEngine(engine, DT, { x: 0, z: 0 }, {});
    return { hasBall: c.hasBall, action: c.anim.action };
  });
  console.log("recepción:", JSON.stringify(recv));
  if (!(recv.hasBall && recv.action === "receive")) throw new Error("el control no usa receive");

  // 3. Entrada → slide.
  const slide = await ev(async () => {
    const { engine } = window.__match;
    const { startTackle } = await import("/src/game/tackling.js");
    const c = engine.players.find((p) => p.controlled);
    c.tackleCd = 0; c.tackleT = 0;
    startTackle(engine, c, { x: 1, z: 0 });
    return c.anim.action;
  });
  if (slide !== "slide") throw new Error("la entrada no usa slide: " + slide);
  console.log("entrada → slide: OK");

  // 4. Tiro → power + style.
  const shot = await ev(async () => {
    const { engine } = window.__match;
    const { startShotCharge, releaseShot } = await import("/src/game/shooting.js");
    const c = engine.players.find((p) => p.controlled);
    for (const p of engine.players) p.hasBall = false;
    c.hasBall = true;
    const b = engine.ball;
    b.x = c.x; b.z = c.z; b.y = 0.22; b.vx = b.vy = b.vz = 0;
    startShotCharge(engine, c, { x: 1, z: 0 });
    engine.charge.t = 0.8;
    engine.charge.chip = true;
    releaseShot(engine);
    return { action: c.anim.action, power: c.anim.power, style: c.anim.style };
  });
  console.log("tiro:", JSON.stringify(shot));
  if (!(shot.action === "kick" && shot.power === 0.8 && shot.style === "chip"))
    throw new Error("el tiro no fija power/style");

  // 5. Falta → la víctima cae.
  const fall = await ev(async () => {
    const { engine } = window.__match;
    const { registerFoul } = await import("/src/game/fouls.js");
    engine.__foulHook = { whistle: true };
    const by = engine.players.find((p) => p.side === "away" && p.role !== "GK");
    const victim = engine.players.find((p) => p.side === "home" && p.role !== "GK" && !p.controlled);
    registerFoul(engine, { by, victim, touchedBallFirst: false, intensity: 1 });
    engine.__foulHook = null;
    return victim.anim.action;
  });
  if (fall !== "fall") throw new Error("la víctima no cae: " + fall);
  console.log("falta → fall: OK");

  // 6. Gol → variante de celebración del goleador.
  await ev(async () => {
    const { kickoff } = await import("/src/game/engine.js");
    kickoff(window.__match.engine); // limpia la falta del paso anterior
    window.__match.provokeGoal("home");
  });
  await page.waitForFunction(() => window.__match?.phase === "goal", null, { timeout: 30000 });
  await page.waitForTimeout(1000);
  const cel = await ev(() => {
    const { engine } = window.__match;
    const s = engine.players.find((p) => p.uid === engine.lastScorerUid);
    return { action: s.anim.action, celebr: s.anim.celebr };
  });
  console.log("celebración:", JSON.stringify(cel));
  if (!(cel.action === "celebrate" && cel.celebr >= 0 && cel.celebr <= 2))
    throw new Error("sin variante de celebración");
  await page.screenshot({ path: "test/shots/fase8_gol.png" });
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => window.__match?.phase === "playing", null, { timeout: 60000 });

  console.log("errores de consola:", errors.length);
  for (const e of errors.slice(0, 10)) console.log("  -", e);
  await browser.close();
  if (errors.length) process.exit(1);
  console.log("FASE 8 OK");
} catch (e) {
  console.log("errores de consola:", errors.length);
  for (const err of errors.slice(0, 10)) console.log("  -", err);
  await browser.close();
  throw e;
}

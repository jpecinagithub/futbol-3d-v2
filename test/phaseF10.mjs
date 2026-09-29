// Test Fase 10: accesibilidad.
// - Sección en Opciones; todo persiste.
// - Escala UI (zoom) y alto contraste (clase hc).
// - Kits de contraste (helper + alternativo real) y radar con formas.
// - Sin sacudida: camKick en 0. Balón visual sin tocar la física.
// - Cambio automático al recuperar. Vibración sin lanzar.
// - 0 errores de consola.
import { launchBrowser, BASE_URL, jsClick, gotoMatch } from "./helpers.mjs";

const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + String(e).slice(0, 220)));
page.on("console", (m) => {
  if (m.type() === "error") errors.push("console: " + m.text().slice(0, 220));
});
const ev = (fn, arg) => page.evaluate(fn, arg);

try {
  // 1. Sección visible + escala y contraste aplicados al DOM.
  await page.goto(BASE_URL + "/", { waitUntil: "networkidle" });
  await jsClick(page, "button", "Opciones");
  await page.waitForTimeout(500);
  const section = await ev(() => document.body.textContent.includes("ACCESIBILIDAD"));
  if (!section) throw new Error("sin sección de accesibilidad");
  // Ojo: en menú no hay __store; se actúa por UI y se lee localStorage.
  const clickRow = (label) => ev((t) => {
    const row = [...document.querySelectorAll(".options-sheet .controls-row")]
      .find((r) => (r.textContent || "").includes(t));
    row?.querySelector("button")?.click();
    return !!row;
  }, label);
  await clickRow("Alto contraste");
  await page.waitForTimeout(300);
  const hc = await ev(() => ({
    cls: document.getElementById("root").classList.contains("hc"),
    ls: window.localStorage.getItem("f3d.hc"),
  }));
  if (!hc.cls || hc.ls !== "1") throw new Error("alto contraste no aplicado: " + JSON.stringify(hc));
  console.log("alto contraste: OK");
  await page.screenshot({ path: "test/shots/fase10_contraste.png" });
  await clickRow("Alto contraste"); // volver (capturas siguientes normales)
  await page.waitForTimeout(200);

  // Escala 130.
  await ev(() => {
    const btns = [...document.querySelectorAll(".options-sheet .controls-row")]
      .find((r) => (r.textContent || "").includes("Tamaño de la interfaz"))
      ?.querySelectorAll("button");
    [...(btns || [])].find((b) => b.textContent === "130")?.click();
  });
  await page.waitForTimeout(300);
  const zoom = await ev(() => {
    const layer = document.querySelector(".ui-scale-layer");
    const rect = layer?.getBoundingClientRect();
    const scale = Number(layer?.style.zoom || 1);
    return {
      z: layer?.style.zoom,
      rootZ: document.getElementById("root").style.zoom,
      viewport: rect ? [Math.round(rect.width * scale), Math.round(rect.height * scale)] : null,
      expected: [window.innerWidth, window.innerHeight],
      ls: window.localStorage.getItem("f3d.uiScale"),
    };
  });
  if (!(zoom.z === "1.3" && !zoom.rootZ && zoom.ls === "1.3" &&
    Math.abs(zoom.viewport[0] - zoom.expected[0]) <= 1 &&
    Math.abs(zoom.viewport[1] - zoom.expected[1]) <= 1)) {
    throw new Error("escala no aplicada solo a la UI: " + JSON.stringify(zoom));
  }
  console.log("escala UI: OK");

  // 2. Kits: helper + alternativos + formas del radar.
  const kits = await ev(async () => {
    const { kitsClash, resolveKits, ALT_KIT } = await import("/src/data/teams/kits.js");
    const home = { colors: { primary: "#cc0000" } };
    const awaySame = { colors: { primary: "#dd1111" } };
    const awayDiff = { colors: { primary: "#0033cc" } };
    return {
      clashSame: kitsClash(home.colors.primary, awaySame.colors.primary),
      clashDiff: kitsClash(home.colors.primary, awayDiff.colors.primary),
      alt: resolveKits(home, awaySame, true).away.primary === ALT_KIT.primary,
      noAlt: resolveKits(home, awayDiff, true).away.primary === awayDiff.colors.primary,
    };
  });
  console.log("kits:", JSON.stringify(kits));
  if (!(kits.clashSame && !kits.clashDiff && kits.alt && kits.noAlt))
    throw new Error("kits de contraste mal");
  await clickRow("Equipaciones de contraste");
  await page.waitForTimeout(200);
  const altSaved = await ev(() => window.localStorage.getItem("f3d.altKits"));
  if (altSaved !== "1") throw new Error("altKits no persiste");

  // 3. Partido: resto de ajustes a nivel motor.
  await jsClick(page, "button", "Atrás");
  await page.waitForTimeout(400);
  await gotoMatch(page, { home: "Real Madrid", away: "Barcelona", duration: "3 min" });

  // La escala de interfaz no debe cambiar el viewport del canvas 3D.
  const canvasLayout = await ev(() => {
    const rect = document.querySelector("canvas")?.getBoundingClientRect();
    return rect ? {
      size: [Math.round(rect.width), Math.round(rect.height)],
      expected: [window.innerWidth, window.innerHeight],
    } : null;
  });
  if (!canvasLayout || Math.abs(canvasLayout.size[0] - canvasLayout.expected[0]) > 1 ||
    Math.abs(canvasLayout.size[1] - canvasLayout.expected[1]) > 1) {
    throw new Error("la escala UI alteró el canvas: " + JSON.stringify(canvasLayout));
  }

  // Sin sacudida: el tiro no mete kick de cámara.
  await ev(() => window.__store.getState().toggleA11y("reduceMotion"));
  const kick = await ev(async () => {
    const { engine } = window.__match;
    const { startShotCharge, releaseShot } = await import("/src/game/shooting.js");
    const c = engine.players.find((p) => p.controlled);
    for (const p of engine.players) p.hasBall = false;
    c.hasBall = true;
    const b = engine.ball;
    b.x = c.x; b.z = c.z; b.y = 0.22; b.vx = b.vy = b.vz = 0;
    startShotCharge(engine, c, { x: 1, z: 0 });
    engine.charge.t = 0.5;
    releaseShot(engine);
    return engine.camKick;
  });
  if (kick !== 0) throw new Error("camKick no anulado: " + kick);
  console.log("sin sacudida: OK");
  await ev(() => window.__store.getState().toggleA11y("reduceMotion"));

  // Balón visual x1.5 sin tocar la física.
  await ev(() => window.__store.getState().setBallScale(1.5));
  const ball = await ev(async () => {
    const { BALL } = await import("/src/game/constants.js");
    return { radius: BALL.radius, saved: window.localStorage.getItem("f3d.ballScale") };
  });
  if (!(ball.radius === 0.17 && ball.saved === "1.5")) throw new Error("balón mal: " + JSON.stringify(ball));
  console.log("balón visual: OK");

  // PIVOT: conserva el balón al correr y sigue el pase; la ayuda opcional
  // continúa cambiando al compañero que recupera del rival.
  await ev(() => {
    const st = window.__store.getState();
    if (!st.assistSwitch) st.toggleA11y("assistSwitch");
  });
  const auto = await ev(async () => {
    const live = window.__match.engine;
    const { stepEngine } = window.__match;
    const { createMatch, getControlled, kickoff } = await import("/src/game/engine.js");
    const { doGroundPass } = await import("/src/game/passing.js");
    const DT = 1 / 60;

    // 1. Carrera larga sin rivales: el microtoque no puede soltar el balón.
    const runEngine = createMatch(live.homeTeam, live.awayTeam);
    kickoff(runEngine);
    runEngine.training = true;
    const runner = getControlled(runEngine);
    runner.x = -20; runner.z = 0; runner.hasBall = true; runner.touchTimer = 0;
    runEngine.ball.x = runner.x + 0.45; runEngine.ball.z = 0; runEngine.ball.y = 0.22;
    for (const p of runEngine.players) {
      if (p === runner) continue;
      p.x = 35; p.z = p.side === "home" ? 30 : -30; p.moveTarget = null;
    }
    let maxGap = 0;
    for (let i = 0; i < 300; i++) {
      stepEngine(runEngine, DT, { x: 1, z: 0, sprint: true }, {});
      maxGap = Math.max(maxGap, Math.hypot(runEngine.ball.x - runner.x, runEngine.ball.z - runner.z));
    }
    const keptWhileRunning = runner.hasBall;

    // 2. Pase real del PIVOT: el receptor toma el control al instante.
    const engine = createMatch(live.homeTeam, live.awayTeam);
    kickoff(engine);
    engine.training = true;
    engine.assistSwitch = true;
    const pivot = getControlled(engine);
    const mate = engine.players.find((p) => p.side === pivot.side && !p.controlled && p.role !== "GK");
    for (const p of engine.players) p.hasBall = false;
    pivot.hasBall = true;
    engine.ball.x = pivot.x + 0.45; engine.ball.z = pivot.z; engine.ball.y = 0.22;
    doGroundPass(engine, pivot, { x: mate.x - pivot.x, z: mate.z - pivot.z }, mate, { followPivot: true });
    const followedPass = engine.controlledUid === mate.uid && mate.controlled && !pivot.controlled;

    // 3. Una recuperación cuyo último toque fue rival mantiene la ayuda.
    const recoverer = engine.players.find(
      (p) => p.side === mate.side && !p.controlled && p.role !== "GK"
    );
    const rival = engine.players.find((p) => p.side !== mate.side && p.role !== "GK");

    const feedBall = (target, lastTouch) => {
      for (const p of engine.players) p.hasBall = false;
      target.x = -30; target.z = 20; target.vx = 0; target.vz = 0; target.facing = 0;
      const b = engine.ball;
      b.x = target.x + 0.6; b.z = target.z; b.y = 0.22;
      b.vx = -1.2; b.vy = 0; b.vz = 0;
      b.lastTouch = lastTouch; b.touchCooldown = 0;
    };
    engine.passTarget = null;
    feedBall(recoverer, rival.uid);
    for (let i = 0; i < 40 && !recoverer.hasBall; i++) stepEngine(engine, DT, { x: 0, z: 0 }, {});
    return {
      keptWhileRunning,
      maxGap: +maxGap.toFixed(2),
      followedPass,
      recovered: recoverer.hasBall,
      recoveryControlled: engine.controlledUid === recoverer.uid,
    };
  });
  console.log("PIVOT:", JSON.stringify(auto));
  if (!auto.keptWhileRunning || auto.maxGap > 1.75)
    throw new Error("el PIVOT pierde el balón al conducir: " + JSON.stringify(auto));
  if (!auto.followedPass)
    throw new Error("el PIVOT no siguió al receptor del pase");
  if (!auto.recovered || !auto.recoveryControlled)
    throw new Error("la ayuda de recuperación dejó de funcionar");
  await ev(() => window.__store.getState().toggleA11y("assistSwitch"));

  // Vibración sin lanzar + intensidad baja.
  await ev(async () => {
    const { triggerRumble } = await import("/src/game/feedback.js");
    triggerRumble(50, 0.5);
    window.__store.getState().setFxIntensity("baja");
  });
  const fx = await ev(() => window.localStorage.getItem("f3d.fxIntensity"));
  if (fx !== "baja") throw new Error("fx no persiste");
  console.log("vibración + fx: OK");
  await page.screenshot({ path: "test/shots/fase10_partido.png" });

  console.log("errores de consola:", errors.length);
  for (const e of errors.slice(0, 10)) console.log("  -", e);
  await browser.close();
  if (errors.length) process.exit(1);
  console.log("FASE 10 OK");
} catch (e) {
  console.log("errores de consola:", errors.length);
  for (const err of errors.slice(0, 10)) console.log("  -", err);
  await browser.close();
  throw e;
}

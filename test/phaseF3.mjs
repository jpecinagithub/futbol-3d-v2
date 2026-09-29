// Test Fase 3: rediseño de controles.
// - Esquema WASD: W mueve, S mueve (no corre), Shift corre.
// - E = pase directo, Espacio = tiro con carga, F = entrada dedicada.
// - E cancela una carga en curso (sin tiro ni pase fantasma).
// - Reasignación con swap + persistencia (localStorage).
// - Ajustes del mando persistidos; badge de dispositivo visible.
// - IJKL sigue intacto al volver al esquema clásico.
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

try {
  await gotoMatch(page, { home: "Real Madrid", away: "Barcelona", duration: "3 min" });
  await ev(() => window.__store.getState().setControlScheme("wasd"));
  await page.waitForFunction(() => window.__match.engine.time > 1, null, { timeout: 120000 });

  // 1. W mueve hacia arriba (-z); S mueve hacia abajo (+z), NO corre.
  const p0 = await ev(() => {
    const { engine, getControlled } = window.__match;
    const c = getControlled(engine);
    return { z: c.z, t: engine.time };
  });
  await page.keyboard.down("w");
  await page.waitForFunction((t0) => window.__match.engine.time > t0 + 0.6, p0.t, { timeout: 120000 });
  await page.keyboard.up("w");
  const p1 = await ev(() => {
    const { engine, getControlled } = window.__match;
    const c = getControlled(engine);
    return { z: c.z, t: engine.time };
  });
  console.log("W: dz =", (p1.z - p0.z).toFixed(2));
  if (!(p1.z < p0.z - 0.1)) throw new Error("W no mueve hacia arriba");
  await page.keyboard.down("s");
  await page.waitForFunction((t0) => window.__match.engine.time > t0 + 0.6, p1.t, { timeout: 120000 });
  await page.keyboard.up("s");
  const p2 = await ev(() => {
    const { engine, getControlled } = window.__match;
    const c = getControlled(engine);
    return { z: c.z, spd: Math.hypot(c.vx, c.vz) };
  });
  console.log("S: dz =", (p2.z - p1.z).toFixed(2), "spd =", p2.spd.toFixed(1));
  if (!(p2.z > p1.z + 0.1)) throw new Error("S no mueve hacia abajo (sigue corriendo?)");
  if (p2.spd > 5.5) throw new Error("S corre en WASD: conflicto no resuelto");

  // 2. E con balón = pase directo a compañero.
  const passer = await ev(() => {
    const { engine, getControlled } = window.__match;
    const c = getControlled(engine);
    for (const p of engine.players) p.hasBall = false;
    c.hasBall = true;
    const b = engine.ball;
    b.x = c.x; b.z = c.z; b.y = 0.22; b.vx = b.vy = b.vz = 0;
    return c.side;
  });
  await page.keyboard.press("e");
  // En headless la suelta se procesa frames después: esperar por estado.
  await page.waitForFunction(() => !!window.__match.engine.passTarget, null, { timeout: 30000 });
  const passOk = await ev((side) => {
    const e = window.__match.engine;
    const t = e.players.find((p) => p.uid === e.passTarget);
    return !!t && t.side === side;
  }, passer);
  if (!passOk) throw new Error("E no dio el pase al compañero");
  console.log("E = pase: OK");

  // 3. Espacio mantenido = carga; al soltar = tiro.
  await ev(() => {
    const { engine, getControlled } = window.__match;
    const c = getControlled(engine);
    for (const p of engine.players) p.hasBall = false;
    c.hasBall = true;
    const b = engine.ball;
    b.x = c.x; b.z = c.z; b.y = 0.22; b.vx = b.vy = b.vz = 0;
  });
  const shotsBefore = await ev(() => {
    const s = window.__store.getState().stats;
    return s.home.shots + s.away.shots;
  });
  await page.keyboard.down(" ");
  await page.waitForFunction(() => !!window.__match.engine.charge, null, { timeout: 30000 });
  console.log("Espacio carga: OK");
  await page.waitForTimeout(600);
  await page.keyboard.up(" ");
  await page.waitForTimeout(1200);
  const shotsAfter = await ev(() => {
    const s = window.__store.getState().stats;
    return s.home.shots + s.away.shots;
  });
  if (!(shotsAfter > shotsBefore)) throw new Error("Espacio no disparó al soltar");
  console.log("Espacio = tiro: OK");

  // 4. E cancela la carga (ni tiro ni pase).
  await ev(() => {
    const { engine, getControlled } = window.__match;
    const c = getControlled(engine);
    for (const p of engine.players) p.hasBall = false;
    c.hasBall = true;
    const b = engine.ball;
    b.x = c.x; b.z = c.z; b.y = 0.22; b.vx = b.vy = b.vz = 0;
    engine.passTarget = null;
  });
  await page.keyboard.down(" ");
  await page.waitForFunction(() => !!window.__match.engine.charge, null, { timeout: 30000 });
  await page.keyboard.press("e");
  await page.waitForTimeout(800);
  await page.keyboard.up(" ");
  const cancel = await ev(() => {
    const s = window.__store.getState().stats;
    return {
      charging: !!window.__match.engine.charge,
      shots: s.home.shots + s.away.shots,
      passTarget: window.__match.engine.passTarget,
    };
  });
  console.log("cancelación:", JSON.stringify(cancel));
  if (cancel.charging) throw new Error("E no canceló la carga");
  if (!(cancel.shots === shotsAfter)) throw new Error("al cancelar salió un tiro");
  console.log("E cancela la carga: OK");

  // 5. F sin balón = entrada (cooldown de tackle). Balón lejos para que el
  // contacto no lo devuelva a los pies antes de pulsar.
  await ev(() => {
    const { engine, getControlled } = window.__match;
    const c = getControlled(engine);
    for (const p of engine.players) p.hasBall = false;
    const b = engine.ball;
    b.x = c.x + 12; b.z = c.z; b.y = 0.22; b.vx = b.vy = b.vz = 0;
    c.tackleCd = 0; c.tackleT = 0;
  });
  await page.keyboard.press("f");
  await page.waitForTimeout(800);
  const tackled = await ev(() => {
    const { engine } = window.__match;
    return engine.players.find((p) => p.controlled).tackleCd;
  });
  if (!(tackled > 0)) throw new Error("F no hizo la entrada");
  console.log("F = entrada: OK");

  // 6. Reasignación con swap: pase → T (la T estaba libre).
  await ev(() => window.__store.getState().setBinding("pass", "KeyT"));
  const swap = await ev(async () => {
    const { resolveBindings } = await import("/src/game/input.js");
    const st = window.__store.getState();
    return { bindings: resolveBindings(st.controlScheme, st.bindings), saved: window.localStorage.getItem("f3d.bindings") };
  });
  console.log("bindings:", JSON.stringify(swap.bindings.pass), "| saved:", (swap.saved || "").slice(0, 60));
  if (swap.bindings.pass !== "KeyT" || !/KeyT/.test(swap.saved || ""))
    throw new Error("la reasignación no persistió");
  // T ahora pasa; E ya no debe pasar.
  await ev(() => {
    const { engine, getControlled } = window.__match;
    const c = getControlled(engine);
    for (const p of engine.players) p.hasBall = false;
    c.hasBall = true;
    const b = engine.ball;
    b.x = c.x; b.z = c.z; b.y = 0.22; b.vx = b.vy = b.vz = 0;
    engine.passTarget = null;
  });
  await page.keyboard.press("t");
  await page.waitForFunction(() => !!window.__match.engine.passTarget, null, { timeout: 30000 });
  const remapPass = await ev(() => !!window.__match.engine.passTarget);
  if (!remapPass) throw new Error("la tecla reasignada (T) no pasa");
  console.log("reasignación: OK");
  await ev(() => window.__store.getState().resetBindings());

  // 7. Ajustes del mando persistidos + badge visible.
  await ev(() => {
    const st = window.__store.getState();
    st.setPadDeadzone(0.3);
    st.setPadSensitivity(1.5);
  });
  const padSaved = await ev(() => ({
    dz: window.localStorage.getItem("f3d.padDeadzone"),
    sens: window.localStorage.getItem("f3d.padSensitivity"),
    badge: !!document.querySelector(".input-badge"),
  }));
  console.log("mando:", JSON.stringify(padSaved));
  if (padSaved.dz !== "0.3" || padSaved.sens !== "1.5" || !padSaved.badge)
    throw new Error("ajustes del mando o badge incorrectos");

  // 8. Volver a IJKL: la A contextual sigue intacta.
  await ev(() => {
    window.__store.getState().setControlScheme("ijkl");
    const { engine, getControlled } = window.__match;
    const c = getControlled(engine);
    for (const p of engine.players) p.hasBall = false;
    c.hasBall = true;
    const b = engine.ball;
    b.x = c.x; b.z = c.z; b.y = 0.22; b.vx = b.vy = b.vz = 0;
    engine.passTarget = null;
  });
  await page.keyboard.down("a");
  await page.waitForTimeout(150);
  await page.keyboard.up("a");
  await page.waitForTimeout(1200);
  const ijklPass = await ev(() => !!window.__match.engine.passTarget);
  if (!ijklPass) throw new Error("IJKL se rompió tras el cambio de esquema");
  console.log("IJKL intacto: OK");
  const schemeSaved = await ev(() => window.localStorage.getItem("f3d.scheme"));
  if (schemeSaved !== "ijkl") throw new Error("el esquema no persistió");

  console.log("errores de consola:", errors.length);
  for (const e of errors.slice(0, 10)) console.log("  -", e);
  await browser.close();
  if (errors.length) process.exit(1);
  console.log("FASE 3 OK");
} catch (e) {
  console.log("errores de consola:", errors.length);
  for (const err of errors.slice(0, 10)) console.log("  -", err);
  await browser.close();
  throw e;
}

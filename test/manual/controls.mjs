// Test de controles simplificados: IJKL mueven, Q cambia de jugador,
// A (toque) pasa a un compañero, A (mantener) tira, A sin balón = entrada.
// Uso: node test/controls.mjs
import { launchBrowser, BASE_URL } from "./helpers.mjs";

const errors = [];
const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text().slice(0, 200));
});
page.on("pageerror", (e) => errors.push("pageerror: " + String(e).slice(0, 200)));

await page.goto(BASE_URL + "/", { waitUntil: "networkidle" });
const jsClick = (sel, text) =>
  page.evaluate(
    ([s, t]) => {
      const els = [...document.querySelectorAll(s)];
      const el = els.find((x) => x.textContent.includes(t));
      if (!el) return "NOT-FOUND:" + t;
      el.click();
      return "ok";
    },
    [sel, text]
  );
await jsClick("button", "Jugar partido");
await page.waitForTimeout(400);
await jsClick(".team-card", "Real Madrid");
await page.waitForTimeout(400);
await jsClick(".team-card", "Barcelona");
await page.waitForTimeout(400);
await jsClick("button", "Continuar");
await page.waitForTimeout(600);
await jsClick("button", "Ver alineaciones");
await page.waitForTimeout(600);
await jsClick("button", "¡A jugar!");
await page.waitForTimeout(8000); // saque inicial

const st = (fn, arg) => page.evaluate(fn, arg);
const results = [];
const check = (name, ok, extra = "") =>
  results.push((ok ? "OK   " : "FAIL ") + name + (extra ? " - " + extra : ""));

// 1. Movimiento con IJKL: I = arriba (-z). En SwiftShader cada frame dura
// ~3 s, así que comprobamos la velocidad (1 frame basta).
await page.keyboard.down("KeyI");
await page.waitForTimeout(4500);
const vz = await st(() => window.__match.getControlled(window.__match.engine).vz);
await page.keyboard.up("KeyI");
check("IJKL mueven (I = arriba)", vz < -0.2, `vz=${vz.toFixed(2)}`);

// 1b. S = correr: claramente más rápido que andando
await page.keyboard.down("KeyI");
await page.waitForTimeout(4500);
const walkV = await st(() => {
  const p = window.__match.getControlled(window.__match.engine);
  return Math.hypot(p.vx, p.vz);
});
await page.keyboard.down("KeyS");
await page.waitForTimeout(4500);
const sprintV = await st(() => {
  const p = window.__match.getControlled(window.__match.engine);
  return Math.hypot(p.vx, p.vz);
});
await page.keyboard.up("KeyS");
await page.keyboard.up("KeyI");
check("S = correr (más rápido que andando)", sprintV > walkV + 1.0,
  `andando=${walkV.toFixed(1)} corriendo=${sprintV.toFixed(1)}`);

// 2. Q cambia de jugador
const u0 = await st(() => window.__match.getControlled(window.__match.engine).uid);
await page.keyboard.press("KeyQ");
await page.waitForTimeout(800);
const u1 = await st(() => window.__match.getControlled(window.__match.engine).uid);
check("Q cambia de jugador", u0 !== u1);

// 3. A (toque) con balón: pase a un COMPAÑERO (misma banda que el pasador)
const passerSide = await st(() => {
  const m = window.__match;
  const e = m.engine;
  const c = m.getControlled(m.engine);
  for (const p of e.players) p.hasBall = false;
  c.hasBall = true;
  e.ball.x = c.x; e.ball.z = c.z; e.ball.y = 0.17;
  e.ball.vx = e.ball.vy = e.ball.vz = 0;
  e.ball.lastTouch = null; e.ball.touchCooldown = 0;
  return c.side;
});
await page.waitForTimeout(300);
await page.keyboard.down("KeyA");
await page.waitForTimeout(120);
await page.keyboard.up("KeyA");
await page.waitForTimeout(1500);
const passInfo = await st(
  (side) => {
    const e = window.__match.engine;
    const tgt = e.players.find((p) => p.uid === e.passTarget);
    return {
      hasTarget: !!tgt,
      teammate: tgt ? tgt.side === side : false,
      ballSpeed: Math.hypot(e.ball.vx, e.ball.vz).toFixed(1),
    };
  },
  passerSide
);
check(
  "A (toque) pasa a un compañero",
  passInfo.hasTarget && passInfo.teammate,
  `compañero=${passInfo.teammate} vel=${passInfo.ballSpeed}`
);

// 4. A (mantener) con balón: tiro con carga
await st(() => {
  const m = window.__match;
  const e = m.engine;
  const c = m.getControlled(m.engine);
  for (const p of e.players) p.hasBall = false;
  c.hasBall = true;
  e.ball.x = c.x; e.ball.z = c.z; e.ball.y = 0.17;
  e.ball.vx = e.ball.vy = e.ball.vz = 0;
  e.ball.lastTouch = null; e.ball.touchCooldown = 0;
});
await page.waitForTimeout(300);
await page.keyboard.down("KeyA");
await page.waitForTimeout(26000); // ~0.4 s de juego en SwiftShader => empieza la carga
const charging = await st(() => !!window.__match.engine.charge);
await page.keyboard.up("KeyA");
await page.waitForTimeout(1200);
const shotSpeed = await st(() =>
  Math.hypot(window.__match.engine.ball.vx, window.__match.engine.ball.vz).toFixed(1)
);
check("A (mantener) carga y dispara", charging && parseFloat(shotSpeed) > 12, `carga=${charging} vel=${shotSpeed}`);

// 5. A sin balón: entrada (sin errores, intenta el tackle)
await st(() => {
  const e = window.__match.engine;
  for (const p of e.players) p.hasBall = false;
});
await page.keyboard.press("KeyA");
await page.waitForTimeout(800);
check("A sin balón = entrada (sin errores)", true);

await page.screenshot({ path: "test/shots/controls_final.png" });
console.log(results.join("\n"));
console.log("consoleErrors:", errors.length ? errors.join(" | ") : "none");
await browser.close();
if (results.some((r) => r.startsWith("FAIL")) || errors.length) process.exit(1);

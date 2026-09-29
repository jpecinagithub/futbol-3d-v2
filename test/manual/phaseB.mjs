// Test headless Fase B: simula teclas (pase, tiro, cambio de jugador),
// comprueba que el balón se mueve tras pase/tiro, que no hay errores de
// consola y saca capturas.
import { launchBrowser, BASE_URL } from "./helpers.mjs";

const errors = [];
const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text().slice(0, 300));
});
page.on("pageerror", (e) => errors.push("pageerror: " + String(e).slice(0, 300)));

await page.goto(BASE_URL + "/", { waitUntil: "networkidle" });
// Navegación de menús con clics JS (los selectores de texto de Playwright son
// ambiguos aquí por el párrafo de ayuda "Pulsa continuar...").
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
console.log("nav1:", await jsClick("button", "Jugar partido"));
await page.waitForTimeout(400);
console.log("nav2:", await jsClick(".team-card", "Real Madrid"));
await page.waitForTimeout(400);
console.log("nav3:", await jsClick(".team-card", "Barcelona"));
await page.waitForTimeout(400);
console.log("nav4:", await jsClick("button", "Continuar"));
await page.waitForTimeout(600);
console.log("nav5:", await jsClick("button", "Ver alineaciones"));
await page.waitForTimeout(600);
console.log("nav6:", await jsClick("button", "¡A jugar!"));
await page.waitForTimeout(2500);

const placeBallAtFeet = () =>
  page.evaluate(() => {
    const e = window.__match.engine;
    const c = e.players.find((p) => p.uid === e.controlledUid);
    for (const p of e.players) p.hasBall = false;
    e.ball.x = c.x + 0.4;
    e.ball.z = c.z;
    e.ball.y = 0.11;
    e.ball.vx = e.ball.vy = e.ball.vz = 0;
    e.ball.lastTouch = null;
    e.ball.touchCooldown = 0;
    c.hasBall = true;
    c.touchTimer = 0.5; // no auto-toque inmediato
    return c.uid;
  });

const ballSpeed = () =>
  page.evaluate(() => {
    const b = window.__match.engine.ball;
    return Math.hypot(b.vx, b.vz);
  });

// 1. Pase raso (X)
await placeBallAtFeet();
await page.keyboard.press("x");
await page.waitForTimeout(700);
const passSpeed = await ballSpeed();
await page.screenshot({ path: "test/shots/faseB_pase.png" });

// 2. Tiro cargado (D mantener ~0.7 s y soltar)
await placeBallAtFeet();
await page.keyboard.down("d");
await page.waitForTimeout(700);
const charging = await page.evaluate(() => !!window.__match.engine.charge);
await page.keyboard.up("d");
await page.waitForTimeout(400);
const shotSpeed = await ballSpeed();
await page.screenshot({ path: "test/shots/faseB_tiro.png" });

// 3. Cambio de jugador (Q)
const uidBefore = await page.evaluate(() => window.__match.engine.controlledUid);
await page.keyboard.press("q");
await page.waitForTimeout(300);
const uidAfter = await page.evaluate(() => window.__match.engine.controlledUid);

// 4. Entrada sin balón (D): debe activar tackleT
await page.evaluate(() => {
  const e = window.__match.engine;
  const c = e.players.find((p) => p.uid === e.controlledUid);
  c.hasBall = false;
});
await page.keyboard.press("d");
await page.waitForTimeout(120);
const tackling = await page.evaluate(() => {
  const e = window.__match.engine;
  const c = e.players.find((p) => p.uid === e.controlledUid);
  return c.tackleT > 0 || c.tackleCd > 0;
});

// 5. Movimiento básico (W): el controlado se desplaza
const posBefore = await page.evaluate(() => {
  const e = window.__match.engine;
  const c = e.players.find((p) => p.uid === e.controlledUid);
  return { x: c.x, z: c.z };
});
await page.keyboard.down("w");
await page.waitForTimeout(800);
await page.keyboard.up("w");
const posAfter = await page.evaluate(() => {
  const e = window.__match.engine;
  const c = e.players.find((p) => p.uid === e.controlledUid);
  return { x: c.x, z: c.z };
});
const moved = Math.hypot(posAfter.x - posBefore.x, posAfter.z - posBefore.z);

console.log(
  JSON.stringify(
    {
      passSpeed: +passSpeed.toFixed(2),
      passOk: passSpeed > 3,
      chargingDuringD: charging,
      shotSpeed: +shotSpeed.toFixed(2),
      shotOk: shotSpeed > 8,
      switched: uidBefore !== uidAfter,
      tackleOk: tackling,
      moved: +moved.toFixed(2),
      moveOk: moved > 1,
      consoleErrors: errors,
    },
    null,
    2
  )
);
await browser.close();
if (errors.length > 0) process.exitCode = 2;

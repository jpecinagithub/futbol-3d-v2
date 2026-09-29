// Test Fase 5: dificultad.
// - Selector en el cartel (Fácil/Normal/Difícil) + persistencia.
// - El motor sincroniza la dificultad; el rival escala, tu equipo no.
// - Sin trampas: misma maxSpeed en todos los niveles.
// - Simulación de ~45 s por nivel sin errores (partidos en cada dificultad).
import { launchBrowser, BASE_URL, jsClick } from "./helpers.mjs";

const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + String(e).slice(0, 220)));
page.on("console", (m) => {
  if (m.type() === "error") errors.push("console: " + m.text().slice(0, 220));
});
const ev = (fn, arg) => page.evaluate(fn, arg);

try {
  // 1. Selector en el cartel + persistencia.
  await page.goto(BASE_URL + "/", { waitUntil: "networkidle" });
  await jsClick(page, "button", "Jugar partido");
  await page.waitForTimeout(300);
  await jsClick(page, ".team-card", "Real Madrid");
  await page.waitForTimeout(300);
  await jsClick(page, ".team-card", "Barcelona");
  await page.waitForTimeout(300);
  await jsClick(page, "button", "Continuar");
  await page.waitForTimeout(400);
  const hasDiff = await ev(() => document.body.textContent.includes("Dificultad"));
  if (!hasDiff) throw new Error("sin selector de dificultad en el cartel");
  await jsClick(page, ".duration-row button", "Difícil");
  await page.waitForTimeout(300);
  const saved = await ev(() => window.localStorage.getItem("f3d.difficulty"));
  if (saved !== "hard") throw new Error("la dificultad no persistió: " + saved);
  console.log("selector + persistencia: OK");
  await jsClick(page, ".duration-btn", "3 min");
  await page.waitForTimeout(200);
  await jsClick(page, "button", "Ver alineaciones");
  await page.waitForTimeout(400);
  await jsClick(page, "button", "¡A jugar!");
  await page.waitForFunction(() => window.__match?.phase === "playing", null, { timeout: 30000 });

  // 2. Tabla de params + rivalidad + sin trampas físicas.
  const wiring = await ev(async () => {
    const { DIFF, paramsFor, userSideOf } = await import("/src/game/difficulty.js");
    const { engine } = window.__match;
    const out = { table: DIFF.easy.hz < DIFF.normal.hz && DIFF.normal.hz < DIFF.hard.hz };
    for (const d of ["easy", "normal", "hard"]) {
      engine.difficulty = d;
      const away = paramsFor(engine, "away");
      const home = paramsFor(engine, "home");
      out[d] = {
        userSide: userSideOf(engine),
        rivalHz: away.hz,
        ownHz: home.hz,
        rivalPress: away.pressSpeed,
      };
    }
    const spds = {};
    for (const p of engine.players) spds[p.uid] = p.maxSpeed;
    await new Promise((r) => setTimeout(r, 500));
    engine.difficulty = "easy";
    await new Promise((r) => setTimeout(r, 500));
    out.sameSpeed = engine.players.every((p) => spds[p.uid] === p.maxSpeed);
    return out;
  });
  console.log("wiring:", JSON.stringify(wiring));
  if (!wiring.table) throw new Error("tabla de dificultad incoherente");
  if (!(wiring.easy.rivalHz === 6 && wiring.normal.rivalHz === 12 && wiring.hard.rivalHz === 18))
    throw new Error("el rival no escala en Hz");
  if (!(wiring.hard.ownHz === 12 && wiring.easy.ownHz === 12))
    throw new Error("tu equipo no debería escalar");
  if (!wiring.sameSpeed) throw new Error("TRAMPA: cambió la velocidad física");
  console.log("rival escala / tu equipo no / sin trampas: OK");

  // 3. Simulación por nivel (partidos en cada dificultad, item 50).
  for (const d of ["easy", "normal", "hard"]) {
    const sim = await ev(async (diff) => {
      const { engine, stepEngine } = window.__match;
      engine.difficulty = diff;
      const DT = 1 / 60;
      const t0 = engine.matchTime;
      const evts = { onGoal: () => {} };
      let steps = 0;
      for (let i = 0; i < 2700 && engine.matchTime < t0 + 45; i++) {
        stepEngine(engine, DT, { x: 0, z: 0 }, evts);
        steps++;
      }
      const st = window.__store.getState();
      return {
        d: diff,
        simS: +(engine.matchTime - t0).toFixed(0),
        steps,
        phase: st.phase,
        engineDiff: engine.difficulty,
      };
    }, d);
    console.log("sim:", JSON.stringify(sim));
    if (!(sim.simS >= 44)) throw new Error(`el reloj no avanzó en ${d}`);
  }

  // 4. La pausa también cambia la dificultad en mitad del partido.
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !!document.querySelector(".overlay h2"), null, { timeout: 8000 });
  await jsClick(page, ".subs-teams button", "Fácil");
  await page.waitForTimeout(300);
  const mid = await ev(() => window.__store.getState().difficulty);
  if (mid !== "easy") throw new Error("la pausa no cambió la dificultad");
  console.log("cambio en pausa: OK");

  console.log("errores de consola:", errors.length);
  for (const e of errors.slice(0, 10)) console.log("  -", e);
  await browser.close();
  if (errors.length) process.exit(1);
  console.log("FASE 5 OK");
} catch (e) {
  console.log("errores de consola:", errors.length);
  for (const err of errors.slice(0, 10)) console.log("  -", err);
  await browser.close();
  throw e;
}

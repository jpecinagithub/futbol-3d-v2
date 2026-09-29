// Test Fase 9: interfaz y calidad de vida.
// - Pantalla Opciones desde el menú (persiste cámara/radar/sonido/graficos).
// - Gráficos: calidad + sombras + 30 FPS se aplican sin romper el partido.
// - Reinicio limpio con confirmación; salir con confirmación.
// - Historial: falta + gol listados.
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
  // 1. Menú → Opciones → cambiar gráficos (persiste).
  await page.goto(BASE_URL + "/", { waitUntil: "networkidle" });
  await jsClick(page, "button", "Opciones");
  await page.waitForTimeout(500);
  const optsOk = await ev(() => document.body.textContent.includes("GRÁFICOS"));
  if (!optsOk) throw new Error("sin pantalla de opciones");
  await jsClick(page, ".options-sheet button", "Baja");
  await page.waitForTimeout(300);
  // Sombras: clic en el botón de SU fila (hay varios "No" en el panel).
  await ev(() => {
    const row = [...document.querySelectorAll(".options-sheet .controls-row")]
      .find((r) => (r.textContent || "").includes("Sombras"));
    row?.querySelector("button")?.click();
  });
  await page.waitForTimeout(300);
  const gfx = await ev(() => ({
    // En menú no hay motor montado: se verifica persistencia + botón activo.
    lsq: window.localStorage.getItem("f3d.gfx"),
    lss: window.localStorage.getItem("f3d.shadows"),
    active: [...document.querySelectorAll(".options-sheet .duration-btn.active")].map((b) => b.textContent),
  }));
  console.log("gráficos:", JSON.stringify(gfx));
  if (!(gfx.lsq === "baja" && gfx.lss === "0" && gfx.active.includes("Baja")))
    throw new Error("los gráficos no persisten");
  // FPS a 30 también persiste.
  await jsClick(page, ".options-sheet button", "30");
  await page.waitForTimeout(300);
  const fps = await ev(() => window.localStorage.getItem("f3d.fps"));
  if (fps !== "30") throw new Error("el límite FPS no persistió");
  await jsClick(page, "button", "Atrás");
  await page.waitForTimeout(400);
  console.log("opciones: OK");
  await page.screenshot({ path: "test/shots/fase9_opciones.png" });

  // 2. El partido arranca con esos gráficos (Canvas vivo, reloj avanza).
  await gotoMatch(page, { home: "Real Madrid", away: "Barcelona", duration: "3 min" });
  const t0 = await ev(() => window.__match.engine.time);
  await page.waitForFunction((a) => window.__match.engine.time > a + 0.5, t0, { timeout: 120000 });
  const canvasOk = await ev(() => !!document.querySelector("canvas"));
  if (!canvasOk) throw new Error("el Canvas no sobrevivió a los gráficos");
  console.log("partido con gráficos bajos + 30 FPS: OK");

  // 3. Falta provocada + gol para el historial.
  await ev(async () => {
    const { engine } = window.__match;
    const { registerFoul } = await import("/src/game/fouls.js");
    engine.__foulHook = { whistle: true };
    const by = engine.players.find((p) => p.side === "away" && p.role !== "GK");
    const victim = engine.players.find((p) => p.side === "home" && p.role !== "GK" && !p.controlled);
    registerFoul(engine, { by, victim, touchedBallFirst: false, intensity: 1 });
    engine.__foulHook = null;
  });
  await ev(async () => {
    const { kickoff } = await import("/src/game/engine.js");
    kickoff(window.__match.engine);
    window.__match.provokeGoal("home");
  });
  await page.waitForFunction(() => window.__match?.phase === "goal", null, { timeout: 30000 });
  await page.waitForFunction(() => window.__match?.phase === "replay", null, { timeout: 30000 });
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => window.__match?.phase === "playing", null, { timeout: 60000 });
  const score = await ev(() => document.querySelector(".scoreboard .goals").textContent.trim());
  if (!score.includes("1")) throw new Error("el gol no subió: " + score);

  // 4. Pausa → Historial lista falta y gol.
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !!document.querySelector(".overlay h2"), null, { timeout: 8000 });
  await jsClick(page, ".pause-tabs button", "Historial");
  await page.waitForTimeout(500);
  const hist = await ev(() => document.querySelector(".overlay")?.textContent.replace(/\s+/g, " ").slice(0, 200));
  console.log("historial:", hist);
  if (!/Falta/.test(hist || "") || !/Gol/.test(hist || "")) throw new Error("historial incompleto");
  await page.screenshot({ path: "test/shots/fase9_historial.png" });

  // 5. Reiniciar con confirmación: pide 2 clics y deja 0-0 en playing.
  await jsClick(page, ".pause-tabs button", "Controles"); // (cambia de pestaña, sin efecto)
  await jsClick(page, ".overlay button", "Reiniciar");
  await page.waitForTimeout(400);
  const armed = await ev(() => document.querySelector(".overlay")?.textContent.includes("¿Reiniciar"));
  if (!armed) throw new Error("reiniciar no pidió confirmación");
  // Un clic no basta: sigue en pausa con el marcador intacto.
  const stillPause = await ev(() => window.__store.getState().phase);
  if (stillPause !== "paused") throw new Error("reinició sin confirmar");
  await jsClick(page, ".overlay button", "¿Reiniciar");
  await page.waitForTimeout(2500);
  const reset = await ev(() => ({
    phase: window.__match?.phase,
    score: document.querySelector(".scoreboard .goals")?.textContent.trim(),
  }));
  console.log("tras reinicio:", JSON.stringify(reset));
  if (!(reset.phase === "playing" && /0\s*-\s*0/.test(reset.score || "")))
    throw new Error("reinicio no limpio");

  // 6. Salir con confirmación: 1 clic no saca, 2 sí.
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !!document.querySelector(".overlay h2"), null, { timeout: 8000 });
  await jsClick(page, ".overlay button", "Salir al menú");
  await page.waitForTimeout(400);
  const stillIn = await ev(() => window.__store.getState().phase);
  if (stillIn !== "paused") throw new Error("salió sin confirmar");
  await jsClick(page, ".overlay button", "¿Abandonar?");
  await page.waitForFunction(
    () => [...document.querySelectorAll("button")].some((b) => b.textContent.includes("Jugar partido")),
    null, { timeout: 8000 }
  );
  console.log("salida confirmada: OK");

  console.log("errores de consola:", errors.length);
  for (const e of errors.slice(0, 10)) console.log("  -", e);
  await browser.close();
  if (errors.length) process.exit(1);
  console.log("FASE 9 OK");
} catch (e) {
  console.log("errores de consola:", errors.length);
  for (const err of errors.slice(0, 10)) console.log("  -", err);
  await browser.close();
  throw e;
}

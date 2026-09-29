// Test Fase 2: repeticiones y presentación.
// - El buffer retiene metraje suficiente y la ventana es de 7 s (6–8 s).
// - La repetición muestra scrub, se pausa con Espacio y se navega con ←/→.
// - Tab, Z y Esc NO la saltan; Enter sí (tecla dedicada).
// - Al saltar: kickoff limpio (balón al centro) sin acciones fantasma
//   (flush de entrada) y vídeo .webm publicado para descargar.
// - 0 errores de consola.
import { launchBrowser, gotoMatch } from "./helpers.mjs";

const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + String(e).slice(0, 220)));
page.on("console", (m) => {
  if (m.type() === "error") errors.push("console: " + m.text().slice(0, 220));
});

try {
  await gotoMatch(page, { home: "Real Madrid", away: "Barcelona", duration: "3 min" });

  // 1. Llenar el buffer a nivel de motor (6 s de simulación) y comprobar
  //    que la ventana de metraje es de 7 s.
  const windowCheck = await page.evaluate(async () => {
    const { engine, stepEngine } = window.__match;
    const { recordTick, getReplayWindow, REPLAY_HZ, REPLAY_WINDOW_S } =
      await import("/src/replay/goalReplay.js");
    const DT = 1 / 60;
    const input = { x: 0, z: 0 };
    const ev = { onGoal: () => {} };
    for (let i = 0; i < 360; i++) {
      stepEngine(engine, DT, input, ev);
      recordTick(engine);
    }
    return {
      bufferedS: +(engine.replayBuf.frames.length / REPLAY_HZ).toFixed(1),
      windowS: +((await import("/src/replay/goalReplay.js")).REPLAY_WINDOW_S ?? 0) || REPLAY_WINDOW_S,
      windowFrames: getReplayWindow(engine).length,
      HZ: REPLAY_HZ,
    };
  });
  console.log("ventana de metraje:", JSON.stringify(windowCheck));
  if (windowCheck.windowS < 6 || windowCheck.windowS > 8)
    throw new Error("la ventana no es de 6–8 s");
  if (windowCheck.windowFrames < windowCheck.HZ * 6)
    throw new Error("metraje insuficiente en la ventana");

  // 2. Gol → repetición con scrub.
  await page.evaluate(() => window.__match.provokeGoal("home"));
  await page.waitForFunction(() => !!document.querySelector(".replay-label"), null, {
    timeout: 30000, polling: 200,
  });
  await page.waitForFunction(() => !!document.querySelector(".replay-scrub"), null, { timeout: 15000 });
  console.log("repetición + scrub: OK");
  const hint = await page.evaluate(() =>
    document.querySelector(".replay-hint")?.textContent.replace(/\s+/g, " ").slice(0, 80)
  );
  console.log("ayuda del replay:", hint);
  if (!/Enter/.test(hint || "")) throw new Error("la ayuda no indica la tecla dedicada");

  // 3. Espacio pausa / reanuda.
  await page.keyboard.press("Space");
  await page.waitForFunction(
    () => document.querySelector(".replay-scrub-label")?.textContent.includes("PAUSA"),
    null, { timeout: 15000 }
  );
  console.log("pausa: OK");
  await page.screenshot({ path: "test/shots/fase2_pausa.png" });
  await page.keyboard.press("Space");
  await page.waitForFunction(
    () => !document.querySelector(".replay-scrub-label")?.textContent.includes("PAUSA"),
    null, { timeout: 15000 }
  );
  console.log("reanudar: OK");

  // 4. ←/→ navegan sin romper (sigue en replay).
  await page.keyboard.press("ArrowLeft");
  await page.waitForTimeout(800);
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(800);
  const stillReplay = await page.evaluate(() => window.__match?.phase);
  if (stillReplay !== "replay") throw new Error("navegar rompió la repetición");
  console.log("navegación ←/→: OK");

  // 5. Tab, Z y Esc NO saltan la repetición.
  for (const k of ["Tab", "z", "Escape"]) {
    await page.keyboard.press(k);
    await page.waitForTimeout(800);
    const ph = await page.evaluate(() => window.__match?.phase);
    if (ph !== "replay") throw new Error(`la tecla ${k} cerró la repetición`);
  }
  console.log("Tab/Z/Esc no saltan: OK");
  await page.screenshot({ path: "test/shots/fase2_replay.png" });

  // 6. Enter salta → kickoff limpio al centro, sin acciones fantasma.
  const flushOk = await page.evaluate(() => typeof window.__match.engine.flushInput === "function");
  if (!flushOk) throw new Error("falta flushInput en el motor");
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => window.__match?.phase === "playing", null, { timeout: 60000 });
  const after = await page.evaluate(() => {
    const { engine } = window.__match;
    return {
      ballX: +engine.ball.x.toFixed(2),
      ballZ: +engine.ball.z.toFixed(2),
      score: document.querySelector(".scoreboard .goals").textContent.trim(),
    };
  });
  console.log("tras salto:", JSON.stringify(after));
  if (Math.abs(after.ballX) > 3 || Math.abs(after.ballZ) > 3)
    throw new Error("el saque de centro no quedó limpio");
  if (!after.score.includes("1")) throw new Error("el gol no subió al marcador");

  // 7. Vídeo .webm publicado y botón de descarga visible.
  await page.waitForFunction(() => !!window.__store.getState().replayVideo, null, { timeout: 30000 });
  const dlVisible = await page.evaluate(() => {
    const b = document.querySelector(".replay-download");
    if (!b) return false;
    const r = b.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  });
  if (!dlVisible) throw new Error("botón de descarga no visible");
  console.log("descarga .webm: OK");

  console.log("errores de consola:", errors.length);
  for (const e of errors.slice(0, 10)) console.log("  -", e);
  await browser.close();
  if (errors.length) process.exit(1);
  console.log("FASE 2 OK");
} catch (e) {
  console.log("errores de consola:", errors.length);
  for (const err of errors.slice(0, 10)) console.log("  -", err);
  await browser.close();
  throw e;
}

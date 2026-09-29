// Test Fase 7: sonido y ambiente.
// - Volúmenes por categoría (store + persistencia + panel Sonido en pausa).
// - Todas las funciones de audio existen y no lanzan (headless con WebAudio).
// - Madera: flag de la física al dar al poste.
// - Grada reactiva: ocasión en el área marca crowdCd.
// - 0 errores de consola.
import { launchBrowser, gotoMatch, jsClick } from "./helpers.mjs";

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

  // 1. Todas las funciones de audio, sin lanzar.
  const audio = await ev(async () => {
    const a = await import("/src/audio/audioEngine.js");
    const need = ["startCrowd", "stopCrowd", "setCrowdLevel", "whistle", "playWhistle",
      "goalCheer", "thump", "playKick", "playPass", "playTackle", "playBounce",
      "playNet", "playWoodwork", "playCrowdGoal", "crowdOoh", "crowdBoo",
      "setCrowdExcitement", "setVolumes", "getVolumes", "uiClick"];
    const missing = need.filter((f) => typeof a[f] !== "function");
    a.setVolumes({ crowd: 0.8, fx: 0.9, ui: 0.9 });
    a.playPass(0.5); a.playKick(0.6); a.playTackle(); a.playBounce(2);
    a.playNet(); a.playWoodwork(0.7); a.crowdOoh(); a.crowdBoo();
    a.playCrowdGoal("home", false); a.playCrowdGoal("away", true);
    a.playWhistle("inicio"); a.playWhistle("siga"); a.playWhistle("falta");
    a.playWhistle("gol"); a.playWhistle("penalti"); a.uiClick();
    a.setCrowdExcitement(0.5);
    return { missing, vols: a.getVolumes() };
  });
  console.log("audio:", JSON.stringify(audio));
  if (audio.missing.length) throw new Error("faltan funciones: " + audio.missing.join(","));

  // 2. Volúmenes: store + persistencia + panel de pausa.
  await ev(() => {
    const st = window.__store.getState();
    st.setVolume("crowd", 0.5);
    st.setVolume("fx", 0.6);
    st.setVolume("ui", 0.7);
  });
  const vols = await ev(() => ({
    s: { c: window.__store.getState().volCrowd, f: window.__store.getState().volFx, u: window.__store.getState().volUi },
    ls: { c: window.localStorage.getItem("f3d.volCrowd"), f: window.localStorage.getItem("f3d.volFx"), u: window.localStorage.getItem("f3d.volUi") },
  }));
  console.log("volúmenes:", JSON.stringify(vols));
  if (!(vols.s.c === 0.5 && vols.s.f === 0.6 && vols.s.u === 0.7)) throw new Error("store de volúmenes mal");
  if (!(vols.ls.c === "0.5" && vols.ls.f === "0.6" && vols.ls.u === "0.7")) throw new Error("volúmenes no persisten");
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !!document.querySelector(".overlay h2"), null, { timeout: 8000 });
  await jsClick(page, ".pause-tabs button", "Sonido");
  await page.waitForTimeout(500);
  const panel = await ev(() => document.querySelector(".overlay")?.textContent.includes("Ambiente"));
  if (!panel) throw new Error("sin panel de sonido en la pausa");
  console.log("panel Sonido: OK");
  await page.screenshot({ path: "test/shots/fase7_sonido.png" });
  await jsClick(page, ".overlay button", "Continuar");
  await page.waitForTimeout(800);

  // 3. Madera: tiro al poste marca el flag de la física.
  const wood = await ev(async () => {
    const { engine, stepEngine } = window.__match;
    const DT = 1 / 60;
    const b = engine.ball;
    for (const p of engine.players) p.hasBall = false;
    b.x = 48; b.z = 3.66; b.y = 0.22; b.vx = 15; b.vy = 0; b.vz = 0;
    b.lastTouch = null; b.touchCooldown = 0; b.woodwork = 0;
    let hit = 0;
    for (let i = 0; i < 300 && !hit; i++) {
      stepEngine(engine, DT, { x: 0, z: 0 }, {});
      if (b.woodwork > 0) hit = +b.woodwork.toFixed(1);
    }
    return { hit };
  });
  console.log("madera:", JSON.stringify(wood));
  if (!(wood.hit > 2)) throw new Error("el poste no marcó impacto");

  // 4. Ocasión en el área: la grada reacciona (vía real del bucle de partido).
  await ev(async () => {
    const { engine } = window.__match;
    const { kickoff } = await import("/src/game/engine.js");
    kickoff(engine);
    engine.crowdCd = 0;
    const b = engine.ball;
    b.x = 20; b.z = 0; b.y = 0.22; b.vx = 14; b.vy = 0; b.vz = 0;
    b.lastTouch = null;
  });
  await page.waitForFunction(() => window.__match.engine.crowdCd > 0, null, { timeout: 40000, polling: 500 });
  console.log("ocasión en el área → grada: OK");

  console.log("errores de consola:", errors.length);
  for (const e of errors.slice(0, 10)) console.log("  -", e);
  await browser.close();
  if (errors.length) process.exit(1);
  console.log("FASE 7 OK");
} catch (e) {
  console.log("errores de consola:", errors.length);
  for (const err of errors.slice(0, 10)) console.log("  -", err);
  await browser.close();
  throw e;
}

// Verificación visual del tamaño del dorsal tras el fix (escala 0.3x0.36).
// Uso: node test/dorsal.mjs
import { launchBrowser, BASE_URL } from "./helpers.mjs";

const errors = [];
const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 200)); });
page.on("pageerror", (e) => errors.push("pageerror: " + String(e).slice(0, 200)));
await page.goto(BASE_URL + "/", { waitUntil: "networkidle" });
const jsClick = (sel, text) => page.evaluate(([s, t]) => {
  const el = [...document.querySelectorAll(s)].find((x) => x.textContent.includes(t));
  if (!el) return "NOT-FOUND:" + t; el.click(); return "ok";
}, [sel, text]);
await jsClick("button", "Jugar partido"); await page.waitForTimeout(400);
await jsClick(".team-card", "Real Madrid"); await page.waitForTimeout(400);
await jsClick(".team-card", "Barcelona"); await page.waitForTimeout(400);
await jsClick("button", "Continuar"); await page.waitForTimeout(600);
await jsClick("button", "Ver alineaciones"); await page.waitForTimeout(600);
await jsClick("button", "¡A jugar!");
await page.waitForFunction(
  () => { const m = window.__match; return m && m.engine.deadBall && m.engine.deadBall.state === "OPEN_PLAY"; },
  { polling: 200, timeout: 60000 }
);
// Cámara cercana (Z): sigue al jugador controlado por detrás -> se ve la espalda/dorsal
await page.evaluate(() => window.__store.getState().toggleCamera());
const cam = await page.evaluate(() => window.__store.getState().cameraMode);
console.log("cameraMode:", cam);
await page.waitForTimeout(2500);
// Sin pausar (la pausa abre el menú y tapa la escena); SwiftShader va lento de
// todos modos, así que la imagen sale casi quieta.
await page.waitForTimeout(300);
await page.screenshot({ path: "test/shots/dorsal-near.png" });
// Medir en 3D: tamaño del plano del dorsal del jugador controlado
const measure = await page.evaluate(() => {
  const scene = window.__scene3d;
  const out = [];
  scene.traverse((o) => {
    if (o.isMesh && o.geometry && o.geometry.type === "PlaneGeometry" && o.material && o.material.transparent) {
      // Escala mundo = producto de escalas de los ancestros (sin rotaciones no uniformes aquí)
      let sx = 1, sy = 1, n = o;
      while (n) { sx *= n.scale.x; sy *= n.scale.y; n = n.parent; }
      out.push([+sx.toFixed(2), +sy.toFixed(2)]);
    }
  });
  return out.slice(0, 5);
});
console.log("dorsal meshes (worldScale):", JSON.stringify(measure));
// Acercar la cámara detrás del jugador controlado para ver el dorsal
await page.evaluate(() => {
  const m = window.__match; const e = m.engine;
  const p = e.players.find((q) => q.uid === e.controlledUid) || e.players[0];
  window.__CAM_FREEZE = true;
  const cam = window.__camera3d;
  cam.position.set(p.x - 3, 2.2, p.z - 4);
  cam.lookAt(p.x, 1.3, p.z);
});
await page.waitForTimeout(800);
await page.screenshot({ path: "test/shots/dorsal-close.png" });
console.log("console errors:", errors.length, errors.slice(0, 5));
await browser.close();

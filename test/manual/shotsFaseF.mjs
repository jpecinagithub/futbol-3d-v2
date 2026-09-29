// Capturas de verificación Fase F (no es un test de asertos: genera las
// capturas de gameplay real en test/shots/ y falla si hay errores de consola).
// Tomas: alineaciones, partido con HUD, estadísticas (Tab), banner de gol y
// repetición automática (provokeGoal determinista).
import { launchBrowser, BASE_URL } from "./helpers.mjs";

const errors = [];
const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on("pageerror", (e) => errors.push("pageerror: " + String(e).slice(0, 220)));
page.on("console", (m) => {
  if (m.type() === "error") errors.push("console: " + m.text().slice(0, 220));
});
await page.goto(BASE_URL + "/", { waitUntil: "networkidle" });
const jsClick = (sel, text) =>
  page.evaluate(([s, t]) => {
    const el = [...document.querySelectorAll(s)].find((x) => x.textContent.includes(t));
    if (el) el.click();
  }, [sel, text]);

await jsClick("button", "Jugar partido"); await page.waitForTimeout(300);
await jsClick(".team-card", "Real Madrid"); await page.waitForTimeout(300);
await jsClick(".team-card", "Barcelona"); await page.waitForTimeout(300);
await jsClick("button", "Continuar"); await page.waitForTimeout(400);
await jsClick("button", "Ver alineaciones"); await page.waitForTimeout(600);
await page.screenshot({ path: "test/shots/faseF_alineaciones.png" });
console.log("shot: alineaciones");

await jsClick("button", "¡A jugar!");
await page.waitForFunction(() => window.__match?.phase === "playing", null, { timeout: 30000 });
// deja que la jugada avance un poco y mueve al controlado para dar vida
await page.keyboard.down("w"); await page.waitForTimeout(2500); await page.keyboard.up("w");
await page.waitForTimeout(2500);
await page.screenshot({ path: "test/shots/faseF_partido.png" });
console.log("shot: partido con HUD");

await page.keyboard.press("Tab"); await page.waitForTimeout(800);
await page.screenshot({ path: "test/shots/faseF_estadisticas.png" });
console.log("shot: estadísticas");
await page.keyboard.press("Tab"); await page.waitForTimeout(500);

// gol determinista -> banner -> repetición automática
await page.evaluate(() => window.__match.provokeGoal("home"));
await page.waitForFunction(() => window.__match?.phase === "goal", null, { timeout: 30000 });
await page.waitForTimeout(1200);
await page.screenshot({ path: "test/shots/faseF_gol.png" });
console.log("shot: banner de gol");
await page.waitForFunction(() => window.__match?.phase === "replay", null, { timeout: 30000 });
await page.waitForTimeout(2000);
await page.screenshot({ path: "test/shots/faseF_replay.png" });
console.log("shot: repetición");
await page.keyboard.press("Enter");
await page.waitForFunction(() => window.__match?.phase === "playing", null, { timeout: 60000 });
console.log("replay saltada, de vuelta a playing");

console.log("errores de consola:", JSON.stringify(errors));
if (errors.length) throw new Error("hubo errores de consola: " + errors[0]);
console.log("CAPTURAS FASE F: TODO OK");
await browser.close();

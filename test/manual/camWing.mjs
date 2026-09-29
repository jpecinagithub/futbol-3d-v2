// Test de cámara: coloca el balón en (x,z), lo mantiene ahí, espera a que
// la cámara se asiente y captura. Uso:
//   node test/camWing.mjs <salida.png> [x] [z]
import { launchBrowser, BASE_URL } from "./helpers.mjs";

const outName = process.argv[2] || "cam_wing.png";
const BX = parseFloat(process.argv[3] ?? "8");
const BZ = parseFloat(process.argv[4] ?? "30");
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
// Dejar que ocurra el saque inicial (kickoff recoloca el balón al centro)
await page.waitForTimeout(8000);

const place = () =>
  page.evaluate(
    ([bx, bz]) => {
      const e = window.__match.engine;
      for (const p of e.players) p.hasBall = false;
      e.ball.x = bx;
      e.ball.z = bz;
      e.ball.y = 0.17;
      e.ball.vx = e.ball.vy = e.ball.vz = 0;
      e.ball.lastTouch = null;
      e.ball.touchCooldown = 0;
      e.frozen = false;
      return e.ball.x.toFixed(1) + "," + e.ball.z.toFixed(1);
    },
    [BX, BZ]
  );

// Mantener el balón en su sitio mientras la cámara (suavizada con dt de
// juego, lento en SwiftShader: el smoothstep la hace aún más lenta) se
// asienta del todo: bastantes iteraciones.
for (let i = 0; i < 110; i++) {
  await place();
  await page.waitForTimeout(1000);
}
await place();
await page.screenshot({ path: `test/shots/${outName}` });
const info = await page.evaluate(() => {
  // El canvas WebGL es el más grande; los del HUD son pequeños
  const cv = [...document.querySelectorAll("canvas")].sort(
    (a, b) => b.width * b.height - a.width * a.height
  )[0];
  const c = document.createElement("canvas");
  c.width = 320; c.height = 180;
  const g = c.getContext("2d");
  g.drawImage(cv, 0, 0, 320, 180);
  const d = g.getImageData(0, 120, 320, 60).data;
  let n = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i] + d[i + 1] + d[i + 2] < 90) n++;
  }
  const e = window.__match.engine;
  return {
    darkBottomThird: (n / (d.length / 4)).toFixed(3),
    ball: e.ball.x.toFixed(1) + "," + e.ball.z.toFixed(1),
  };
});
console.log(JSON.stringify(info));
console.log("consoleErrors:", errors.length ? errors : "none");
await browser.close();

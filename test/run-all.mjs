// Runner único de tests (Fase 0.1): `npm test`.
// - Arranca Vite en BASE_URL (puerto 5199 por defecto).
// - Ejecuta la prueba de humo completa (test/smoke.mjs).
// - Opcionalmente ejecuta la batería extendida con --full
//   (phaseB, phaseC, phaseD, phaseE, smokeFullMatch).
// - Mata el servidor al terminar y propaga el código de salida.
import { spawn, execFileSync } from "node:child_process";

const PORT = Number(process.env.PORT ?? 5199);
const BASE_URL = process.env.BASE_URL ?? `http://localhost:${PORT}`;
const FULL = process.argv.includes("--full");

const server = spawn("npx", ["vite", "--port", String(PORT), "--strictPort"], {
  env: { ...process.env, BASE_URL },
  stdio: ["ignore", "pipe", "pipe"],
  shell: true,
});

let _ready = false;
await new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error("vite no arrancó en 60 s")), 60000);
  const onData = (d) => {
    const s = String(d);
    if (/Local:\s+http|ready in/i.test(s)) {
      clearTimeout(t);
      _ready = true;
      resolve();
    }
  };
  server.stdout.on("data", onData);
  server.stderr.on("data", onData);
  server.on("error", (e) => { clearTimeout(t); reject(e); });
});
console.log(`[test] servidor en ${BASE_URL}`);

const suites = ["test/smoke.mjs"];
if (FULL) suites.push("test/phaseF1.mjs", "test/phaseF2.mjs", "test/phaseF3.mjs", "test/phaseF4.mjs", "test/phaseF5.mjs", "test/phaseF6.mjs", "test/phaseF7.mjs", "test/phaseF8.mjs", "test/phaseF9.mjs", "test/phaseC.mjs", "test/phaseD.mjs", "test/phaseE.mjs", "test/smokeFullMatch.mjs");

let code = 0;
try {
  for (const s of suites) {
    console.log(`[test] ejecutando ${s} ...`);
    execFileSync("node", [s], {
      env: { ...process.env, BASE_URL, PORT: String(PORT) },
      stdio: "inherit",
    });
  }
  console.log("[test] TODO OK");
} catch {
  code = 1;
  console.error("[test] FALLO");
} finally {
  server.kill();
}
process.exit(code);

# Tests — FÚTBOL 3D (Fase 11)

## `npm test` (CI)
Arranca Vite, corre el humo completo y apaga. Rápido (~2 min en headless):
`test/smoke.mjs` — menú → equipos → partido → gol → replay → final → revancha.

## `npm run test:full` (CI, largo)
Todo lo mantenido, en orden:
`smoke` → `phaseF1`…`phaseF8` → `phaseC` → `phaseD` → `phaseE` →
`smokeFullMatch` (partido completo de 3 min). En headless con SwiftShader
puede tardar 30–60 min: cada suite espera en **tiempo de simulación**, no de
pared, para no medir en frío.

`BASE_URL` y `CHROMIUM_PATH` permiten apuntar a otro servidor o navegador.

## `test/replaySlowmo.mjs` (manual, largo)
Verifica la descarga real del `.webm`. Espera el fin natural de la
repetición: solo a mano (`node test/replaySlowmo.mjs` con el dev server
levantado). `phaseF2` cubre en CI la publicación del vídeo y el botón.

## `test/manual/` (sondas de desarrollo, sin mantener)
Scripts de una época (cámaras, kickoffs, probes de IA, `controls.mjs` con
nombres de tecla antiguos…). Se conservan como referencia y se ejecutan a
mano con el dev server levantado; **no** entran en CI. Sus comportamientos
viven cubiertos en `phaseF1`…`phaseF8` + `phaseB`…`phaseE` cuando aplica.

## Notas headless (importantes)
- SwiftShader rinde ~0,5 FPS: los tests esperan por `window.__match.engine.time`
  (simulación) o por estados, nunca por wall-time para mecánicas.
- `helpers.gotoMatch` espera además a `engine.flushInput`: los efectos de
  `Simulation` (dentro del Canvas R3F) tardan segundos en registrarse en frío.
- 0 errores de consola/pageerror en todos los suites: cualquier `console.error`
  nuevo hace fallar el test que lo vea.

// Posesión del balón: quién lo tiene controlado.
// Un jugador "tiene" el balón (p.hasBall) tras un control limpio; lo pierde
// si el balón se aleja (>1.7 m), se escapa rápido (>12 m/s) o se eleva.

import { dist2D } from "../utils/math";

export function ballSpeed2D(b) {
  return Math.hypot(b.vx, b.vz);
}

/** Jugador que posee el balón ahora mismo (o null si está suelto). */
export function possessorOf(engine) {
  const b = engine.ball;
  let best = null, bestD = 1.6;
  for (const p of engine.players) {
    if (!p.hasBall) continue;
    const d = dist2D(p.x, p.z, b.x, b.z);
    if (d < bestD) { best = p; bestD = d; }
  }
  return best;
}

export function clearPossession(engine, except = null) {
  for (const p of engine.players) {
    if (p !== except) p.hasBall = false;
  }
}

export function setPossession(engine, p) {
  clearPossession(engine, p);
  p.hasBall = true;
}

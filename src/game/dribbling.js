// Conducción y regate (Fase B).
// - Toques dinámicos: cada X ms (según velocidad y dribbling) el balón recibe
//   un micro-impulso hacia la dirección de movimiento. NUNCA va pegado al pie.
// - Toque largo (se puede perder): esprint por encima del umbral con balón,
//   giro brusco (>120° a alta velocidad) o dribbling bajo.
// - Regate (Ctrl): toques más cortos y pegados, giros más cerrados, el cuerpo
//   se interpone entre el balón y el rival más cercano (el balón se coloca en
//   el lado opuesto al rival).
// - Cambios de ritmo: amago de sprint con Ctrl => pequeño "burst" lateral o
//   acelerón corto (cooldown 1.5 s). Nada arcade: cambios creíbles.

import { clamp, wrapAngle } from "../utils/math";
import { kickBall } from "../physics/ballPhysics";
import { playPass } from "../audio/audioEngine";

function nearestOpponent(engine, p) {
  let best = null, bd = Infinity;
  for (const o of engine.players) {
    if (o.side === p.side || o === p) continue;
    const d = Math.hypot(o.x - p.x, o.z - p.z);
    if (d < bd) { bd = d; best = o; }
  }
  return best ? { p: best, d: bd } : null;
}

/** Intervalo entre toques según velocidad y dribbling (Ctrl lo acorta). */
export function dribbleInterval(p, speed) {
  const base = 0.24 + speed * 0.028 - p.data.dribbling * 0.0012;
  let iv = clamp(base, 0.16, 0.55);
  if (p.dribbleMod) iv *= 0.7;
  return iv;
}

/** Un toque de conducción del poseedor. */
export function dribbleTouch(engine, p) {
  const b = engine.ball;
  const rng = engine.rng;
  const sp = Math.hypot(p.vx, p.vz);

  // Quieto y con el balón pegado: no hace falta tocar.
  const ballD = Math.hypot(b.x - p.x, b.z - p.z);
  if (sp < 0.4 && ballD < 0.75) {
    p.touchTimer = 0.2;
    return;
  }

  const moveAng = sp > 0.5 ? Math.atan2(p.vz, p.vx) : p.facing;
  const turn = Math.abs(wrapAngle(moveAng - p.lastMoveAng));
  const sharpTurn = turn > 2.09 && sp > 5; // >120° a alta velocidad
  const sprinting = sp > p.maxSpeed * 0.8;
  const heavy = sprinting || sharpTurn || p.data.dribbling < 55;
  p.lastMoveAng = moveAng;

  let dx = Math.cos(moveAng), dz = Math.sin(moveAng);
  let power = clamp(sp * 0.85 + 1.6, 2.2, 7.5);

  if (p.dribbleMod) {
    power *= 0.78; // toques más cortos y pegados
    const opp = nearestOpponent(engine, p);
    if (opp && opp.d < 3) {
      // Protección: el balón va al lado opuesto al rival más cercano.
      const ax = p.x - opp.p.x, az = p.z - opp.p.z;
      const al = Math.hypot(ax, az) || 1;
      dx = dx * 0.6 + (ax / al) * 0.6;
      dz = dz * 0.6 + (az / al) * 0.6;
      const l = Math.hypot(dx, dz) || 1;
      dx /= l; dz /= l;
    }
  }

  if (heavy) {
    // Toque largo pero controlado: el balón se adelanta sin escaparse.
    // (Con *1,9 hasta 13 m/s superaba el umbral de pérdida de posesión
    //  (12 m/s) y se iba a ~5 m del jugador: esprintar perdía el balón.)
    power = Math.min(power * 1.2, 8.8);
    const bs = Math.hypot(b.vx, b.vz);
    if (bs > 0.5) {
      dx = dx * 0.72 + (b.vx / bs) * 0.28;
      dz = dz * 0.72 + (b.vz / bs) * 0.28;
      const l = Math.hypot(dx, dz) || 1;
      dx /= l; dz /= l;
    }
  }

  // Error lateral según dribbling (más si el toque sale largo)
  const err = (1 - p.data.dribbling / 100) * (heavy ? 0.5 : 0.22);
  const a = Math.atan2(dz, dx) + (rng() * 2 - 1) * err;

  kickBall(b, Math.cos(a), Math.sin(a), power, 0, 0, p.uid);
  // Esprintando el siguiente toque llega antes (el balón no da tiempo a
  // escaparse); en giro brusco o regate pobre el toque largo sí penaliza.
  p.touchTimer = dribbleInterval(p, sp) * (heavy ? (sprinting ? 1.15 : 1.45) : 1);
  if (!p.anim.action) {
    p.anim.action = "kick";
    p.anim.timer = 0.2;
  }
  try { playPass(0.2); } catch { /* sin audio */ }
}

/**
 * Cambio de ritmo: amago de sprint con Ctrl mantenido y balón.
 * Pequeño acelerón en la dirección del input (cooldown 1.5 s).
 */
export function tryBurst(engine, p, move) {
  if (p.burstCd > 0 || !p.hasBall) return;
  const m = Math.hypot(move.x, move.z);
  const dx = m > 0.2 ? move.x / m : Math.cos(p.facing);
  const dz = m > 0.2 ? move.z / m : Math.sin(p.facing);
  p.vx += dx * 3.4;
  p.vz += dz * 3.4;
  p.burstCd = 1.5;
  p.anim.action = "kick";
  p.anim.timer = 0.2;
  try { playPass(0.3); } catch { /* sin audio */ }
}

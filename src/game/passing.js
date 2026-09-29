// Sistema de pase (Fase B): 3 tipos interceptables.
// - Pase raso (X): al compañero mejor posicionado en el cono frontal del input
//   (o del facing si no hay input), con "lead pass": apunta a dónde estará.
// - Pase al hueco (W con balón): adelantado al espacio por delante del
//   receptor con mejor desmarque, con más potencia.
// - Centro / pase alto (A con balón): parábola con elevación hacia el área.
// Calidad según passing del pasador, distancia y presión rival (<2 m).
// Indicador visual: engine.passFx (línea en el suelo 0.4 s, la pinta Match.jsx).

import { FIELD } from "./constants";
import { clamp } from "../utils/math";
import { kickBall } from "../physics/ballPhysics";
import { isGassed } from "./stamina";
import { DIFF, normalizeDifficulty } from "./difficulty";
import { playPass } from "../audio/audioEngine";
import { snapshotPass, wouldBeOffside } from "./offside";

function opponentsOf(engine, p) {
  return p.side === "home" ? engine.away : engine.home;
}

export function nearestOpponentDist(engine, p) {
  let m = Infinity;
  for (const o of opponentsOf(engine, p)) {
    const d = Math.hypot(o.x - p.x, o.z - p.z);
    if (d < m) m = d;
  }
  return m;
}

/** Ruido angular del pase (rad): passing, distancia, presión, stamina. */
function passErrorAngle(engine, p, dist) {
  const rng = engine.rng;
  const q = p.data.passing / 100;
  let sigma = (1 - q) * 0.17 + dist * 0.0022;
  if (nearestOpponentDist(engine, p) < 2) sigma += 0.085; // rival encima => error
  if (isGassed(p)) sigma *= 1.35;
  // Fase 5: asistencia al usuario según dificultad (fácil perdona más).
  if (p.controlled) sigma *= DIFF[normalizeDifficulty(engine.difficulty)].userPassErr;
  // aprox. normal en [-2σ, 2σ] con 3 tiradas
  return (((rng() + rng() + rng()) / 3) - 0.5) * 2 * sigma * 1.4;
}

function showPassFx(engine, x, z, dx, dz, len) {
  engine.passFx = { x, z, dx, dz, len, t: 0.4 };
}

function afterKick(engine, p, animTime = 0.26) {
  p.hasBall = false;
  p.kickCooldown = 0.35;
  p.touchTimer = 0.3;
  p.anim.action = "kick";
  p.anim.timer = animTime;
  try { playPass(0.5); } catch { /* sin audio */ }
}

/** Elige receptor en un cono frontal de (dx,dz). */
function chooseInCone(engine, p, dx, dz) {
  const mates = engine.players.filter(
    (q) => q.side === p.side && q !== p && q.role !== "GK" && !q.sentOff
  );
  let best = null, bestScore = -Infinity;
  for (const m of mates) {
    const vx = m.x - p.x, vz = m.z - p.z;
    const d = Math.hypot(vx, vz);
    if (d < 2 || d > 38) continue;
    const align = (vx * dx + vz * dz) / d; // 1 = justo delante
    if (align < 0.35) continue;
    const atk = p.isHome ? 1 : -1;
    const forward = ((m.x - p.x) * atk) / d; // progresión hacia portería rival
    const score = align * 2.2 - d * 0.035 + forward * 0.6;
    if (score > bestScore) { bestScore = score; best = m; }
  }
  return best;
}

/** Compañero de campo más cercano (red de seguridad: el pase siempre va a
 *  un compañero, nunca se tira al vacío). */
function nearestMate(engine, p) {
  let best = null, bd = Infinity;
  for (const q of engine.players) {
    if (q.side !== p.side || q === p || q.role === "GK" || q.sentOff) continue;
    const d = Math.hypot(q.x - p.x, q.z - p.z);
    if (d < bd) { bd = d; best = q; }
  }
  return bd <= 45 ? best : null;
}

/** Predice el receptor del pase raso sin ejecutarlo (Fase 1: vista previa
 *  del receptor). Misma selección que doGroundPass. Devuelve el jugador o null. */
export function predictPassTarget(engine, p, move) {
  const m = move ? Math.hypot(move.x, move.z) : 0;
  const dx = m > 0.2 ? move.x / m : Math.cos(p.facing);
  const dz = m > 0.2 ? move.z / m : Math.sin(p.facing);
  return chooseInCone(engine, p, dx, dz) || nearestMate(engine, p);
}

/** Pase raso con lead: apunta a dónde estará el receptor.
 * El pase SIEMPRE va a un compañero: primero busca en el cono frontal del
 * input (o del facing si no hay input); si no hay nadie ahí, va al compañero
 * más cercano. Así las jugadas tienen continuidad.
 * @param {object} forcedMate - si se indica, se pasa a ese compañero en vez
 *        de elegir en el cono (lo usa la IA para que su elección mande).
 * @param {object} opts - { powerMult, driven }: multiplicador de potencia
 *        (carga del pase en WASD) y pase tenso (con sprint). */
export function doGroundPass(engine, p, move, forcedMate = null, opts = {}) {
  const b = engine.ball;
  const m = move ? Math.hypot(move.x, move.z) : 0;
  const dx = m > 0.2 ? move.x / m : Math.cos(p.facing);
  const dz = m > 0.2 ? move.z / m : Math.sin(p.facing);
  const mate = forcedMate || chooseInCone(engine, p, dx, dz) || nearestMate(engine, p);

  let tx, tz, speed;
  if (!mate) {
    // Sin ningún compañero a alcance: pase de seguridad hacia delante.
    tx = p.x + dx * 12; tz = p.z + dz * 12;
    speed = 12;
  } else {
    const d = Math.hypot(mate.x - p.x, mate.z - p.z);
    speed = clamp(8 + p.data.passing * 0.07 + d * 0.24, 8, 19);
    if (isGassed(p)) speed *= 0.92;
    const tof = d / speed; // tiempo de vuelo
    tx = mate.x + mate.vx * tof * 0.85; // lead pass
    tz = mate.z + mate.vz * tof * 0.85;
    engine.passTarget = mate.uid;
    engine.passTargetT = 2.5;
  }
  // Fase 4: potencia regulable (carga en WASD, 1x–1,6x) y pase tenso
  // (con sprint: 1,35x, más plano y con algo más de error).
  const mult = (opts.powerMult || 1) * (opts.driven ? 1.35 : 1);
  speed = clamp(speed * mult, 8, 26);
  // Punto de destino del pase (la IA lleva al receptor hasta aquí).
  engine.passSpot = { x: tx, z: tz, fx: p.x, fz: p.z, uid: mate ? mate.uid : null, until: engine.time + 2.5 };
  const baseA = Math.atan2(tz - p.z, tx - p.x);
  const err = passErrorAngle(engine, p, Math.hypot(tx - p.x, tz - p.z));
  const a = baseA + err * (opts.driven ? 1.25 : 1);
  const fx = Math.cos(a), fz = Math.sin(a);
  kickBall(b, fx, fz, speed, 0, (p.data.passing - 70) * 0.008, p.uid);
  showPassFx(engine, p.x, p.z, fx, fz, Math.min(14, Math.hypot(tx - p.x, tz - p.z)));
  afterKick(engine, p);
  // Fase D: snapshot de fuera de juego (exento si nace de un saque exento).
  snapshotPass(engine, p, mate, { exempt: !!engine.restartExempt });
}

/** Pase elevado / bombeado (Fase 4, tecla X): por encima de la defensa al
 *  compañero del cono frontal, con parábola alta para que baje manso. */
export function doLobbedPass(engine, p, move) {
  const b = engine.ball;
  const mate = predictPassTarget(engine, p, move);
  const rng = engine.rng;
  let tx, tz;
  if (!mate) {
    const m = move ? Math.hypot(move.x, move.z) : 0;
    const dx = m > 0.2 ? move.x / m : Math.cos(p.facing);
    const dz = m > 0.2 ? move.z / m : Math.sin(p.facing);
    tx = p.x + dx * 16; tz = p.z + dz * 16;
  } else {
    const d = Math.hypot(mate.x - p.x, mate.z - p.z);
    const tof = 0.9 + d * 0.03; // el bombeado tarda: apunta a dónde estará
    tx = mate.x + mate.vx * tof * 0.9;
    tz = mate.z + mate.vz * tof * 0.9;
    engine.passTarget = mate.uid;
    engine.passTargetT = 3;
  }
  const d = Math.hypot(tx - p.x, tz - p.z);
  const hSpeed = clamp(d / 1.5, 8, 17) * (isGassed(p) ? 0.92 : 1);
  const vy = 4.5 + d * 0.075; // parábola alta
  engine.passSpot = { x: tx, z: tz, fx: p.x, fz: p.z, uid: mate ? mate.uid : null, until: engine.time + 3.5 };
  const a = Math.atan2(tz - p.z, tx - p.x) + passErrorAngle(engine, p, d);
  kickBall(b, Math.cos(a), Math.sin(a), hSpeed, vy, (rng() - 0.5) * 1.4, p.uid);
  showPassFx(engine, p.x, p.z, Math.cos(a), Math.sin(a), Math.min(14, d));
  afterKick(engine, p, 0.3);
  snapshotPass(engine, p, mate, { exempt: !!engine.restartExempt });
}

/** Pase al hueco: al espacio por delante del que mejor desmarque tenga.
 * @param {boolean} avoidOffside - la IA evita lanzar a un receptor que
 *        estaría en fuera de juego obvio (el usuario conserva el riesgo). */
export function doThroughBall(engine, p, avoidOffside = false) {
  const b = engine.ball;
  const atk = p.isHome ? 1 : -1;
  const mates = engine.players.filter(
    (q) => q.side === p.side && q !== p && q.role !== "GK" && !q.sentOff
  );
  const cands = [];
  for (const m of mates) {
    const d = Math.hypot(m.x - p.x, m.z - p.z);
    if (d < 3 || d > 42) continue;
    // Espacio por delante del receptor (sonda 7 m hacia la portería rival)
    const px = m.x + atk * 7, pz = m.z;
    let space = Infinity;
    for (const o of opponentsOf(engine, m)) {
      const od = Math.hypot(o.x - px, o.z - pz);
      if (od < space) space = od;
    }
    const score = space * 1.25 - d * 0.05 + (m.x * atk) * 0.045;
    cands.push({ m, score });
  }
  cands.sort((a, z) => z.score - a.score);
  // Fase D: la IA no lanza el pase al hueco a un receptor en fuera de juego
  // obvio; prueba con el siguiente candidato o juega en seguro hacia delante.
  let best = null;
  for (const c of cands) {
    if (avoidOffside && wouldBeOffside(engine, p, c.m)) continue;
    best = c.m;
    break;
  }
  let tx, tz;
  if (!best) {
    tx = p.x + atk * 22; tz = p.z * 0.7;
  } else {
    const lead = 6 + Math.hypot(best.vx, best.vz) * 0.45;
    tx = best.x + atk * lead;
    tz = best.z + best.vz * 0.3;
    engine.passTarget = best.uid;
    engine.passTargetT = 2.5;
  }
  const d = Math.hypot(tx - p.x, tz - p.z);
  const speed = clamp(11 + d * 0.3, 12, 21) * (isGassed(p) ? 0.92 : 1);
  // Punto de destino del pase al hueco (la IA lleva al receptor hasta aquí).
  engine.passSpot = { x: tx, z: tz, fx: p.x, fz: p.z, uid: best ? best.uid : null, until: engine.time + 3 };
  const baseA = Math.atan2(tz - p.z, tx - p.x);
  const a = baseA + passErrorAngle(engine, p, d) * 0.8;
  const fx = Math.cos(a), fz = Math.sin(a);
  kickBall(b, fx, fz, speed, 0.4, (p.data.passing - 70) * 0.01, p.uid);
  showPassFx(engine, p.x, p.z, fx, fz, Math.min(16, d));
  afterKick(engine, p);
  // Fase D: snapshot de fuera de juego (exento si nace de un saque exento).
  snapshotPass(engine, p, best, { exempt: !!engine.restartExempt });
}

/** Centro / pase alto: parábola hacia el área rival buscando rematadores. */
export function doCross(engine, p) {
  const b = engine.ball;
  const atk = p.isHome ? 1 : -1;
  const gx = atk * FIELD.halfLength;
  // Rematador: compañero más cercano al área rival (idealmente delantero)
  const mates = engine.players.filter((q) => q.side === p.side && q !== p && !q.sentOff);
  let best = null, bestScore = -Infinity;
  for (const m of mates) {
    const boxD = Math.hypot(m.x - (gx - atk * 9), m.z);
    const fwd = ["ST", "CF", "LW", "RW", "AM"].includes(m.role) ? 6 : 0;
    const score = fwd - boxD * 0.25 - Math.hypot(m.x - p.x, m.z - p.z) * 0.04;
    if (score > bestScore) { bestScore = score; best = m; }
  }
  const rng = engine.rng;
  let tx = gx - atk * (8 + rng() * 5);
  let tz = (rng() * 2 - 1) * 13;
  if (best) {
    tx = best.x + atk * 2.5;
    tz = best.z;
    engine.passTarget = best.uid;
    engine.passTargetT = 2.5;
  }
  // Caída con dispersión controlada
  tx += (rng() * 2 - 1) * 2.2;
  tz += (rng() * 2 - 1) * 2.2;
  const d = Math.hypot(tx - p.x, tz - p.z);
  const hSpeed = clamp(d / 1.15, 10, 20) * (isGassed(p) ? 0.92 : 1);
  // Punto de caída del centro (la IA lleva al rematador hasta aquí).
  engine.passSpot = { x: tx, z: tz, fx: p.x, fz: p.z, uid: best ? best.uid : null, until: engine.time + 3.5 };
  const vy = 4.2 + d * 0.055; // parábola
  const a = Math.atan2(tz - p.z, tx - p.x) + passErrorAngle(engine, p, d) * 0.7;
  kickBall(b, Math.cos(a), Math.sin(a), hSpeed, vy, (rng() - 0.5) * 1.2, p.uid);
  showPassFx(engine, p.x, p.z, Math.cos(a), Math.sin(a), Math.min(16, d));
  afterKick(engine, p, 0.3);
  // Fase D: snapshot de fuera de juego (exento si nace de un saque exento).
  snapshotPass(engine, p, best, { exempt: !!engine.restartExempt });
}

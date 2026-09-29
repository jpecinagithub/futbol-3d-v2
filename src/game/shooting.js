// Sistema de tiro (Fase B + Fase 4): la tecla de tiro empieza a cargar
// (0–1 s); soltar (o llegar a 1 s) golpea.
// Tipos de tiro: colocado (carga corta sin sprint: raso y preciso),
// normal, potente (con sprint: más velocidad, más riesgo) y vaselina
// (C/Y durante la carga: parábola alta).
// Dirección = input del jugador con asistencia hacia portería; sin input,
// al centro de la portería.
// Potencia: 0–0.2 suave, 0.2–0.6 medio, 0.6–1.0 fuerte.
// Dirección = input del jugador; sin input, al centro de la portería.
// Dispersión según shooting, distancia, ángulo, presión (<3 m), en carrera
// vs parado, y stamina baja. Elevación: raso/medio/alto según la carga.
// Al golpear: pose de tiro (animator), sonido y "kick" de cámara.

import { FIELD } from "./constants";
import { kickBall } from "../physics/ballPhysics";
import { isGassed } from "./stamina";
import { DIFF, normalizeDifficulty } from "./difficulty";
import { thump, crowdOoh } from "../audio/audioEngine";
import { useMatchStore } from "../stores/useMatchStore";

/** Estadística local (evita ciclo de imports con deadball.js). */
function bumpLocalStat(engine, side, key) {
  if (engine.stats && engine.stats[side]) {
    engine.stats[side][key] = (engine.stats[side][key] || 0) + 1;
  }
  try {
    useMatchStore.getState().bumpStat(side, key);
  } catch { /* sin store (tests puros) */ }
}

/**
 * Cuenta un tiro y detecta si va a puerta proyectando la trayectoria
 * inicial hasta el plano de la portería (aproximación sin rozamiento:
 * |z| < 3.66 m y 0 < y < 2.44 m). Los goles también cuentan como a puerta.
 */
export function countShot(engine, p, dx, dz, power, vy) {
  const atk = p.isHome ? 1 : -1;
  const gx = atk * FIELD.halfLength;
  const b = engine.ball;
  let onTarget = false;
  if (dx * atk > 0.05 && power > 0.1) {
    const t = (gx - b.x) / (dx * power);
    if (t > 0 && t < 8) {
      const zAt = b.z + dz * power * t;
      const yAt = b.y + vy * t - 0.5 * 9.81 * t * t;
      onTarget = Math.abs(zAt) < 3.66 && yAt > 0 && yAt < 2.44;
    }
  }
  bumpLocalStat(engine, p.side, "shots");
  if (onTarget) {
    bumpLocalStat(engine, p.side, "shotsOnTarget");
    // Ocasión clara desde lejos: la grada contiene la respiración.
    const dist = Math.hypot(gx - p.x, p.z);
    if (dist > 10) {
      try { crowdOoh(); } catch { /* sin audio */ }
    }
  }
  return onTarget;
}

function countPressure(engine, p, radius) {
  let n = 0;
  for (const o of engine.players) {
    if (o.side === p.side || o === p) continue;
    if (Math.hypot(o.x - p.x, o.z - p.z) < radius) n++;
  }
  return n;
}

export function startShotCharge(engine, p, move) {
  if (engine.charge) return;
  const m = Math.hypot(move.x, move.z);
  engine.charge = {
    uid: p.uid,
    t: 0,
    driven: false, // sprint durante la carga/suelta = tiro potente
    chip: false,   // C/Y durante la carga = vaselina
    dx: m > 0.2 ? move.x / m : Math.cos(p.facing),
    dz: m > 0.2 ? move.z / m : Math.sin(p.facing),
  };
  p.anim.action = "kick";
  p.anim.timer = 0.15;
}

/** Avanza la carga; se puede apuntar con el input mientras se carga. */
export function updateCharge(engine, dt, held, move, sprint = false) {
  const c = engine.charge;
  if (!c) return;
  const m = Math.hypot(move.x, move.z);
  if (m > 0.25) {
    c.dx = move.x / m;
    c.dz = move.z / m;
  }
  if (sprint) c.driven = true; // esprintar cargando = tiro potente
  if (!held || c.t >= 1) {
    releaseShot(engine);
    return;
  }
  c.t = Math.min(1, c.t + dt);
  if (c.t >= 1) releaseShot(engine);
}

export function releaseShot(engine) {
  const c = engine.charge;
  if (!c) return;
  engine.charge = null;
  const p = engine.players.find((q) => q.uid === c.uid);
  if (!p || !p.hasBall) return; // perdió el balón mientras cargaba

  const b = engine.ball;
  const rng = engine.rng;
  const atk = p.isHome ? 1 : -1;
  const gx = atk * FIELD.halfLength;
  const charge = c.t;

  // Dirección: input, o centro de la portería con ajuste por ángulo.
  // Fase 4: asistencia de dirección — el tiro "busca" portería.
  // Fase 5: la asistencia al USUARIO escala con la dificultad (fácil ayuda
  // más); la IA tira siempre con la base.
  let dx = c.dx, dz = c.dz;
  const aimMag = Math.hypot(dx, dz);
  const placed = !c.driven && !c.chip && charge < 0.5;
  const userBlend = DIFF[normalizeDifficulty(engine.difficulty)].userAim;
  const blend = p.controlled ? userBlend : placed ? 0.5 : 0.35;
  if (aimMag < 0.25) {
    const gx0 = gx - p.x, gz0 = 0 - p.z;
    const l = Math.hypot(gx0, gz0) || 1;
    dx = gx0 / l; dz = gz0 / l;
  } else {
    // Mezcla hacia la portería: el tiro "busca" portería
    const gx0 = gx - p.x, gz0 = 0 - p.z;
    const l = Math.hypot(gx0, gz0) || 1;
    dx = dx * (1 - blend) + (gx0 / l) * blend;
    dz = dz * (1 - blend) + (gz0 / l) * blend;
    const l2 = Math.hypot(dx, dz) || 1;
    dx /= l2; dz /= l2;
  }

  const dist = Math.hypot(gx - p.x, p.z);
  const shooting = p.data.shooting / 100;

  // Potencia 8 (suave) – 23 (fuerte) m/s
  let power = (8 + charge * 15) * (0.92 + shooting * 0.16);
  if (isGassed(p)) power *= 0.92;
  // Elevación: raso con poca carga, medio/alto con carga alta (+ aleatoriedad)
  let vy = 0.8 + Math.pow(charge, 1.4) * 7.5 * (0.55 + 0.45 * rng());

  // Dispersión angular: que se note que no todo va donde se apunta
  const pressure = countPressure(engine, p, 3);
  const onRun = Math.hypot(p.vx, p.vz) > 4;
  const angleToGoal = Math.abs(
    Math.atan2(dz, dx) - Math.atan2(0 - p.z, gx - p.x)
  );
  let spread =
    0.028 +
    (1 - shooting) * 0.11 +
    dist * 0.0011 +
    Math.min(angleToGoal, 1) * 0.05 +
    pressure * 0.028 +
    (onRun ? 0.035 : 0);
  if (isGassed(p)) spread *= 1.4;
  // Fase 5: error del tiro rival por dificultad (viene en la carga de la IA).
  if (c.aiErr) spread *= c.aiErr;

  // Fase 4: tipos de tiro.
  let spin = (rng() - 0.5) * 1.6;
  if (c.chip) {
    // Vaselina (C/Y durante la carga): parábola alta que baja manso.
    power = 10 + charge * 6;
    vy = 4.5 + charge * 2.5;
    spread *= 0.8;
    spin *= 0.5;
  } else if (c.driven) {
    // Potente (sprint al soltar/cargar): más velocidad, más riesgo.
    power *= 1.25;
    spread *= 1.3;
    vy += 1.5;
  } else if (placed) {
    // Colocado (carga corta sin sprint): raso, preciso, menos potente.
    power *= 0.9;
    spread *= 0.5;
    vy = Math.min(vy, 1.6);
  }
  const a =
    Math.atan2(dz, dx) +
    (((rng() + rng() + rng()) / 3 - 0.5) * 2 * spread * 1.4);

  kickBall(b, Math.cos(a), Math.sin(a), power, vy, spin, p.uid);
  countShot(engine, p, Math.cos(a), Math.sin(a), power, vy);

  p.hasBall = false;
  p.kickCooldown = 0.4;
  p.touchTimer = 0.3;
  p.anim.action = "kick";
  p.anim.timer = 0.32;
  // Fase 8: la pose varía con la potencia y el estilo (colocado/vaselina).
  p.anim.power = charge;
  p.anim.style = c.chip ? "chip" : placed ? "placed" : "normal";
  // Fase 10: sin sacudida de cámara si está activada la reducción.
  try {
    engine.camKick = useMatchStore.getState().reduceMotion ? 0 : 0.3;
  } catch {
    engine.camKick = 0.3;
  }
  try { thump(0.6 + charge * 0.4); } catch { /* sin audio */ }
}

/** ¿Hay una carga de tiro en curso del jugador dado? */
export function chargingShot(engine, p) {
  return !!engine.charge && engine.charge.uid === p.uid;
}

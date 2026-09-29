// Portero — máquina de estados propia (Fase C), 9 estados:
// POSITION: base en la bisectriz balón-portería (adelantado si el balón lejos).
// TRACK_BALL: sigue lateralmente el balón en su zona (histéresis 36/40 m).
// DIVE: el balón va a portería y está cerca -> estirada al punto de intercepción.
// SAVE: tras la estirada/despeje tocó el balón sin quedárselo -> desvío/parada.
// CATCH: balón lento y cercano -> lo atrapa (el contacto lo resuelve).
// PUNCH: balón alto/rápido en el área -> despeje de puños.
// RUSH_OUT: balón en profundidad a su espalda y llega antes -> sale.
// ONE_ON_ONE: achica ante el tirador reduciendo el ángulo.
// DISTRIBUTE: tras atrapar -> salida en corto al libre o en largo.
// La parada se elige por predicción lineal del cruce con la línea de gol.

import { FIELD } from "../game/constants";
import { clamp } from "../utils/math";
import { kickBall } from "../physics/ballPhysics";
import { doGroundPass, doThroughBall, nearestOpponentDist } from "../game/passing";
import { paramsFor } from "../game/difficulty";

const GK = {
  POSITION: "GK_POSITION",
  TRACK_BALL: "GK_TRACK_BALL",
  DIVE: "GK_DIVE",
  SAVE: "GK_SAVE",
  CATCH: "GK_CATCH",
  PUNCH: "GK_PUNCH",
  RUSH_OUT: "GK_RUSH_OUT",
  ONE_ON_ONE: "GK_ONE_ON_ONE",
  DISTRIBUTE: "GK_DISTRIBUTE",
};

export const GK_STATES = GK;

function setGoal(p, x, z, speedF) {
  const ai = p.ai;
  ai.goal.x = clamp(x, -FIELD.halfLength - 2, FIELD.halfLength + 2);
  ai.goal.z = clamp(z, -FIELD.halfWidth, FIELD.halfWidth);
  ai.speedF = clamp(speedF, 0.1, 1);
  p.moveTarget = { x: ai.goal.x, z: ai.goal.z };
  p.desiredSpeed = p.maxSpeed * ai.speedF;
}

/** Punto de intercepción del balón (igual que en tick.js: no perseguir
 *  la posición actual contra un balón en movimiento). */
function interceptPoint(p, b) {
  const dx = b.x - p.x;
  const dz = b.z - p.z;
  const d = Math.hypot(dx, dz);
  const closing = Math.max(2.5, p.maxSpeed * 0.85);
  const t = clamp(d / closing, 0, 1.2);
  return { x: b.x + b.vx * t, z: b.z + b.vz * t };
}

/** Predicción lineal del cruce del balón con la línea de gol (x = gx). */
function predictCrossing(b, gx) {
  const toward = (gx - b.x) * b.vx > 0;
  if (!toward || Math.abs(b.vx) < 0.5) return null;
  const t = (gx - b.x) / b.vx;
  if (t <= 0 || t > 1.1) return null;
  return { t, z: b.z + b.vz * t };
}

/**
 * Punto de estirada: NO la línea de gol (llegar tarde), sino el primer punto
 * de la trayectoria del balón al que el portero llega a tiempo de cruzarse.
 * Así la estirada intercepta el tiro antes, en vez de perseguirlo por detrás.
 */
function divePoint(p, b, gx) {
  const gkSp = Math.max(3.5, p.maxSpeed * 0.95);
  const sgn = Math.sign(gx - b.x) || 1;
  for (let t = 0.05; t <= 1.0; t += 0.05) {
    const bx = b.x + b.vx * t;
    const bz = b.z + b.vz * t;
    if ((gx - bx) * sgn < -0.6) break; // ya cruzó la línea
    const tGk = Math.hypot(bx - p.x, bz - p.z) / gkSp;
    if (tGk <= t + 0.08) return { x: bx, z: bz };
  }
  return null;
}

function distribute(p, engine, team, time) {
  const ai = p.ai;
  ai.state = GK.DISTRIBUTE;
  ai.lockT = time + 1.0;
  const atk = p.isHome ? 1 : -1;
  const mates = team.players.filter(
    (m) => m !== p && m.role !== "GK"
  );
  // Compañero libre más adelantado posible (corto si hay opción segura).
  let best = null;
  let bestScore = -Infinity;
  for (const m of mates) {
    const d = Math.hypot(m.x - p.x, m.z - p.z);
    if (d > 32) continue;
    const free = nearestOpponentDist(engine, m);
    if (free < 4) continue;
    const score = free * 0.6 + atk * m.x * 0.08 - d * 0.05 - (m.controlled ? 0.8 : 0);
    if (score > bestScore) {
      bestScore = score;
      best = m;
    }
  }
  const pressed = nearestOpponentDist(engine, p) < 4;
  if (pressed || !best) {
    doThroughBall(engine, p); // en largo al espacio
  } else {
    const lead = 0.3;
    const tx = best.x + best.vx * lead;
    const tz = best.z + best.vz * lead;
    const d = Math.hypot(tx - p.x, tz - p.z) || 1;
    doGroundPass(engine, p, { x: (tx - p.x) / d, z: (tz - p.z) / d });
  }
  p.passCd = 2.5;
}

/**
 * Decisión del portero (llamar en el tick de decisión de su equipo).
 */
export function gkDecide(p, team, ctx, tai, time) {
  const engine = ctx.engine;
  const b = engine.ball;
  const ai = p.ai;
  const atk = p.isHome ? 1 : -1; // dirección de ataque de su equipo
  const gx = -atk * FIELD.halfLength; // su portería
  const ballSp = Math.hypot(b.vx, b.vz);
  const distGoal = Math.hypot(gx - b.x, b.z);

  // 1) Con el balón: distribuir (no re-decidir durante el saque).
  if (p.hasBall) {
    if (time >= ai.lockT && p.passCd <= 0) distribute(p, engine, team, time);
    else setGoal(p, gx + atk * 3, 0, 0.3);
    return;
  }

  // 2) En plena estirada/despeje/parada: mantener el objetivo un instante.
  if (
    time < ai.lockT &&
    (ai.state === GK.DIVE || ai.state === GK.PUNCH || ai.state === GK.SAVE)
  ) {
    return;
  }

  // 2b) Tras la estirada: si toqué el balón pero no me quedé con él, fue un
  // desvío -> estado SAVE (parada) observable durante ~1 s.
  if (
    (ai.state === GK.DIVE || ai.state === GK.PUNCH) &&
    b.lastTouch === p.uid &&
    !p.hasBall
  ) {
    ai.state = GK.SAVE;
    ai.lockT = time + 1.1;
    setGoal(p, gx + atk * 2.2, p.z * 0.5, 0.4); // recupera la posición
    return;
  }

  const dBall = Math.hypot(b.x - p.x, b.z - p.z);

  // 3) Balón alto o muy rápido cerca: despeje de puños. Va ANTES que la
  // estirada: una vaselina lenta no se "bucea", se despeja de puños.
  if (dBall < 3.6 && p.passCd <= 0 && (b.y > 1.4 || (ballSp > 9 && b.y > 0.8))) {
    ai.state = GK.PUNCH;
    ai.lockT = time + 0.7;
    let dx = b.x - gx;
    let dz = b.z;
    const l = Math.hypot(dx, dz) || 1;
    kickBall(b, dx / l, dz / l, 17, 5.5, 0, p.uid);
    p.hasBall = false;
    p.passCd = 2.0;
    p.anim.action = "kick";
    p.anim.timer = 0.3;
    return;
  }

  // 4) Balón lento y cercano: ir a atraparlo (al punto de intercepción).
  // También antes que la estirada: un balón manso se atrapa, no se bucea.
  if (dBall < 3.6 && ballSp < 6 && b.y < 1.3) {
    ai.state = GK.CATCH;
    const ip = interceptPoint(p, b);
    setGoal(p, ip.x, ip.z, 0.8);
    return;
  }

  // 5) Tiro a portería: estirada al punto de intercepción (no a la línea).
  // Solo si puede llegar a cruzarse (divePoint); si no, sigue colocándose.
  // Fase 5: reflejos del portero rival por dificultad (umbral de tiro y alcance).
  const cross = predictCrossing(b, gx);
  const gdp = paramsFor(engine, p.side);
  if (
    cross &&
    Math.abs(cross.z) < 4.2 &&
    ballSp > gdp.gkDiveSpd &&
    Math.hypot(gx - p.x, cross.z - p.z) < gdp.gkReach
  ) {
    const dp = divePoint(p, b, gx);
    if (dp) {
      ai.state = GK.DIVE;
      ai.lockT = time + 0.7;
      setGoal(p, dp.x, clamp(dp.z, -3.6, 3.6), 1.0);
      // Fase 8: la estirada usa la pose de barrida (cuerpo extendido).
      p.anim.action = "slide";
      p.anim.timer = 0.5;
      return;
    }
  }
  let poss = null;
  for (const q of engine.players) {
    if (q.hasBall && q.side !== p.side) {
      poss = q;
      break;
    }
  }
  // 6) Uno contra uno: el rival conduce hacia mi portería sin defensores por medio.
  if (poss) {
    const dGoal = Math.hypot(gx - poss.x, poss.z);
    if (dGoal < 22) {
      let blocked = false;
      for (const m of team.players) {
        if (m === p || m.role === "GK") continue;
        // ¿Hay un compañero entre el tirador y la portería?
        const px = gx - poss.x;
        const pz = 0 - poss.z;
        const L2 = px * px + pz * pz;
        if (L2 < 1) break;
        const t = clamp(((m.x - poss.x) * px + (m.z - poss.z) * pz) / L2, 0, 1);
        const cx = poss.x + px * t;
        const cz = poss.z + pz * t;
        if (Math.hypot(m.x - cx, m.z - cz) < 2) {
          blocked = true;
          break;
        }
      }
      if (!blocked) {
        ai.state = GK.ONE_ON_ONE;
        const k = 0.34; // achica: se acerca al tirador reduciendo el ángulo
        setGoal(p, gx + (poss.x - gx) * k, poss.z * k, 0.95);
        return;
      }
    }
  }

  // 7) Salida: balón en profundidad a la espalda, suelto, y llego antes.
  if (!poss && b.y < 1.5 && ballSp < 9 && distGoal < 30 && atk * b.x < -20) {
    const tGk = dBall / Math.max(1, p.maxSpeed);
    let tOpp = Infinity;
    for (const o of engine.players) {
      if (o.side === p.side) continue;
      const t = Math.hypot(o.x - b.x, o.z - b.z) / Math.max(1, o.maxSpeed);
      if (t < tOpp) tOpp = t;
    }
    if (tGk < tOpp - 0.25) {
      ai.state = GK.RUSH_OUT;
      const ip = interceptPoint(p, b);
      setGoal(p, ip.x, ip.z, 1.0);
      return;
    }
  }

  // 8) Posición base: bisectriz balón-portería, adelantado si el balón está
  // lejos. Con el balón en su zona, el portero lo sigue lateralmente de
  // forma activa -> GK_TRACK_BALL; con el balón lejos, GK_POSITION (base).
  // Histéresis 36/40 m para no parpadear en el borde.
  const tracking =
    ai.state === GK.TRACK_BALL ? distGoal < 40 : distGoal < 36;
  ai.state = tracking ? GK.TRACK_BALL : GK.POSITION;
  const depth = distGoal > 38 ? 4.5 : clamp(1.1 + distGoal * 0.055, 1.1, 5.5);
  const z = distGoal > 38 ? b.z * 0.3 : clamp(b.z * 0.42, -3.2, 3.2);
  setGoal(p, gx + atk * depth, z, 0.5);
}

/**
 * Penalti (Fase D): el portero elige lado y se estira en el golpeo.
 * Lee la dirección real del tiro con cierta probabilidad (reflejos);
 * el resto de las veces adivina. La parada la resuelve el estado DIVE.
 */
export function gkPenaltyDive(engine, gk, gx, atk, ballVz) {
  const rng = engine.rng || Math.random;
  const ai = gk.ai || (gk.ai = { state: GK_STATES.POSITION, lockT: 0 });
  let dir = 0;
  if (ballVz > 0.8) dir = 1;
  else if (ballVz < -0.8) dir = -1;
  // Reflejos por dificultad (Fase 5): acierta el lado con esta probabilidad.
  const reflex = paramsFor(engine, gk.side).gkReflex;
  if (rng() > reflex || dir === 0) dir = rng() < 0.5 ? -1 : 1;
  ai.state = GK_STATES.DIVE;
  ai.dive = {
    t: 0.55,
    dx: -atk,              // hacia la línea
    dz: dir * 0.85,        // hacia el lado elegido
    reach: 3.2,            // alcance de la estirada
    saveR: 1.1,
    laneX: gx - atk * 0.9, // punto que cubre
    laneZ: dir * 2.4,
  };
  ai.lockT = engine.time + 0.9;
  gk.anim.action = "slide";
  gk.anim.timer = 0.6;
}

// IA colectiva — FASE C.
//
// Arquitectura:
//  - aiTick(team, ctx, dt) mantiene la firma de la Fase A. ctx trae además
//    { engine, opponents, controlledUid } (lo pone engine.js).
//  - Tick de DECISIÓN a ~12 Hz (acumulador por equipo): fases colectivas,
//    elección de presionador (con histéresis), máquina de estados por jugador
//    (con reacción individual 150–400 ms escalonada), cerebro del poseedor
//    (pase/tiro/conducción) y portero.
//  - STEERING cada frame: cada jugador sigue p.ai.goal con p.desiredSpeed y
//    separación simple de compañeros. El controlado por el humano no se toca.
//
// Regla de oro: solo 1 presionador (+1 en cobertura cercana); el resto mantiene
// la estructura: bloque compacto, marcaje zonal y líneas de pase.

import { FIELD } from "../game/constants";
import { clamp } from "../utils/math";
import { ST, ensureAI } from "./roles";
import { PHASE, updatePhase, possessionSide, initialTeamPhase } from "./teamPhases";
import { tacticalTarget, attackDir, opponentDefLine } from "./tactics";
import { gkDecide } from "./goalkeeper";
import { doThroughBall, doCross } from "../game/passing";
import { kickBall } from "../physics/ballPhysics";
import { isGassed } from "../game/stamina";
import { playPass } from "../audio/audioEngine";
import { releaseShot } from "../game/shooting";
import { startTackle } from "../game/tackling";
// Fase 5: dificultad (params por lado, sin trampas físicas).
import { paramsFor } from "../game/difficulty";
// Fase D: balón parado (decideDeadBall), fuera de juego (wouldBeOffside,
// offsideLineX) y snapshot de pases de la IA
import { DB, decideDeadBall } from "../game/deadball";
import { snapshotPass, offsideLineX } from "../game/offside";

// Decisiones por equipo y segundo según dificultad (Fase 5: paramsFor da el
// Hz del rival; el propio equipo siempre decide a 12 Hz).
const PRESS_HYSTERESIS_M = 1.5; // margen para no cambiar de presionador cada tick
const PRESS_COOLDOWN = 1.0;     // s mínimo entre cambios de presionador

export const AI_VERSION = "fase-c-colectiva";

function getTeamAI(engine, isHome) {
  if (!engine._ai) engine._ai = {};
  const k = isHome ? "home" : "away";
  if (!engine._ai[k]) engine._ai[k] = initialTeamPhase();
  return engine._ai[k];
}

/** Llamar en kickoff(): limpia fases, presionadores y debug. */
export function resetAIState(engine) {
  engine._ai = null;
  if (engine.aiDebug) {
    for (const k of Object.keys(engine.aiDebug)) delete engine.aiDebug[k];
  }
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

function nearestOpp(engine, p) {
  let best = null;
  let bd = Infinity;
  for (const o of engine.players) {
    if (o.side === p.side || o.sentOff) continue;
    const d = Math.hypot(o.x - p.x, o.z - p.z);
    if (d < bd) {
      bd = d;
      best = o;
    }
  }
  return best ? { p: best, d: bd } : null;
}

function nearestOppDist(engine, p) {
  const n = nearestOpp(engine, p);
  return n ? n.d : Infinity;
}

/** Límites de movimiento de jugadores del motor (engine.js: MX, MZ). */
const PLIM_X = 52.5 + 3.5; // 56
const PLIM_Z = 34 + 2.5; // 36.5

/** Objetivo de movimiento "con offset individual" (evita sincronía robótica). */
function setBaseGoal(p, x, z, speedF) {
  const ai = p.ai;
  ai.goal.x = clamp(x + ai.offX, -PLIM_X, PLIM_X);
  ai.goal.z = clamp(z + ai.offZ, -PLIM_Z, PLIM_Z);
  ai.speedF = clamp(speedF, 0.1, 1);
}

/** Objetivo exacto (presión, intercepción, portero ya lo pone él). */
function setGoal(p, x, z, speedF) {
  const ai = p.ai;
  ai.goal.x = clamp(x, -PLIM_X, PLIM_X);
  ai.goal.z = clamp(z, -PLIM_Z, PLIM_Z);
  ai.speedF = clamp(speedF, 0.1, 1);
}

/**
 * Recogida de un balón suelto: CORTAR su trayectoria por delante en vez de
 * perseguirlo por detrás. Perseguir por detrás llega con el balón
 * alejándose, lo que da la penalización máxima de orientación en el control
 * (ballContact.js) y encadena malos toques: el "pinball" (el balón sale
 * despedido una y otra vez y nadie lo controla).
 * Devuelve {x, z, plant: false} (ir a cortar por delante) o
 * {x, z, plant: true} (ya estoy en su trayectoria: plantarse y orientar el
 * cuerpo hacia el balón para que venga de frente => control limpio).
 */
function looseBallPickup(p, b) {
  const sp = Math.hypot(b.vx, b.vz);
  if (sp < 1.2) return { x: b.x, z: b.z, plant: false }; // parado: ir directo
  const dx = b.vx / sp;
  const dz = b.vz / sp;
  const rx = p.x - b.x;
  const rz = p.z - b.z;
  const ahead = rx * dx + rz * dz; // >0: estoy por delante en su trayectoria
  if (ahead > 0.6) return { x: p.x, z: p.z, plant: true };
  return { x: b.x + dx * 2.4, z: b.z + dz * 2.4, plant: false };
}

/** Aplica un punto de recogida: correr al corte o plantarse orientado. */
function goPickup(p, b, pk, runF) {
  if (pk.plant) {
    setGoal(p, p.x, p.z, 0.12);
    p.facing = Math.atan2(b.z - p.z, b.x - p.x);
  } else {
    setGoal(p, pk.x, pk.z, runF);
  }
}

/**
 * Asegura un balón suelto que se aleja con una entrada corta (tackleT).
 * Correr hacia un balón que rueda EN CONTRA da el peor ángulo de control
 * (penalización máxima de orientación en ballContact.js) y encadena malos
 * toques: el "pinball". La ventana de entrada (0.3 s) resuelve con robo
 * limpio al contacto (<1.05 m) si ningún rival está a <0.85 m del balón;
 * por eso solo se usa con margen de seguridad (≥1.3 m al rival más cercano
 * al balón), para no provocar faltas tontas.
 * No sustituye al control normal: solo al caso malo (balón que se aleja).
 */
function tryLooseTackle(engine, p) {
  const b = engine.ball;
  if (p.tackleCd > 0 || p.tackleT > 0 || b.y > 1) return;
  const dx = b.x - p.x;
  const dz = b.z - p.z;
  const d = Math.hypot(dx, dz);
  // Fase 5: agresividad del rival (radio de auto-entrada por dificultad).
  if (d > paramsFor(engine, p.side).tackleRadius) return;
  const sp = Math.hypot(b.vx, b.vz);
  if (sp > 6 || sp < 0.8) return; // rápido: inalcanzable; parado: el control normal vale
  // ¿El balón viene hacia mí? Entonces el control normal es limpio.
  const toward = (b.vx * -dx + b.vz * -dz) / (sp * (d || 1));
  if (toward > 0.3) return;
  for (const o of engine.players) {
    if (o.side === p.side || o === p || o.sentOff) continue;
    if (Math.hypot(o.x - b.x, o.z - b.z) < 1.3) return;
  }
  startTackle(engine, p, { x: dx, z: dz });
}

// ---------------------------------------------------------------------------
// Selección del presionador (con histéresis)
// ---------------------------------------------------------------------------

function pressScore(engine, p, tx, tz, tactical) {
  const dBall = Math.hypot(p.x - tx, p.z - tz);
  const dTac = Math.hypot(p.x - tactical.x, p.z - tactical.z);
  return (
    dBall +
    dTac * 0.12 +
    (100 - p.stamina) * 0.02 +
    (100 - (p.data.defending || 60)) * 0.015
  );
}

function selectPresser(team, ctx, tai, time) {
  const engine = ctx.engine;
  const b = engine.ball;
  let tx = b.x;
  let tz = b.z;
  for (const q of engine.players) {
    if (q.hasBall && q.side !== (team.isHome ? "home" : "away")) {
      tx = q.x;
      tz = q.z;
      break;
    }
  }
  let best = null;
  let bestScore = Infinity;
  let second = null;
  let secondScore = Infinity;
  for (const p of team.players) {
    if (p.controlled || p.role === "GK" || p.sentOff) continue;
    const tac = tacticalTarget(p, b, tai.phase, team.isHome);
    const s = pressScore(engine, p, tx, tz, tac);
    if (s < bestScore) {
      second = best;
      secondScore = bestScore;
      best = p;
      bestScore = s;
    } else if (s < secondScore) {
      second = p;
      secondScore = s;
    }
  }
  if (!best) return;
  // Histéresis: mantener al actual si sigue siendo competitivo o si cambió hace poco.
  const cur = team.players.find((p) => p.uid === tai.presserUid);
  if (cur && !cur.controlled && cur.role !== "GK" && !cur.sentOff) {
    const tac = tacticalTarget(cur, b, tai.phase, team.isHome);
    const curScore = pressScore(engine, cur, tx, tz, tac);
    if (
      curScore <= bestScore + PRESS_HYSTERESIS_M ||
      time - tai.presserT < PRESS_COOLDOWN
    ) {
      // Mantener; la cobertura es el mejor distinto del actual.
      let cov = null;
      let covScore = Infinity;
      for (const p of team.players) {
        if (p === cur || p.controlled || p.role === "GK" || p.sentOff) continue;
        const tac2 = tacticalTarget(p, b, tai.phase, team.isHome);
        const s = pressScore(engine, p, tx, tz, tac2);
        if (s < covScore) {
          covScore = s;
          cov = p;
        }
      }
      tai.coverUid = cov ? cov.uid : null;
      return;
    }
  }
  tai.presserUid = best.uid;
  tai.presserT = time;
  tai.coverUid = second && second !== best ? second.uid : null;
}

// ---------------------------------------------------------------------------
// Cerebro del poseedor (IA ofensiva con balón)
// ---------------------------------------------------------------------------

function spaceAheadOf(engine, m, atk) {
  const px = m.x + atk * 7;
  let space = Infinity;
  for (const o of engine.players) {
    if (o.side === m.side) continue;
    const d = Math.hypot(o.x - px, o.z - m.z);
    if (d < space) space = d;
  }
  return space;
}

/** Puntuación del compañero como receptor: desmarque, progresión, seguridad. */
function scoreMate(engine, p, m, atk, d) {
  const no = nearestOpp(engine, m);
  const mark = no ? no.d : 12;
  const desmarque = Math.min(mark, 12);
  const prog = atk * (m.x - p.x);
  // Seguridad del carril: rivales cerca del segmento p->m.
  const vx = m.x - p.x;
  const vz = m.z - p.z;
  const L2 = vx * vx + vz * vz || 1;
  let lane = 0;
  for (const o of engine.players) {
    if (o.side === p.side) continue;
    const t = clamp(((o.x - p.x) * vx + (o.z - p.z) * vz) / L2, 0, 1);
    const cx = p.x + vx * t;
    const cz = p.z + vz * t;
    if (Math.hypot(o.x - cx, o.z - cz) < 2) lane++;
  }
  let s = desmarque * 0.55 + prog * 0.1 - lane * 1.7 - d * 0.06;
  if (m.ai && m.ai.state === ST.ATTACKING) s += 1.0; // premio a la ruptura
  if (m.controlled) {
    if (d > 14) return -Infinity; // al humano solo si es claramente la mejor y está cerca
    s -= 1.2;
  }
  return s;
}

function bestPassOption(engine, p, atk) {
  let best = null;
  let bestScore = -Infinity;
  for (const m of engine.players) {
    if (m.side !== p.side || m === p || m.role === "GK" || m.sentOff) continue;
    const d = Math.hypot(m.x - p.x, m.z - p.z);
    if (d < 1.5 || d > 42) continue;
    const s = scoreMate(engine, p, m, atk, d);
    if (s > bestScore) {
      bestScore = s;
      best = m;
    }
  }
  return best ? { p: best, score: bestScore } : null;
}

function tryShootAI(engine, p, time, atk, gx, distGoal, pressure) {
  const zoneOk = distGoal < 13 || (distGoal < 24 && Math.abs(p.z) < 18);
  if (!zoneOk) return false;
  if (time - p.ai.lastShotT < 3) return false;
  const q = p.data.shooting / 100;
  let prob = q * (1 - distGoal / 32);
  if (pressure < 1.5) prob *= 1.1;
  else if (pressure < 3) prob *= 0.6;
  else prob *= 0.35;
  if (distGoal < 11) prob += 0.3;
  // Cerca de portería, tirar es casi obligatorio (antes prob*0.35 hacía que
  // el portador dudara eternamente en zona de remate).
  if (distGoal < 9) prob = Math.max(prob, 0.9);
  if (engine.rng() > prob * 0.8) return false;
  // Apunta al palo largo (contrario al lado donde está el portero).
  // Apunta al palo largo (contrario al lado donde está el portero).
  const gk = engine.players.find((q2) => q2.side !== p.side && q2.role === "GK");
  const cz = gk && gk.z >= 0 ? -2.9 : 2.9;
  const dx = gx - p.x;
  const dz = cz - p.z;
  const l = Math.hypot(dx, dz) || 1;
  p.ai.state = ST.SHOOTING;
  p.ai.lastShotT = time;
  engine.charge = {
    uid: p.uid,
    t: clamp(0.35 + distGoal / 30, 0.35, 1),
    dx: dx / l,
    dz: dz / l,
    // Fase 5: dispersión del tiro rival por dificultad (sin trampas: la
    // física del tiro es la misma, solo el error).
    aiErr: paramsFor(engine, p.side).shotErr,
  };
  releaseShot(engine);
  p.passCd = 1.2;
  return true;
}

/** Pase raso de la IA: blando y preciso, al pie del compañero.
 * El pase estándar de la Fase B es rápido (hasta 22 m/s) y con dispersión
 * angular alta (±6°), pensado para que el humano corrija al receptor a mano.
 * La IA no puede corregirlo: necesita un pase que pueda recibir sin
 * intervención, con la misma mecánica base (kickBall) pero velocidad moderada,
 * lead mínimo y error angular bajo. */
function aiGroundPass(engine, p, mate) {
  const b = engine.ball;
  const d = Math.hypot(mate.x - p.x, mate.z - p.z);
  let speed = clamp(8 + p.data.passing * 0.06 + d * 0.22, 9, 16);
  if (isGassed(p)) speed *= 0.92;
  // Lead mínimo: el receptor apenas tiene que moverse del punto de pase.
  const tx = mate.x + mate.vx * 0.2;
  const tz = mate.z + mate.vz * 0.2;
  const baseA = Math.atan2(tz - p.z, tx - p.x);
  const q = p.data.passing / 100;
  // Fase 5: el error del pase rival escala con la dificultad.
  const sigma = ((1 - q) * 0.05 + d * 0.0008) * 1.2 * paramsFor(engine, p.side).passErr;
  const rng = engine.rng;
  const err = (((rng() + rng() + rng()) / 3) - 0.5) * 2 * sigma;
  const a = baseA + err;
  const fx = Math.cos(a), fz = Math.sin(a);
  kickBall(b, fx, fz, speed, 0, (p.data.passing - 70) * 0.008, p.uid);
  engine.passFx = { x: p.x, z: p.z, dx: fx, dz: fz, len: Math.min(14, d), t: 0.4 };
  engine.passTarget = mate.uid;
  engine.passTargetT = 2.5;
  engine.passSpot = {
    x: tx, z: tz, fx: p.x, fz: p.z,
    uid: mate.uid, until: engine.time + 2.5,
  };
  // afterKick equivalente (misma secuencia que passing.js).
  p.hasBall = false;
  p.kickCooldown = 0.35;
  p.touchTimer = 0.3;
  p.anim.action = "kick";
  p.anim.timer = 0.26;
  try { playPass(0.5); } catch { /* sin audio */ }
  // Fase D: snapshot de fuera de juego (exento si nace de un saque exento).
  snapshotPass(engine, p, mate, { exempt: !!engine.restartExempt });
}

function carrierBrain(p, ctx, tai, time, _S) {
  const engine = ctx.engine;
  const ai = p.ai;
  const atk = p.isHome ? 1 : -1;
  const gx = atk * FIELD.halfLength;
  const distGoal = Math.hypot(gx - p.x, p.z);
  const pressure = nearestOppDist(engine, p);
  const holdT = time - (ai.gotBallT || time);

  ai.state = ST.DRIBBLING;

  // 1) Tiro en zona.
  if (p.passCd <= 0 && !engine.charge) {
    if (tryShootAI(engine, p, time, atk, gx, distGoal, pressure)) return;
  }

  // 2) Centro desde la banda en el último tercio si hay rematadores.
  if (p.passCd <= 0 && Math.abs(p.z) > 17 && atk * p.x > 26) {
    let matesInBox = 0;
    for (const m of engine.players) {
      if (m.side !== p.side || m === p) continue;
      if (Math.hypot(m.x - (gx - atk * 9), m.z) < 12) matesInBox++;
    }
    if (matesInBox > 0 && (pressure < 3 || engine.rng() < 0.5)) {
      ai.state = ST.PASSING;
      doCross(engine, p);
      p.passCd = 2.2;
      return;
    }
  }

  // 3) Pase al mejor situado. El portador CONDUCE por defecto: solo pasa si
  // hay una buena opción y ya asentó el balón, si la presión le obliga, o
  // si retiene demasiado. Pasar al primer toque en cada recepción convertía
  // el juego en un ping-pong sin progresión ni tiros.
  if (p.passCd <= 0) {
    const mate = bestPassOption(engine, p, atk);
    if (mate) {
      const m = mate.p;
      const d = Math.hypot(m.x - p.x, m.z - p.z);
      const settled = holdT > 0.8;          // balón asentado
      const hurried = holdT > 0.35;         // medio asentado
      const pressedHard = pressure < 1.6;   // rival encima de verdad
      const pressed = pressure < 2.6;
      const goodOption = mate.score > 1.4 && d < 26;
      // Pase al hueco solo si es claramente progresivo y hay espacio real.
      const throughOn =
        atk * (m.x - p.x) > 8 &&
        spaceAheadOf(engine, m, atk) > 6 &&
        d > 14 &&
        (settled || pressedHard);
      const wantPass =
        (goodOption && (settled || (hurried && pressed))) ||
        (pressedHard && hurried && mate.score > 0.6) ||
        holdT > 6;
      if (wantPass) {
        ai.state = ST.PASSING;
        if (throughOn) {
          // Fase D: la IA evita lanzar al hueco a un receptor en fuera de
          // juego obvio (el usuario conserva el riesgo).
          doThroughBall(engine, p, true);
        } else {
          // Pase raso propio de la IA (blando y preciso al pie).
          aiGroundPass(engine, p, m);
        }
        p.passCd = 1.4 + engine.rng() * 1.2;
        return;
      }
    }
  }

  // 4) Conducir: hacia la portería, eludiendo al rival más cercano.
  // Sin esprintar con el balón (el toque largo de la Fase B lo haría perder).
  let dx = gx - p.x;
  let dz = -p.z;
  const dl = Math.hypot(dx, dz) || 1;
  dx /= dl;
  dz /= dl;
  const no = nearestOpp(engine, p);
  if (no && no.d < 5) {
    const ax = p.x - no.p.x;
    const az = p.z - no.p.z;
    const al = Math.hypot(ax, az) || 1;
    dx = dx * 0.6 + (ax / al) * 0.8;
    dz = dz * 0.6 + (az / al) * 0.8;
    const l = Math.hypot(dx, dz) || 1;
    dx /= l;
    dz /= l;
  }
  const sp = 0.5 + (p.data.dribbling / 100) * 0.26; // máx. 0.76: toques controlados
  setGoal(p, p.x + dx * 7, p.z + dz * 7, Math.min(sp, 0.78));
}

// ---------------------------------------------------------------------------
// Deberes ofensivos (mi equipo tiene el balón)
// ---------------------------------------------------------------------------

/**
 * Fase D: disciplina de fuera de juego de la IA. Contiene las carreras en
 * profundidad en la línea del fuera de juego (0.8 m de margen) para no
 * plantar a los delanteros en posición sancionable obvia.
 */
function holdOffsideLine(engine, p, gx) {
  const atk = p.isHome ? 1 : -1;
  const line = offsideLineX(engine, p.side);
  const maxAx = atk * line - 0.8;
  if (atk * gx > maxAx) return atk * maxAx;
  return gx;
}

function attackDuty(p, ctx, tai, time, S) {
  const engine = ctx.engine;
  const b = engine.ball;
  const ai = p.ai;
  const atk = p.isHome ? 1 : -1;
  const aBall = atk * b.x;
  const carrier = S.carrier;
  const tac = tacticalTarget(p, b, tai.phase, p.isHome);
  const role = p.role;
  const counter =
    tai.phase === PHASE.COUNTER_ATTACK || tai.phase === PHASE.TRANSITION_TO_ATTACK;

  // Extremos y delantero en transición: atacan la profundidad.
  if (counter && (role === "LW" || role === "RW" || role === "ST")) {
    const line = opponentDefLine(engine, p.side, atk);
    const mySide = role === "LW" ? -1 : role === "RW" ? 1 : Math.sign(p.homeSpot.z) || 1;
    ai.state = ST.ATTACKING;
    // Fase D: la carrera se contiene en la línea del fuera de juego.
    setBaseGoal(p, holdOffsideLine(engine, p, atk * Math.min(line + 5, 48)), mySide * 21, 0.95);
    return;
  }

  // Los 2–3 más cercanos al poseedor forman triángulos de pase.
  if (S.nearRank >= 0 && S.nearRank < 3 && carrier) {
    const slots = [
      { da: -6, dz: 8 },
      { da: -6, dz: -8 },
      { da: -11, dz: 0 },
    ];
    const s = slots[S.nearRank];
    ai.state = ST.SUPPORT;
    const gx = carrier.x + atk * s.da;
    const gz = carrier.z + s.dz;
    setBaseGoal(p, gx * 0.78 + tac.x * 0.22, gz * 0.78 + tac.z * 0.22, 0.7);
    return;
  }

  if (role === "LW" || role === "RW") {
    // Abren el campo: banda del lado del balón (o contraria, más centrados).
    const mySide = role === "LW" ? -1 : 1;
    const ballSide = Math.sign(b.z) || mySide;
    const wide = ballSide === mySide ? 27 : 19;
    const ax = clamp(aBall + 12, -40, 42);
    ai.state = ST.ATTACKING;
    setBaseGoal(p, atk * ax, mySide * wide, 0.75);
    return;
  }

  if (role === "ST") {
    // ¿Hueco entre centrales? Carrera en profundidad; si no, apoyo de espaldas.
    let gap = 0;
    const defs = [];
    for (const o of engine.players) {
      if (o.side === p.side || o.role === "GK") continue;
      if (atk * o.x < aBall + 14 && atk * o.x > aBall - 16) defs.push(o.z);
    }
    defs.sort((a, z) => a - z);
    for (let i = 1; i < defs.length; i++) gap = Math.max(gap, defs[i] - defs[i - 1]);
    if (gap > 7 && carrier && atk * (carrier.x - p.x) < 4) {
      const line = opponentDefLine(engine, p.side, atk);
      ai.state = ST.ATTACKING;
      // Fase D: la carrera en profundidad se contiene en la línea del fuera
      // de juego (el pase al hueco ya evita al receptor adelantado).
      setBaseGoal(p, holdOffsideLine(engine, p, atk * Math.min(line + 4, 48)), p.z * 0.6, 0.95);
    } else if (carrier) {
      ai.state = ST.SUPPORT;
      setBaseGoal(p, carrier.x + atk * 6, carrier.z * 0.8, 0.7);
    } else {
      ai.state = ST.POSITIONING;
      setBaseGoal(p, tac.x, tac.z, 0.5);
    }
    return;
  }

  if (role === "LB" || role === "RB") {
    // Solo el lateral del lado del balón sube a doblar; nunca los dos.
    const mySide = role === "LB" ? -1 : 1;
    const ballSide = Math.sign(b.z) || 0;
    if (ballSide === mySide && carrier) {
      const wingerAdv = engine.players.some(
        (m) =>
          m.side === p.side &&
          (m.role === "LW" || m.role === "RW") &&
          Math.sign(m.homeSpot.z) === mySide &&
          atk * m.x > aBall - 6
      );
      const dmBack = engine.players.some(
        (m) => m.side === p.side && m.role === "DM" && atk * m.x < atk * p.x + 4
      );
      if (wingerAdv && dmBack) {
        ai.state = ST.ATTACKING;
        setBaseGoal(p, b.x + atk * 9, mySide * 25, 0.85);
        return;
      }
    }
    ai.state = ST.POSITIONING;
    setBaseGoal(p, tac.x, tac.z, 0.5);
    return;
  }

  // Centrocampistas: uno se queda en cobertura, el resto ofrece líneas de pase
  // a distintas alturas; llegada desde segunda línea en el último tercio.
  if (aBall > 28 && (role === "CM" || role === "AM")) {
    ai.state = ST.ATTACKING;
    setBaseGoal(p, atk * 38, b.z * 0.35, 0.8);
    return;
  }
  if (S.holderUid === p.uid) {
    ai.state = ST.POSITIONING; // el pivote más retrasado: cobertura
    setBaseGoal(p, tac.x, tac.z, 0.45);
    return;
  }
  ai.state = ST.SUPPORT;
  const spread = (p.ai.offZ >= 0 ? 1 : -1) * 7;
  setBaseGoal(
    p,
    (tac.x + (carrier ? carrier.x - atk * 9 : tac.x)) / 2,
    tac.z * 0.6 + spread * 0.4,
    0.65
  );
}

// ---------------------------------------------------------------------------
// Deberes defensivos (el rival tiene el balón)
// ---------------------------------------------------------------------------

function defendDuty(p, ctx, tai, time, S) {
  const engine = ctx.engine;
  const b = engine.ball;
  const ai = p.ai;
  const atk = p.isHome ? 1 : -1;
  const gx = -atk * FIELD.halfLength; // mi portería
  const tac = tacticalTarget(p, b, tai.phase, p.isHome);
  const ballSp = Math.hypot(b.vx, b.vz);

  // 1) Presionador: al balón suelto va A POR ÉL; al poseedor lo contiene por
  // el lado de su portería (cerrando la progresión) y entra con timing.
  if (p.uid === tai.presserUid) {
    ai.state = ST.PRESSING;
    let carrier = null;
    for (const q of engine.players) {
      if (q.hasBall && q.side !== p.side) {
        carrier = q;
        break;
      }
    }
    const tx = carrier ? carrier.x : b.x;
    const tz = carrier ? carrier.z : b.z;

    // Timing de la entrada: ir al cuerpo para que la entrada conecte
    // (resolveTackle necesita d < 1.05).
    let diveIn = !carrier; // balón suelto: a por él
    const dCarrier = carrier ? Math.hypot(p.x - tx, p.z - tz) : Infinity;
    // Si el poseedor está parado (no progresa ni amaga), contener a 1.4 m es
    // eterno: el presionador entra a distancia de poke (0.6 m) para
    // disputarla. Sin esto, un portador quieto retiene el balón para siempre.
    // Excepción a petición del usuario: si el parado es ÉL (controlado por
    // teclado), se contiene sin entrar: conserva el balón mientras no lo
    // juegue (no hay poke contra el usuario; para quitársela hay que
    // entrarle o que la deje suelta de verdad).
    const userHolding =
      carrier && carrier.controlled && Math.hypot(carrier.vx, carrier.vz) < 0.6;
    if (carrier && !userHolding && dCarrier < 2.4 && Math.hypot(carrier.vx, carrier.vz) < 0.6) {
      diveIn = true;
    }
    if (carrier && p.tackleCd <= 0) {
      const d = Math.hypot(p.x - tx, p.z - tz);
      if (d < 1.8) {
        const ballLoose =
          Math.hypot(carrier.x - b.x, carrier.z - b.z) > 0.85;
        // Poseedor de espaldas a mi portería.
        const gdx = gx - tx;
        const gdz = 0 - tz;
        const gl = Math.hypot(gdx, gdz) || 1;
        const backToGoal =
          (Math.cos(carrier.facing) * gdx + Math.sin(carrier.facing) * gdz) / gl <
          -0.25;
        const inMyBox = Math.hypot(gx - tx, tz) < 18;
        // Al portador parado y con el balón pegado no se le barre (sería
        // falta casi segura: resolveTackle exige llegar al balón primero);
        // se le disputa con el poke al entrar a distancia.
        const staticClose =
          Math.hypot(carrier.vx, carrier.vz) < 0.6 && !ballLoose;
        // Fase D: apercibido de amarilla => contiene en vez de barrer (evita
        // la segunda amarilla), salvo dentro del área donde hay que entrar.
        const onYellow = p.cards && p.cards.yellow > 0 && !p.cards.red;
        const cautious = onYellow && !inMyBox && engine.rng() < 0.55;
        if (!cautious && !staticClose && (ballLoose || backToGoal || (inMyBox && engine.rng() < 0.4))) {
          startTackle(engine, p, { x: b.x - p.x, z: b.z - p.z });
          diveIn = true;
        }
      }
    }
    if (diveIn) {
      // Balón suelto: CORTAR su trayectoria por delante (looseBallPickup),
      // no perseguirlo por detrás (eso encadena malos toques: "pinball").
      // A ritmo vivo (0.9) para llegar al corte a tiempo.
      if (!carrier) {
        goPickup(p, b, looseBallPickup(p, b), 0.9);
        tryLooseTackle(engine, p);
      } else if (Math.hypot(carrier.vx, carrier.vz) < 0.6) {
        // Portador parado: ir AL BALÓN (a sus pies), no al centro del
        // portador. La separación entre jugadores es 0,7 m: yendo al balón
        // el presionador queda del lado del balón y el poke (< 0,6 m) llega.
        setGoal(p, b.x, b.z, 1.0);
      } else setGoal(p, tx, tz, 1.0);
    } else {
      // Contención: entre el poseedor y mi portería, con ligera anticipación
      // a su desplazamiento para no llegar siempre tarde.
      const ltx = carrier ? tx + carrier.vx * 0.25 : tx;
      const ltz = carrier ? tz + carrier.vz * 0.25 : tz;
      const dx = gx - ltx;
      const dz = 0 - ltz;
      const l = Math.hypot(dx, dz) || 1;
      // Al usuario parado se le contiene de lejos y sin prisa: ni se le entra.
      // (Llegar suave evita sobrepasar y acabar pegado; la zona de exclusión
      // es la red de seguridad: si ya está a <1,5 m, retrocede radialmente
      // en vez de atravesarlo — atravesarlo lo desplazaría con
      // separatePlayers lejos de su propio balón hasta "escapársele".)
      if (userHolding) {
        if (dCarrier < 1.5) {
          const bx = p.x - tx, bz = p.z - tz;
          const bl = Math.hypot(bx, bz) || 1;
          setGoal(p, tx + (bx / bl) * 2.0, tz + (bz / bl) * 2.0, 0.5);
        } else {
          setGoal(p, ltx + (dx / l) * 2.2, ltz + (dz / l) * 2.2, 0.5);
        }
      } else {
        setGoal(p, ltx + (dx / l) * 1.4, ltz + (dz / l) * 1.4, 0.95);
      }
    }
    return;
  }

  // 2) Segundo hombre: cobertura a 3–5 m por detrás del presionador.
  if (p.uid === tai.coverUid) {
    const pr = S.presser;
    ai.state = ST.DEFENDING;
    if (pr) {
      const dx = gx - pr.x;
      const dz = 0 - pr.z;
      const l = Math.hypot(dx, dz) || 1;
      setBaseGoal(p, pr.x + (dx / l) * 4, pr.z + (dz / l) * 4, 0.8);
    } else {
      setBaseGoal(p, tac.x, tac.z, 0.6);
    }
    return;
  }

  // 3) Repliegue rápido tras la pérdida (transición defensiva).
  if (tai.phase === PHASE.TRANSITION_TO_DEFENCE && S.recovering.has(p.uid)) {
    ai.state = ST.RECOVERING;
    setBaseGoal(p, tac.x - atk * 3, tac.z, 0.95);
    return;
  }

  // 4) Interceptación: un pase viaja y estoy en su trayectoria.
  let poss = false;
  for (const q of engine.players) {
    if (q.hasBall) {
      poss = true;
      break;
    }
  }
  if (!poss && ballSp > 5 && b.y < 1.6) {
    const rx = p.x - b.x;
    const rz = p.z - b.z;
    const v2 = b.vx * b.vx + b.vz * b.vz || 1;
    const t = clamp((rx * b.vx + rz * b.vz) / v2, 0, 1.4);
    const px = b.x + b.vx * t;
    const pz = b.z + b.vz * t;
    const dPath = Math.hypot(p.x - px, p.z - pz);
    if (dPath < 2.4 && Math.hypot(px - b.x, pz - b.z) < 15) {
      ai.state = ST.INTERCEPTING;
      setGoal(p, px, pz, 0.95);
      return;
    }
  }

  // 5) Marcaje zonal con toques individuales: el rival más cercano en mi zona.
  const opps = ctx.opponents;
  let mark = null;
  let markD = 14;
  for (const o of opps) {
    if (o.role === "GK" || o.sentOff) continue;
    const d = Math.hypot(o.x - tac.x, o.z - tac.z);
    if (d < markD) {
      markD = d;
      mark = o;
    }
  }
  if (mark) {
    ai.state = ST.MARKING;
    const inBox = Math.hypot(gx - mark.x, mark.z) < 17;
    const k = inBox ? 0.38 : 0.16; // en el área, marcaje más estrecho (lado portería)
    setBaseGoal(
      p,
      mark.x + (gx - mark.x) * k,
      mark.z + (0 - mark.z) * k,
      0.7
    );
    return;
  }

  // 6) Sin marca asignada: mantener la estructura.
  ai.state = ST.POSITIONING;
  setBaseGoal(p, tac.x, tac.z, 0.45);
}

// ---------------------------------------------------------------------------
// Decisión por jugador
// ---------------------------------------------------------------------------

function decidePlayer(p, ctx, tai, time, S) {
  const engine = ctx.engine;
  const b = engine.ball;
  const ai = p.ai;

  if (p.hasBall && !ai.hadBall) {
    ai.hadBall = true;
    ai.gotBallT = time;
  } else if (!p.hasBall) {
    ai.hadBall = false;
  }

  // El poseedor (cerebro ofensivo).
  if (p.hasBall) {
    carrierBrain(p, ctx, tai, time, S);
    return;
  }

  // Receptor esperado del pase en curso: ir al PUNTO DE DESTINO que calculó
  // la primitiva de pase (engine.passSpot) y esperar allí. El balón viene
  // hacia ese punto; perseguirlo activamente es contraproducente (el punto
  // de encuentro queda más allá y el receptor corre en dirección contraria).
  // Si el punto caducó, caer al balón.
  if (engine.passTarget === p.uid) {
    ai.state = ST.RECEIVING;
    const spot = engine.passSpot;
    if (spot && spot.uid === p.uid && engine.time < spot.until) {
      const dSpot = Math.hypot(p.x - spot.x, p.z - spot.z);
      if (dSpot < 2.5) {
        // Ya en posición: quieto y cuerpo orientado al balón que viene.
        // (Quieto el motor no toca facing; evita mal toque por ir de espaldas.)
        setGoal(p, p.x, p.z, 0.1);
        p.facing = Math.atan2(b.z - p.z, b.x - p.x);
      } else {
        setGoal(p, spot.x, spot.z, 0.95);
      }
    } else {
      // Punto caducado: recoger el balón suelto cortando por delante.
      const pk = looseBallPickup(p, b);
      goPickup(p, b, pk, 0.9);
    }
    return;
  }

  // Recogida oportunista: balón sin dueño, lento y bajo, muy cerca de mí y
  // soy quien más cerca está (incluye al presionador designado). Evita
  // interbloqueos cuando el balón queda suelto junto a la banda.
  if (S.looseBall && b.y < 0.8 && Math.hypot(b.vx, b.vz) < 3) {
    const dMe = Math.hypot(p.x - b.x, p.z - b.z);
    if (dMe < 3) {
      const pr = S.presser;
      const dPr = pr && pr !== p ? Math.hypot(pr.x - b.x, pr.z - b.z) : Infinity;
      if (dMe <= dPr) {
        ai.state = ST.RECOVERING;
        goPickup(p, b, looseBallPickup(p, b), 0.9);
        tryLooseTackle(engine, p);
        return;
      }
    }
  }

  if (S.myBall) attackDuty(p, ctx, tai, time, S);
  else defendDuty(p, ctx, tai, time, S);
}

function decideTeam(team, ctx, tai, time, dtDec) {
  const engine = ctx.engine;
  const isHome = team.isHome;
  const side = isHome ? "home" : "away";

  // Gancho de TEST (nunca activo en juego normal): engine._aiChaseAll = true
  // convierte al equipo en "todos al balón" para medir la dispersión base
  // contra la que se compara la IA colectiva. El portero y el controlado
  // quedan fuera igual que en la dispersión real.
  if (engine._aiChaseAll) {
    for (const p of team.players) {
      if (p.controlled || p.role === "GK") continue;
      ensureAI(p);
      p.ai.state = ST.PRESSING;
      setGoal(p, engine.ball.x, engine.ball.z, 0.95);
    }
    return;
  }

  const poss = possessionSide(engine, tai);
  updatePhase(tai, engine, isHome, poss, dtDec);
  const myBall = poss === side;

  let carrier = null;
  if (myBall) {
    for (const q of engine.players) {
      if (q.hasBall && q.side === side) {
        carrier = q;
        break;
      }
    }
  }

  if (!myBall) selectPresser(team, ctx, tai, time);
  else {
    tai.presserUid = null;
    tai.coverUid = null;
  }
  const presser = !myBall
    ? team.players.find((q) => q.uid === tai.presserUid) || null
    : null;

  // Ranking de cercanía al poseedor (triángulos de pase) y pivote en cobertura.
  let nearList = [];
  let holderUid = null;
  if (myBall && carrier) {
    nearList = team.players
      .filter((q) => q !== carrier && !q.controlled && q.role !== "GK")
      .map((q) => ({ p: q, d: Math.hypot(q.x - carrier.x, q.z - carrier.z) }))
      .sort((a, z) => a.d - z.d);
    // El centrocampista más retrasado se queda en cobertura.
    let deepest = null;
    let deepestA = Infinity;
    const atk = attackDir(isHome);
    for (const q of team.players) {
      if (q.controlled || q.role === "GK") continue;
      if (!["DM", "CM", "AM"].includes(q.role)) continue;
      const a = atk * q.x;
      if (a < deepestA) {
        deepestA = a;
        deepest = q;
      }
    }
    holderUid = deepest ? deepest.uid : null;
  }

  // Repliegue: los 2 más cercanos al balón (no presionador) en transición defensiva.
  const recovering = new Set();
  if (tai.phase === PHASE.TRANSITION_TO_DEFENCE) {
    const cands = team.players
      .filter(
        (q) => !q.controlled && q.role !== "GK" && q.uid !== tai.presserUid
      )
      .map((q) => ({ q, d: Math.hypot(q.x - engine.ball.x, q.z - engine.ball.z) }))
      .sort((a, z) => a.d - z.d)
      .slice(0, 2);
    for (const c of cands) recovering.add(c.q.uid);
  }

  const S = {
    myBall,
    carrier,
    presser,
    holderUid,
    recovering,
    // Balón sin dueño (nadie lo tiene agarrado): permite recogidas oportunistas.
    looseBall: !engine.players.some((q) => q.hasBall),
    nearRankOf: new Map(),
  };
  nearList.forEach((e, i) => S.nearRankOf.set(e.p.uid, i));

  for (const p of team.players) {
    if (p.controlled || p.sentOff) continue;
    ensureAI(p);
    if (time < p.ai.reactT) continue; // reacción individual escalonada
    p.ai.reactT = time + p.ai.react;
    if (p.role === "GK") {
      gkDecide(p, team, ctx, tai, time);
      continue;
    }
    const sub = { ...S, nearRank: S.nearRankOf.has(p.uid) ? S.nearRankOf.get(p.uid) : -1 };
    decidePlayer(p, ctx, tai, time, sub);
  }

  // Fase D: cobertura — cada jugador conoce a su compañero activo más
  // cercano; el steering mezcla ligeramente su posición para mantener la
  // estructura defensiva compacta tras expulsiones y transiciones.
  for (const p of team.players) {
    if (p.controlled || p.sentOff || p.role === "GK" || !p.ai) continue;
    let best = null, bd = Infinity;
    for (const q of team.players) {
      if (q === p || q.role === "GK" || q.sentOff) continue;
      const d = Math.hypot(q.x - p.x, q.z - p.z);
      if (d < bd) { bd = d; best = q; }
    }
    p.ai.coverSpot = best ? { x: best.x, z: best.z } : null;
  }

  // Debug para la Fase F (solo si el flag está activo).
  if (typeof window !== "undefined" && window.__AI_DEBUG) {
    if (!engine.aiDebug) engine.aiDebug = {};
    for (const p of team.players) {
      if (p.controlled) continue;
      engine.aiDebug[p.uid] = { s: p.ai ? p.ai.state : "?", ph: tai.phase };
    }
  }
}

// ---------------------------------------------------------------------------
// Steering por frame (O(n) por jugador, separación simple de compañeros)
// ---------------------------------------------------------------------------

function steerPlayer(p, mates, tai) {
  const ai = p.ai;
  let gx = ai.goal.x;
  let gz = ai.goal.z;
  // Fase D: mezcla con la cobertura (compañero más cercano) para compactar.
  if (ai.coverSpot) {
    gx = gx * 0.75 + ai.coverSpot.x * 0.25;
    gz = gz * 0.75 + ai.coverSpot.z * 0.25;
  }
  let sx = 0;
  let sz = 0;
  for (const q of mates) {
    if (q === p || q.role === "GK" || q.controlled) continue;
    const dx = p.x - q.x;
    const dz = p.z - q.z;
    const d2 = dx * dx + dz * dz;
    if (d2 > 0.0001 && d2 < 4.84) {
      const d = Math.sqrt(d2);
      const w = (2.2 - d) / d;
      sx += dx * w;
      sz += dz * w;
    }
  }
  p.moveTarget = { x: gx + sx * 1.4, z: gz + sz * 1.4 };
  let spd = p.maxSpeed * ai.speedF;
  // Fase 5: el presionador rival corre según la dificultad (topado por
  // maxSpeed: es decisión, no trampa física).
  if (tai && p.uid === tai.presserUid) spd *= (tai.pressMult || 1);
  p.desiredSpeed = spd;
  p.aiActive = true;
}

/**
 * Tick de IA de un equipo. Firma de la Fase A (el motor la llama cada paso).
 * @param {object} team { players, isHome, formation }
 * @param {object} ctx { ball, time, engine, opponents, controlledUid }
 * @param {number} dt paso fijo
 */
export function aiTick(team, ctx, dt) {
  const engine = ctx.engine;
  if (!engine) return; // ctx sin motor: no hay IA colectiva
  // Fase D: con el balón parado no hay decisiones de juego abierto; la IA
  // se coloca en las posiciones reglamentarias (decideDeadBall, en
  // game/deadball.js) en vez de disputar o presionar.
  const dbState = engine.deadBall ? engine.deadBall.state : DB.OPEN;
  if (dbState === DB.SETUP || dbState === DB.READY) {
    decideDeadBall(team, ctx);
    return;
  }
  const tai = getTeamAI(engine, team.isHome);
  const time = ctx.time;
  // Fase 5: cada lado decide a su ritmo (el rival escala con la dificultad;
  // tu equipo siempre a 12 Hz) y presiona a su ritmo.
  const dp = paramsFor(engine, team.isHome ? "home" : "away");
  tai.pressMult = dp.pressSpeed;

  tai.acc += dt;
  const step = 1 / dp.hz;
  if (tai.acc >= step) {
    tai.acc = 0;
    decideTeam(team, ctx, tai, time, step);
  }

  for (const p of team.players) {
    if (p.controlled || p.role === "GK" || p.sentOff) continue;
    ensureAI(p);
    steerPlayer(p, team.players, tai);
  }
}

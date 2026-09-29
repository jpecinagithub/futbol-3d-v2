// Sistema arbitral — Fase D (reescritura del provisional de la Fase B).
//
// registerFoul(engine, f): el árbitro decide si la entrada es falta.
// Acepta los nombres nuevos y los antiguos (by/infractor, victim/victima,
// touchedBallFirst/tocoBalonPrimero, intensity/intensidad, speed/velocidad,
// dir/direccion, zona, fromBehind/porDetras).
//
// - Probabilidad de pitar: depende de si tocó balón primero, la intensidad,
//   la dirección (por detrás), la velocidad y el contexto (zona peligrosa,
//   contraataque rival). Los extremos son deterministas (balón primero =
//   limpio; entrada muy dura = falta) y la zona gris es probabilística.
// - Tarjetas: amarilla (juego duro, por detrás, táctica), roja directa
//   (ocasión manifiesta / entrada violentísima), doble amarilla => roja.
// - Expulsión: el jugador queda inactivo (sentOff) y la IA redistribuye;
//   si expulsan al controlado, el usuario pasa al compañero más cercano.
// - Reanudación: libre directo/indirecto o penalti según la zona, con la
//   mini-máquina de balón parado de deadball.js (sin muros arcade).
// - Hook determinista para tests: engine.__foulHook = { whistle: bool }.

import { FIELD } from "./constants";
import { clamp } from "../utils/math";
import { crowdBoo } from "../audio/audioEngine";
import { enterDeadBall, bumpStat } from "./deadball";

let foulSeq = 0;

/**
 * Probabilidad de que el árbitro pite la entrada (0..1).
 * Determinista en los extremos para que el juego sea legible:
 *  - tocó balón primero => nunca es falta;
 *  - intensidad >= 0.85 sin balón => siempre es falta;
 *  - intensidad < 0.35 de frente => hombro con hombro legal.
 * En la zona gris la probabilidad crece con la intensidad, por detrás,
 * en zona peligrosa, al corte de un contraataque y a alta velocidad.
 */
export function foulProbability(f) {
  if (f.touchedBallFirst) return 0;
  if (f.intensity >= 0.85) return 1;
  if (f.intensity < 0.35 && !f.fromBehind) return 0;
  let p = 0.25 + (f.intensity - 0.35) * 1.1;
  if (f.fromBehind) p += 0.25;
  if (f.tactical) p += 0.15;
  if (f.zoneDanger) p += 0.1;
  if (f.speed > 7) p += 0.1;
  return clamp(p, 0, 1);
}

/** Contexto de la falta para la tarjeta: DOGSO, táctica, zona peligrosa. */
function foulContext(engine, by, victim) {
  const atk = victim.isHome ? 1 : -1;      // a qué portería atacaba la víctima
  const gx = atk * FIELD.halfLength;
  const dGoal = Math.hypot(gx - victim.x, victim.z);
  const zoneDanger = dGoal < 28;
  // ¿Era el último defensor (sin contar al portero)? => ocasión manifiesta.
  let lastMan = dGoal < 26 && Math.abs(victim.z) < 16;
  if (lastMan) {
    for (const o of engine.players) {
      if (o.side === victim.side || o === by || o.sentOff || o.role === "GK") continue;
      if (atk * o.x > atk * victim.x - 1) { lastMan = false; break; }
    }
  }
  // ¿Corta un contraataque? (fase colectiva de la víctima)
  let tactical = false;
  try {
    const tai = engine._ai ? engine._ai[victim.side] : null;
    if (tai && tai.phase === "COUNTER_ATTACK") tactical = true;
  } catch { /* sin IA colectiva */ }
  return { dGoal, zoneDanger, dogso: lastMan, tactical };
}

/**
 * Tarjeta: 'none' | 'yellow' | 'yellow2' (doble amarilla) | 'red'.
 * Sistema de puntos: dureza (1-2), por detrás (1), táctica (1).
 * La roja directa es para DOGSO o entradas violentísimas.
 */
export function decideCard(engine, by, f, ctx) {
  if (ctx.dogso) return "red";
  let pts = 0;
  if (f.intensity > 0.7) pts += 1;
  if (f.intensity > 0.88) pts += 1;
  if (f.fromBehind) pts += 1;
  if (ctx.tactical) pts += 1;
  if (f.intensity > 0.94 && f.fromBehind) return "red";
  if (pts >= 3) return "red";
  if (by.cards.yellow > 0 && pts >= 1) return "yellow2";
  if (pts >= 2) return "yellow";
  if (pts >= 1) return engine.rng() < 0.45 ? "yellow" : "none";
  return "none";
}

/** Expulsión: el jugador queda inactivo; la IA redistribuye (lo ignora). */
function sendOff(engine, p) {
  p.cards.red = true;
  p.sentOff = true;
  p.hasBall = false;
  p.tackleT = 0;
  p.dashT = 0;
  p.dashCd = 0;
  p.tackleCd = 0;
  p.moveTarget = null;
  p.aiActive = false;
  // Si era el controlado, el usuario pasa al compañero activo más cercano.
  if (p.controlled) {
    let best = null, bd = Infinity;
    for (const q of engine.players) {
      if (q.side !== p.side || q.sentOff || q === p) continue;
      const d = Math.hypot(q.x - engine.ball.x, q.z - engine.ball.z);
      if (d < bd) { bd = d; best = q; }
    }
    p.controlled = false;
    if (best) {
      best.controlled = true;
      engine.controlledUid = best.uid;
    }
  }
  // Si expulsan al portero, un compañero ocupa la portería (emergencia).
  if (p.role === "GK") {
    let best = null, bd = Infinity;
    for (const q of engine.players) {
      if (q.side !== p.side || q.sentOff || q === p || q.role === "GK") continue;
      const d = Math.hypot(q.x - p.x, q.z - p.z);
      if (d < bd) { bd = d; best = q; }
    }
    if (best) {
      best.role = "GK";
      best.homeSpot = { x: p.homeSpot.x, z: p.homeSpot.z };
      best.maxSpeed = Math.min(best.maxSpeed, 7.6);
    }
  }
}

const CARD_REASON = {
  yellow: "juego duro",
  yellow2: "doble amarilla",
  red: "juego violento",
};

/**
 * El árbitro juzga una entrada. Devuelve el acta de la falta o null si
 * deja seguir jugando.
 */
export function registerFoul(engine, f = {}) {
  const by = f.infractor || f.by;
  const victim = f.victima || f.victim;
  if (!by || !victim || by.sentOff || victim.sentOff) return null;
  const dbState = engine.deadBall ? engine.deadBall.state : "OPEN_PLAY";
  if (dbState !== "OPEN_PLAY" && dbState !== "DEAD_BALL_EXECUTED") return null;

  const touchedBallFirst = !!(f.tocoBalonPrimero ?? f.touchedBallFirst);
  const intensity = clamp(f.intensidad ?? f.intensity ?? 0.5, 0, 1.5);
  const speed = f.velocidad ?? f.speed ?? Math.hypot(by.vx || 0, by.vz || 0);
  const fromBehind = !!(f.porDetras || f.fromBehind);

  const ctx = foulContext(engine, by, victim);
  const prob = foulProbability({ touchedBallFirst, intensity, fromBehind, speed, tactical: ctx.tactical, zoneDanger: ctx.zoneDanger });

  // Hook determinista de tests (evita tests probabilísticos inestables).
  const hook = engine.__foulHook;
  const whistled = hook && typeof hook.whistle === "boolean" ? hook.whistle : engine.rng() < prob;
  if (!whistled) return null;

  const card = decideCard(engine, by, { intensity, fromBehind }, ctx);
  foulSeq += 1;
  const rec = {
    id: foulSeq,
    t: engine.time,
    // Fase 9: minuto de partido para el historial de eventos.
    minute: Math.floor(engine.matchTime / 60) + 1,
    by,
    byUid: by.uid,
    byName: by.data.name,
    bySide: by.side,
    victim,
    victimUid: victim.uid,
    victimName: victim.data.name,
    touchedBallFirst,
    intensity,
    fromBehind,
    card,                       // 'none' | 'yellow' | 'yellow2' | 'red'
    spot: { x: victim.x, z: victim.z },
    prob: +prob.toFixed(3),
  };
  engine.fouls.push(rec);
  bumpStat(engine, by.side, "fouls");
  // Fase 8: la víctima se duele en el suelo un instante.
  victim.anim.action = "fall";
  victim.anim.timer = 0.9;

  // Tarjetas y expulsiones.
  let cardText = "";
  if (card === "yellow" || card === "yellow2") {
    by.cards.yellow += 1;
    bumpStat(engine, by.side, "yellow");
  }
  if (card === "yellow2" || card === "red") {
    bumpStat(engine, by.side, "red");
    sendOff(engine, by);
  }
  if (card === "yellow") cardText = ` 🟨 Amarilla para ${by.data.name} (${CARD_REASON.yellow})`;
  else if (card === "yellow2") cardText = ` 🟨🟥 ¡Expulsado ${by.data.name} por doble amarilla!`;
  else if (card === "red") cardText = ` 🟥 ¡Roja directa para ${by.data.name}! (${ctx.dogso ? "ocasión manifiesta" : CARD_REASON.red})`;
  // Abucheo tenue de la grada ante la dureza (Fase E).
  if (card !== "none") {
    try { crowdBoo(); } catch { /* sin audio */ }
  }

  // Compatibilidad con la Fase B (tests antiguos): freeze corto del aviso.
  engine.foulFreeze = 1.5;
  by.tackleT = 0;

  // Reanudación: penalti si el defensor hace falta dentro de su área;
  // si no, libre directo desde el punto (indirecto no: la falta es directa).
  const byGoalX = by.isHome ? -FIELD.halfLength : FIELD.halfLength;
  const inByBox =
    Math.abs(victim.x - byGoalX) < FIELD.boxDepth && Math.abs(victim.z) < FIELD.boxWidth / 2;
  const notice = `Falta de ${by.data.name}${cardText}`;
  if (inByBox) {
    // (el "penalties" lo cuenta enterDeadBall; aquí no se duplica)
    enterDeadBall(engine, "penalty", {
      takerSide: victim.side,
      notice: `¡Penalti! ${notice}`,
      whistle: 0.8,
    });
  } else {
    enterDeadBall(engine, "free-kick", {
      takerSide: victim.side,
      spot: { x: clamp(victim.x, -52, 52), z: clamp(victim.z, -33.5, 33.5) },
      indirect: false,
      notice,
      whistle: 0.6,
    });
  }
  return rec;
}

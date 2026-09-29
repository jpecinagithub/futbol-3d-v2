// Balón parado — Fase D: arbitraje de salidas, faltas, tarjetas y reanudaciones.
//
// Mini-máquina de estados del balón parado (la IA la consulta para no
// disputar durante la colocación):
//   OPEN_PLAY -> DEAD_BALL_SETUP -> DEAD_BALL_READY -> DEAD_BALL_EXECUTED -> OPEN_PLAY
// - SETUP: freeze breve; los 22 se colocan en sus posiciones reglamentarias
//   simplificadas (decideDeadBall, en vez del decideTeam normal).
// - READY: el balón está quieto; si saca la IA ejecuta en 1.5–2.5 s; si saca
//   el usuario, apunta con IJKL y ejecuta con A (toque: saque; mantener: tiro con carga).
// - EXECUTED: el saque ya se ejecutó (1 s); el juego es abierto pero la IA
//   sabe que viene de una reanudación; al terminar se resetean las fases
//   colectivas (el que saca, a atacar).
//
// Tipos: 'throw-in' (banda), 'corner' (córner), 'goal-kick' (puerta),
// 'free-kick' (tiro libre, directo o indirecto), 'penalty' (penalti).

import { FIELD, BALL } from "./constants";
import { clamp } from "../utils/math";
import { kickBall } from "../physics/ballPhysics";
import { doGroundPass, doCross } from "./passing";
import { whistle } from "../audio/audioEngine";
import { useMatchStore } from "../stores/useMatchStore";
import { snapshotPass, clearOffsideWatch } from "./offside";
import { resetPhaseForRestart } from "../ai/teamPhases";
import { GK_STATES, gkPenaltyDive } from "../ai/goalkeeper";
import { ensureAI, ST } from "../ai/roles";
import { clearPossession } from "./possession";
import { releaseShot, startShotCharge, updateCharge, countShot } from "./shooting";

export const DB = {
  OPEN: "OPEN_PLAY",
  SETUP: "DEAD_BALL_SETUP",
  READY: "DEAD_BALL_READY",
  EXECUTED: "DEAD_BALL_EXECUTED",
};

// Saques de los que NO puede nacer un fuera de juego directo.
const EXEMPT_KINDS = new Set(["throw-in", "corner", "goal-kick"]);

// Límites de movimiento de jugadores (los mismos que en engine.js/ai).
const PLIM_X = 55, PLIM_Z = 36;

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

function freshDeadBall() {
  return {
    state: DB.OPEN,
    kind: null,          // tipo de reanudación
    indirect: false,     // libre indirecto (fuera de juego)
    takerSide: null,     // 'home' | 'away'
    kickerUid: null,     // lanzador designado
    keeperUid: null,     // portero que defiende (penalti)
    spot: { x: 0, z: 0 },// punto del balón
    atk: 1,              // dirección de ataque del que saca
    gx: FIELD.halfLength,// portería atacada (x)
    spots: {},           // uid -> {x,z} colocación
    t: 0,                // temporizador del estado (s reales)
    autoT: 0,            // cuenta atrás para la ejecución automática (IA)
    aim: { x: 1, z: 0 }, // puntería del usuario
    notice: null,        // aviso a mostrar en READY (p. ej. tarjeta)
    prevControlledUid: null,
    userKicking: false,  // el usuario ejecuta el saque
    userKeeping: false,  // el usuario defiende un penalti (controla al portero)
    keeperLean: 0,       // hacia dónde se inclina el portero del usuario
    keeperDive: null,    // {dir, t} estirada en curso del portero del usuario
  };
}

/** Estado inicial (también crea las estadísticas del partido). */
export function initDeadBall(engine) {
  engine.deadBall = freshDeadBall();
  engine.offsideWatch = null;
  engine.restartExempt = false;
  const fresh = () => ({ fouls: 0, yellow: 0, red: 0, corners: 0, offsides: 0, penalties: 0 });
  engine.stats = { home: fresh(), away: fresh() };
}

/** Reset entre saque inicial / tras gol (las estadísticas sobreviven). */
export function resetDeadBall(engine) {
  engine.deadBall = freshDeadBall();
  engine.offsideWatch = null;
  engine.restartExempt = false;
}

export function byUid(engine, uid) {
  if (!uid) return null;
  return engine.players.find((p) => p.uid === uid) || null;
}

function sideOfUid(engine, uid) {
  const p = byUid(engine, uid);
  return p ? p.side : null;
}

function defendingGk(engine, db) {
  for (const p of engine.players) {
    if (p.role === "GK" && p.side !== db.takerSide && !p.sentOff) return p;
  }
  return null;
}

/** Estadísticas por equipo (motor + store de zustand, base para la Fase E). */
export function bumpStat(engine, side, key) {
  if (engine.stats && engine.stats[side]) {
    engine.stats[side][key] = (engine.stats[side][key] || 0) + 1;
  }
  try {
    useMatchStore.getState().bumpStat(side, key);
  } catch { /* sin store (tests) */ }
}

let noticeTimer = null;
/** Aviso en el HUD. ms = 0 => persistente hasta que se limpie a mano. */
export function setDeadBallNotice(text, ms = 2600) {
  try {
    const st = useMatchStore.getState();
    st.setNotice(text);
    if (noticeTimer) { clearTimeout(noticeTimer); noticeTimer = null; }
    if (text && ms > 0) {
      noticeTimer = setTimeout(() => {
        try {
          const s = useMatchStore.getState();
          if (s.notice === text) s.setNotice(null);
        } catch { /* noop */ }
      }, ms);
    }
  } catch { /* sin store */ }
}

// ---------------------------------------------------------------------------
// Detección de salidas (sustituye a los muros arcade de la Fase A)
// ---------------------------------------------------------------------------

/**
 * El balón cruzó una línea del campo (llamar solo en juego abierto/ejecutado,
 * DESPUÉS de checkGoal). Determina banda / córner / puerta según la línea y
 * el último toque, y abre la secuencia de balón parado.
 */
export function checkOutOfBounds(engine) {
  const db = engine.deadBall;
  if (db.state !== DB.OPEN && db.state !== DB.EXECUTED) return;
  const b = engine.ball;
  const hl = FIELD.halfLength, hw = FIELD.halfWidth, r = BALL.radius;
  const lastSide = sideOfUid(engine, b.lastTouch);

  if (Math.abs(b.x) > hl + r) {
    // Línea de fondo. El local ataca la portería de +x.
    const attackerSide = b.x > 0 ? "home" : "away";
    const exit = { x: Math.sign(b.x) * hl, z: clamp(b.z, -hw, hw) };
    if (lastSide === attackerSide) {
      // El atacante la mandó fuera => saque de puerta para el defensor.
      enterDeadBall(engine, "goal-kick", {
        takerSide: attackerSide === "home" ? "away" : "home",
        exit,
      });
    } else {
      // El defensor la desvió => córner para el atacante.
      bumpStat(engine, attackerSide, "corners");
      enterDeadBall(engine, "corner", { takerSide: attackerSide, exit });
    }
  } else if (Math.abs(b.z) > hw + r) {
    // Línea de banda => saque de banda para el contrario al último toque.
    const takerSide = lastSide === "home" ? "away" : "home";
    enterDeadBall(engine, "throw-in", {
      takerSide,
      exit: { x: clamp(b.x, -hl, hl), z: Math.sign(b.z) * hw },
    });
  }
}

// ---------------------------------------------------------------------------
// Colocación reglamentaria simplificada
// ---------------------------------------------------------------------------

function ballSpotFor(kind, C) {
  const s = C.spot;
  switch (kind) {
    case "throw-in": {
      const sz = Math.sign(C.exit.z) || 1;
      return { x: C.exit.x, z: sz * (FIELD.halfWidth - 0.2) };
    }
    case "corner": {
      const sz = Math.sign(C.exit.z) || 1;
      return { x: C.atk * (FIELD.halfLength - 0.8), z: sz * (FIELD.halfWidth - 0.5) };
    }
    case "goal-kick": {
      const ogx = -C.atk * FIELD.halfLength;
      return { x: ogx + C.atk * 4.2, z: 0 };
    }
    case "penalty":
      return { x: C.gx - C.atk * FIELD.penaltySpot, z: 0 };
    default:
      return { x: clamp(s.x, -52, 52), z: clamp(s.z, -33.5, 33.5) };
  }
}

/**
 * Calcula la colocación de los 22 (uid -> {x,z}), el lanzador y su punto.
 * Reglas simplificadas: rivales a ≥9.15 m en córner/falta (barrera), ≥2 m en
 * banda, fuera del área en saque de puerta y penalti.
 */
function computeSpots(engine, kind, C) {
  const spots = {};
  const rng = engine.rng;
  const T = engine.players.filter((p) => p.side === C.takerSide && !p.sentOff);
  const D = engine.players.filter((p) => p.side !== C.takerSide && !p.sentOff);
  const gx = C.gx, atk = C.atk;
  const ogx = -atk * FIELD.halfLength;
  const set = (p, x, z) => {
    spots[p.uid] = { x: clamp(x, -PLIM_X, PLIM_X), z: clamp(z, -PLIM_Z, PLIM_Z) };
  };
  const byDist = (list, x, z) =>
    [...list].sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z));
  const outfield = (list) => list.filter((p) => p.role !== "GK");
  const gkOf = (list) => list.find((p) => p.role === "GK");
  // Puesto táctico desplazado hacia el balón (relleno para los no asignados).
  const fallback = (p, k = 0.35) =>
    set(p, p.homeSpot.x * (1 - k) + C.spot.x * k, p.homeSpot.z * (1 - k) + C.spot.z * k);

  let kicker = null;
  let kickerSpot = null;
  let keeperUid = null;
  const ball = C.spot;

  if (kind === "throw-in") {
    const sz = Math.sign(C.exit.z) || 1;
    const ex = C.exit.x;
    kicker = C.kickerOverride || byDist(outfield(T), ball.x, ball.z)[0] || gkOf(T);
    kickerSpot = { x: ex, z: sz * (FIELD.halfWidth + 0.9) };
    set(kicker, kickerSpot.x, kickerSpot.z);
    const tNear = byDist(outfield(T).filter((p) => p !== kicker), ex, sz * 30);
    if (tNear[0]) set(tNear[0], ex + 5.5, sz * 29.5);   // opción en corto
    if (tNear[1]) set(tNear[1], ex - 6, sz * 28);       // opción en corto
    for (const p of T) if (!spots[p.uid]) fallback(p, 0.4);
    const dNear = byDist(outfield(D), ex, sz * 34);
    if (dNear[0]) set(dNear[0], ex + 2.8, sz * (FIELD.halfWidth - 0.2)); // ≥2 m
    if (dNear[1]) set(dNear[1], ex - 2.8, sz * (FIELD.halfWidth - 0.2));
    for (const p of D) if (!spots[p.uid]) fallback(p, 0.3);
    const dgk = gkOf(D);
    if (dgk && !spots[dgk.uid]) fallback(dgk, 0.2);
  } else if (kind === "corner") {
    const sz = Math.sign(C.exit.z) || 1;
    kicker = C.kickerOverride || byDist(outfield(T), ball.x, ball.z)[0] || gkOf(T);
    kickerSpot = { x: atk * (FIELD.halfLength - 2.2), z: sz * (FIELD.halfWidth - 1.9) };
    set(kicker, kickerSpot.x, kickerSpot.z);
    // Rematadores al área.
    const boxSpots = [
      { x: gx - atk * 5.5, z: sz * 3.2 },   // primer palo
      { x: gx - atk * 6.5, z: -sz * 6.5 },  // segundo palo
      { x: gx - atk * 11, z: 0 },           // punto de penalti
      { x: gx - atk * 16.5, z: sz * 7.5 },  // frontal
      { x: gx - atk * 18, z: -sz * 4 },     // frontal
    ];
    const tNear = byDist(outfield(T).filter((p) => p !== kicker), gx - atk * 9, 0);
    tNear.slice(0, 5).forEach((p, i) => set(p, boxSpots[i].x, boxSpots[i].z));
    for (const p of T) if (!spots[p.uid]) fallback(p, 0.45);
    // Defensa: portero a la línea, uno al primer palo, marcajes al hombre.
    const dgk = gkOf(D);
    if (dgk) { set(dgk, gx - atk * 1.2, 0); keeperUid = dgk.uid; }
    const dNear = byDist(outfield(D), gx - atk * 8, 0);
    if (dNear[0]) set(dNear[0], gx - atk * 0.9, sz * 3.0); // palo
    dNear.slice(1, 5).forEach((p, i) => {
      const t = boxSpots[i % boxSpots.length];
      set(p, t.x + atk * 1.2, t.z * 0.95); // entre atacante y portería
    });
    for (const p of D) if (!spots[p.uid]) fallback(p, 0.3);
  } else if (kind === "goal-kick") {
    kicker = C.kickerOverride || byDist(outfield(T), ball.x, ball.z)[0] || gkOf(T);
    kickerSpot = { x: ogx + atk * 5.4, z: 1.6 };
    set(kicker, kickerSpot.x, kickerSpot.z);
    const tNear = byDist(outfield(T).filter((p) => p !== kicker), ogx + atk * 12, 0);
    const shorts = [
      { x: ogx + atk * 11, z: 7 }, { x: ogx + atk * 11, z: -7 },
      { x: ogx + atk * 15.5, z: 13.5 }, { x: ogx + atk * 15.5, z: -13.5 },
    ];
    tNear.slice(0, 4).forEach((p, i) => set(p, shorts[i].x, shorts[i].z));
    for (const p of T) if (!spots[p.uid]) fallback(p, 0.4);
    // Rivales fuera del área hasta que el balón esté en juego.
    for (const p of D) {
      const inBox = Math.abs(p.x - ogx) < FIELD.boxDepth + 2 && Math.abs(p.z) < FIELD.boxWidth / 2 + 2;
      if (inBox) set(p, ogx + atk * (FIELD.boxDepth + 3), clamp(p.z, -19, 19));
      else fallback(p, 0.3);
    }
  } else if (kind === "free-kick") {
    const fx = ball.x, fz = ball.z;
    const dGoal = Math.hypot(gx - fx, fz);
    kicker = C.kickerOverride || byDist(outfield(T), fx, fz)[0] || gkOf(T);
    kickerSpot = { x: fx - atk * 1.4, z: fz + 0.6 };
    set(kicker, kickerSpot.x, kickerSpot.z);
    const tNear = byDist(outfield(T).filter((p) => p !== kicker), fx, fz);
    if (tNear[0]) set(tNear[0], fx + atk * 3.5, fz + 7); // opción en corto
    if (dGoal < 38) {
      if (tNear[1]) set(tNear[1], gx - atk * 7, 5.5);
      if (tNear[2]) set(tNear[2], gx - atk * 11, 0);
    }
    for (const p of T) if (!spots[p.uid]) fallback(p, 0.4);
    // Barrera de 2–5 a 9.15 m si la falta está a <30 m de la portería.
    const dgk = gkOf(D);
    if (dGoal < 30) {
      const n = 2 + Math.floor(rng() * 4); // 2–5
      const dx = gx - fx, dz = 0 - fz;
      const l = Math.hypot(dx, dz) || 1;
      const ux = dx / l, uz = dz / l;
      const cx = fx + ux * 9.15, cz = fz + uz * 9.15;
      const px = -uz, pz = ux; // perpendicular
      const dNear = byDist(outfield(D), cx, cz);
      for (let i = 0; i < n && i < dNear.length; i++) {
        const off = (i - (n - 1) / 2) * 0.9;
        set(dNear[i], cx + px * off, cz + pz * off);
      }
      if (dgk) { set(dgk, gx - atk * 1.4, cz >= 0 ? -1.7 : 1.7); keeperUid = dgk.uid; }
    } else if (dgk) {
      set(dgk, gx - atk * 2.5, clamp(fz * 0.3, -3, 3));
      keeperUid = dgk.uid;
    }
    for (const p of D) if (!spots[p.uid]) fallback(p, 0.35);
  } else if (kind === "penalty") {
    kicker = C.kickerOverride || byDist(outfield(T), ball.x, ball.z)[0] || gkOf(T);
    kickerSpot = { x: gx - atk * (FIELD.penaltySpot + 1.8), z: 0 };
    set(kicker, kickerSpot.x, kickerSpot.z);
    const dgk = gkOf(D);
    if (dgk) { set(dgk, gx - atk * 0.9, 0); keeperUid = dgk.uid; }
    // El resto, fuera del área y del arco (9.15 m del punto).
    const psx = gx - atk * FIELD.penaltySpot;
    for (const p of [...T, ...D]) {
      if (spots[p.uid]) continue;
      let z = clamp(p.homeSpot.z, -21, 21);
      const bx = gx - atk * 21;
      if (Math.hypot(bx - psx, z) < 10) z = (z >= 0 ? 1 : -1) * 11;
      set(p, bx, z);
    }
  }

  return { spots, kickerUid: kicker ? kicker.uid : null, kickerSpot, keeperUid };
}

// ---------------------------------------------------------------------------
// Entrada / transiciones de estado
// ---------------------------------------------------------------------------

/**
 * Abre una secuencia de balón parado.
 * @param {object} engine
 * @param {string} kind 'throw-in'|'corner'|'goal-kick'|'free-kick'|'penalty'
 * @param {object} opts { takerSide, spot:{x,z}, exit:{x,z}, indirect, notice, whistle }
 */
export function enterDeadBall(engine, kind, opts = {}) {
  const db = engine.deadBall;
  // Si había un penalti con el usuario de portero, devolver el control antes.
  if (db.userKeeping) restoreControl(engine);

  const takerSide = opts.takerSide || "home";
  const atk = takerSide === "home" ? 1 : -1;
  const gx = atk * FIELD.halfLength;
  const C = { takerSide, atk, gx, spot: opts.spot || { x: 0, z: 0 }, exit: opts.exit || null, rng: engine.rng };

  // ¿Saca el equipo del usuario? Entonces el usuario ejecuta.
  const ctrl = byUid(engine, engine.controlledUid);
  const userKicking = !!ctrl && ctrl.side === takerSide && !ctrl.sentOff;
  if (userKicking) C.kickerOverride = ctrl;

  const spot = ballSpotFor(kind, C);

  // 1) Balón quieto en el punto.
  const b = engine.ball;
  b.x = spot.x; b.z = spot.z; b.y = BALL.radius;
  b.vx = 0; b.vy = 0; b.vz = 0; b.spin = 0;
  b.touchCooldown = 0.4;

  // 2) Colocación + limpieza de posesión.
  clearPossession(engine);
  const comp = computeSpots(engine, kind, { ...C, spot });
  engine.charge = null;
  engine.passTarget = null;
  engine.passTargetT = 0;
  engine.passFx = null;
  engine.passSpot = null;
  engine.helperUid = null;
  clearOffsideWatch(engine);
  engine.restartExempt = EXEMPT_KINDS.has(kind);
  if (kind === "penalty") bumpStat(engine, takerSide, "penalties");

  Object.assign(db, {
    state: DB.SETUP,
    kind,
    indirect: !!opts.indirect,
    takerSide,
    atk,
    gx,
    spot,
    spots: comp.spots,
    kickerUid: comp.kickerUid,
    keeperUid: comp.keeperUid,
    t: 0,
    autoT: 0,
    notice: opts.notice || null,
    prevControlledUid: null,
    userKicking,
    userKeeping: false,
    keeperLean: 0,
    keeperDive: null,
  });

  const kicker = byUid(engine, db.kickerUid);
  if (kicker) {
    b.lastTouch = kicker.uid;
    kicker.hasBall = true;
    kicker.touchTimer = 0.3;
  }
  if (userKicking && ctrl && kicker && ctrl.uid === kicker.uid && comp.kickerSpot) {
    // El usuario lanza: se coloca junto al punto de saque.
    ctrl.x = comp.kickerSpot.x;
    ctrl.z = comp.kickerSpot.z;
    ctrl.vx = 0; ctrl.vz = 0;
  }

  // Penalti en contra: el usuario toma el control del portero.
  if (kind === "penalty" && !userKicking && ctrl && ctrl.side !== takerSide) {
    const gk = defendingGk(engine, db);
    if (gk) {
      db.prevControlledUid = ctrl.uid;
      ctrl.controlled = false;
      gk.controlled = true;
      engine.controlledUid = gk.uid;
      db.keeperUid = gk.uid;
      db.userKeeping = true;
    }
  }

  if (opts.whistle) {
    try { whistle(opts.whistle); } catch { /* sin audio */ }
  }
  // El aviso (falta, tarjeta, fuera de juego...) se muestra desde el pitido,
  // no solo al llegar a READY.
  if (opts.notice) setDeadBallNotice(opts.notice, 0);
}

function restoreControl(engine) {
  const db = engine.deadBall;
  const prev = byUid(engine, db.prevControlledUid);
  const cur = byUid(engine, engine.controlledUid);
  if (prev && !prev.sentOff) {
    if (cur) cur.controlled = false;
    prev.controlled = true;
    engine.controlledUid = prev.uid;
  }
  db.prevControlledUid = null;
  db.userKeeping = false;
}

/** ¿Están todos colocados? (margen 1.1 m; los expulsados no cuentan). */
function allAtSpots(engine) {
  const db = engine.deadBall;
  for (const p of engine.players) {
    if (p.sentOff) continue;
    const s = db.spots[p.uid];
    if (!s) continue;
    if (Math.hypot(p.x - s.x, p.z - s.z) > 1.1) return false;
  }
  return true;
}

function defaultAim(db) {
  const s = db.spot;
  let tx, tz;
  switch (db.kind) {
    case "penalty":
    case "free-kick":
      tx = db.gx; tz = 0; break;
    case "corner":
      tx = db.gx - db.atk * 8; tz = 0; break;
    case "throw-in":
      tx = s.x * 0.5 + db.atk * 10; tz = 0; break;
    case "goal-kick":
      tx = db.atk * 25; tz = 0; break;
    default:
      tx = db.atk * 30; tz = 0;
  }
  const dx = tx - s.x, dz = tz - s.z;
  const l = Math.hypot(dx, dz) || 1;
  return { x: dx / l, z: dz / l };
}

/** SETUP -> READY: el balón ya está quieto y todos colocados. */
export function enterReady(engine) {
  const db = engine.deadBall;
  db.state = DB.READY;
  db.t = 0;
  db.aim = defaultAim(db);
  if (!db.userKicking) db.autoT = 1.5 + engine.rng() * 1.0; // la IA ejecuta en 1.5–2.5 s
  const kindName = {
    "throw-in": "Saque de banda",
    corner: "Córner",
    "goal-kick": "Saque de puerta",
    "free-kick": db.indirect ? "Libre indirecto" : "Tiro libre",
    penalty: "Penalti",
  }[db.kind] || "Balón parado";
  let txt = db.notice || kindName;
  if (!db.notice) {
    if (db.userKicking) {
      if (db.kind === "penalty") txt = "¡Penalti a favor! Apunta con IJKL · A para tirar (mantener: con carga)";
      else if (db.kind === "free-kick") txt = db.indirect
        ? "Libre indirecto: apunta con IJKL · toque de A para jugar en corto (el tiro directo no vale)"
        : "Tiro libre: apunta con IJKL · A para sacar (mantener: tiro con carga)";
      else txt = `${kindName}: apunta con IJKL · A para sacar`;
    } else if (db.userKeeping) {
      txt = "¡Penalti en contra! Mueve al portero con J/L y pulsa A para lanzarte";
    }
  }
  setDeadBallNotice(txt, 0);
}

/** Avanza los temporizadores de la máquina (llamar en SETUP/READY/EXECUTED). */
export function stepDeadBall(engine, dt) {
  const db = engine.deadBall;
  db.t += dt;
  if (db.state === DB.SETUP) {
    if (db.t >= 2.5 || allAtSpots(engine)) enterReady(engine);
  } else if (db.state === DB.READY) {
    if (!db.userKicking) {
      db.autoT -= dt;
      if (db.autoT <= 0) aiExecute(engine);
    } else if (db.t > 25) {
      aiExecute(engine); // failsafe anti-bloqueo (el usuario no ejecuta)
    }
  } else if (db.state === DB.EXECUTED) {
    if (db.t >= 1.0) finishExecuted(engine);
  }
}

/** EXECUTED -> OPEN_PLAY: resetea las fases colectivas según quién sacó. */
function finishExecuted(engine) {
  const db = engine.deadBall;
  const taker = db.takerSide;
  for (const isHome of [true, false]) {
    const tai = engine._ai ? engine._ai[isHome ? "home" : "away"] : null;
    if (tai) resetPhaseForRestart(tai, isHome, taker, engine.ball.x);
  }
  engine.restartExempt = false;
  Object.assign(db, {
    state: DB.OPEN, kind: null, indirect: false, takerSide: null,
    kickerUid: null, keeperUid: null, spots: {}, notice: null,
    userKicking: false, keeperDive: null,
  });
  setDeadBallNotice(null);
}

// ---------------------------------------------------------------------------
// Posicionamiento de la IA durante SETUP/READY (en vez de disputar)
// ---------------------------------------------------------------------------

/** La llama aiTick cuando el balón está parado: todos a su `spots[uid]`. */
export function decideDeadBall(team, ctx) {
  const engine = ctx.engine;
  const db = engine.deadBall;
  for (const p of team.players) {
    if (p.sentOff || p.controlled) continue; // al controlado lo mueve el motor
    ensureAI(p);
    const ai = p.ai;
    const s = db.spots[p.uid];
    if (s) {
      ai.goal.x = clamp(s.x, -PLIM_X, PLIM_X);
      ai.goal.z = clamp(s.z, -PLIM_Z, PLIM_Z);
      ai.speedF = 0.9;
    } else {
      ai.goal.x = p.x; ai.goal.z = p.z; ai.speedF = 0.15;
    }
    ai.state = ST.POSITIONING;
    p.moveTarget = { x: ai.goal.x, z: ai.goal.z };
    p.desiredSpeed = p.maxSpeed * ai.speedF;
    p.aiActive = true;
  }
}

// ---------------------------------------------------------------------------
// Ejecución
// ---------------------------------------------------------------------------

function freestMate(engine, p, maxD) {
  let best = null, bestScore = -Infinity;
  for (const q of engine.players) {
    if (q.side !== p.side || q === p || q.sentOff || q.role === "GK") continue;
    const d = Math.hypot(q.x - p.x, q.z - p.z);
    if (d > maxD) continue;
    let free = Infinity;
    for (const o of engine.players) {
      if (o.side === p.side || o.sentOff) continue;
      const od = Math.hypot(o.x - q.x, o.z - q.z);
      if (od < free) free = od;
    }
    const score = Math.min(free, 14) - d * 0.08;
    if (score > bestScore) { bestScore = score; best = q; }
  }
  return best;
}

function nearestMate(engine, p) {
  let best = null, bd = Infinity;
  for (const q of engine.players) {
    if (q.side !== p.side || q === p || q.sentOff || q.role === "GK") continue;
    const d = Math.hypot(q.x - p.x, q.z - p.z);
    if (d < bd) { bd = d; best = q; }
  }
  return best;
}

/** Despeje largo (cuando no hay pase claro). */
function kickLong(engine, kicker, atk) {
  const b = engine.ball;
  const a = Math.atan2(-kicker.z * 0.25, atk) + (engine.rng() - 0.5) * 0.35;
  kickBall(b, Math.cos(a), Math.sin(a), 24, 6.5, 0, kicker.uid);
  kicker.hasBall = false;
  kicker.anim.action = "kick";
  kicker.anim.timer = 0.3;
  snapshotPass(engine, kicker, null, {});
  engine.passFx = { x: kicker.x, z: kicker.z, dx: Math.cos(a), dz: Math.sin(a), len: 14, t: 0.4 };
}

/** Receptor probable del saque del usuario (cono de 30°): para el fuera de juego. */
function findAimReceiver(engine, kicker, dx, dz) {
  let best = null, bestScore = -Infinity;
  for (const q of engine.players) {
    if (q.side !== kicker.side || q === kicker || q.sentOff || q.role === "GK") continue;
    const vx = q.x - kicker.x, vz = q.z - kicker.z;
    const d = Math.hypot(vx, vz);
    if (d < 2 || d > 30) continue;
    const align = (vx * dx + vz * dz) / d;
    if (align < 0.86) continue;
    const score = align * 2 - d * 0.03;
    if (score > bestScore) { bestScore = score; best = q; }
  }
  return best;
}

/** Saque del usuario: X = raso, A = alto. */
function userRestartKick(engine, kicker, mode) {
  const db = engine.deadBall;
  const b = engine.ball;
  const high = mode === "high";
  let power, vy;
  switch (db.kind) {
    case "throw-in": power = high ? 15 : 12.5; vy = high ? 5 : 0.6; break;
    case "corner": power = high ? 17.5 : 16; vy = high ? 6.2 : 1.4; break;
    case "goal-kick": power = high ? 23 : 16; vy = high ? 7 : 1; break;
    case "free-kick": power = high ? 18 : 15; vy = high ? 6 : 0.8; break;
    case "penalty": power = high ? 13 : 16; vy = high ? 3.2 : 0.9; break; // X: colocado raso; A: picadita
    default: power = 14; vy = 1;
  }
  const l = Math.hypot(db.aim.x, db.aim.z) || 1;
  const dx = db.aim.x / l, dz = db.aim.z / l;
  kickBall(b, dx, dz, power, vy, 0, kicker.uid);
  // Los penaltis y libres directos cuentan como tiros.
  if (db.kind === "penalty" || db.kind === "free-kick") {
    countShot(engine, kicker, dx, dz, power, vy);
  }
  kicker.hasBall = false;
  kicker.anim.action = "kick";
  kicker.anim.timer = 0.3;
  kicker.kickCooldown = 0.4;
  const mate = findAimReceiver(engine, kicker, dx, dz);
  snapshotPass(engine, kicker, mate, { exempt: EXEMPT_KINDS.has(db.kind) });
  engine.passFx = { x: kicker.x, z: kicker.z, dx, dz, len: 10, t: 0.4 };
}

/** Penalti lanzado por la IA: al palo contrario al portero, con dispersión. */
function aiPenaltyKick(engine, kicker) {
  const db = engine.deadBall;
  const b = engine.ball;
  const rng = engine.rng;
  const gx = db.gx;
  const gk = defendingGk(engine, db);
  const q = (kicker.data.shooting || 70) / 100;
  let side = rng() < 0.5 ? -1 : 1;
  if (gk) side = gk.z >= 0 ? -1 : 1;
  const tz = side * (2.1 + rng() * 1.0);
  const power = 20 + rng() * 6;
  const vy = 0.5 + rng() * 1.7;
  const baseA = Math.atan2(tz - kicker.z, gx - kicker.x);
  const spread = (1 - q) * 0.055 + 0.012;
  const a = baseA + (((rng() + rng() + rng()) / 3) - 0.5) * 2 * spread * 1.4;
  kickBall(b, Math.cos(a), Math.sin(a), power, vy, 0, kicker.uid);
  countShot(engine, kicker, Math.cos(a), Math.sin(a), power, vy);
  kicker.hasBall = false;
  kicker.anim.action = "kick";
  kicker.anim.timer = 0.35;
  snapshotPass(engine, kicker, null, {});
  engine.camKick = 0.25;
}

/** Ejecución automática de la IA (banda/córner/puerta: pase al libre o despeje). */
function aiExecute(engine) {
  const db = engine.deadBall;
  if (db.state !== DB.READY) return;
  const kicker = byUid(engine, db.kickerUid);
  if (!kicker || kicker.sentOff) { afterExecution(engine); return; }
  const rng = engine.rng;
  const atk = db.atk, gx = db.gx;
  kicker.facing = Math.atan2(db.aim.z, db.aim.x);

  switch (db.kind) {
    case "throw-in": {
      const mate = freestMate(engine, kicker, 24);
      if (mate) doGroundPass(engine, kicker, null, mate);
      else kickLong(engine, kicker, atk);
      break;
    }
    case "corner":
      doCross(engine, kicker);
      break;
    case "goal-kick": {
      const mate = freestMate(engine, kicker, 20);
      if (mate) doGroundPass(engine, kicker, null, mate);
      else kickLong(engine, kicker, atk);
      break;
    }
    case "free-kick": {
      if (db.indirect) {
        const mate = nearestMate(engine, kicker);
        if (mate) doGroundPass(engine, kicker, null, mate);
        else kickLong(engine, kicker, atk);
        break;
      }
      const dGoal = Math.hypot(gx - kicker.x, kicker.z);
      if (Math.abs(kicker.z) > 12 && dGoal < 42) {
        doCross(engine, kicker); // lateral: centro al área
      } else if (dGoal < 30 && Math.abs(kicker.z) < 17) {
        // frontal y cercana: tiro directo (fabrica una carga y la suelta)
        const tx = gx - kicker.x, tz = (kicker.z >= 0 ? -2.9 : 2.9) - kicker.z;
        const l = Math.hypot(tx, tz) || 1;
        engine.charge = { uid: kicker.uid, t: 0.55 + rng() * 0.35, dx: tx / l, dz: tz / l };
        releaseShot(engine);
      } else {
        const mate = freestMate(engine, kicker, 26);
        if (mate) doGroundPass(engine, kicker, null, mate); // juega en corto
        else kickLong(engine, kicker, atk);
      }
      break;
    }
    case "penalty":
      aiPenaltyKick(engine, kicker);
      break;
    default:
      kickLong(engine, kicker, atk);
  }
  afterExecution(engine);
}

/** El saque ya se ejecutó: 1 s de EXECUTED y (penalti) el portero IA se estira. */
function afterExecution(engine) {
  const db = engine.deadBall;
  const kicker = byUid(engine, db.kickerUid);
  if (kicker) kicker.hasBall = false;
  engine.charge = null;
  engine.restartExempt = false;
  db.state = DB.EXECUTED;
  db.t = 0;
  setDeadBallNotice(null);
  if (db.userKeeping) restoreControl(engine);
  // En el penalti, el portero IA elige lado y se estira al golpeo.
  if (db.kind === "penalty" && !db.userKeeping) {
    const gk = defendingGk(engine, db);
    if (gk) gkPenaltyDive(engine, gk, db.gx, db.atk, engine.ball.vz);
  }
}

/** Tras soltar un tiro con carga (libre directo / penalti del usuario). */
function afterUserShot(engine) {
  const db = engine.deadBall;
  const kicker = byUid(engine, db.kickerUid);
  // El tiro ya lo ejecutó releaseShot: sin receptor vigilado.
  snapshotPass(engine, kicker, null, {});
  afterExecution(engine);
}

/** Estirada inmediata del portero del usuario (pulsa D defendiendo un penalti). */
function keeperDiveNow(engine) {
  const db = engine.deadBall;
  const gk = byUid(engine, db.keeperUid);
  if (!gk || db.keeperDive) return;
  ensureAI(gk);
  db.keeperDive = { dir: db.keeperLean || 0, t: 0.6 };
  gk.ai.state = GK_STATES.DIVE;
  gk.ai.lockT = engine.time + 0.8;
  gk.anim.action = "kick";
  gk.anim.timer = 0.4;
}

/**
 * Entrada del usuario durante DEAD_BALL_READY (la llama actions.js).
 * - Movimiento del esquema (IJKL o WASD) o flechas: puntería.
 * - IJKL: A ejecuta el saque (córner por alto, resto raso); en libre/penalti,
 *   mantener A carga el tiro. Defendiendo un penalti, A = estirada.
 * - WASD: E ejecuta el saque; Espacio carga/ejecuta el tiro en libre/penalti;
 *   F = estirada del portero.
 */
export function processDeadBallActions(engine, fin, dt) {
  const db = engine.deadBall;
  if (db.state !== DB.READY) return;
  const m = Math.hypot(fin.move.x, fin.move.z);
  if (m > 0.25) {
    db.aim.x = fin.move.x / m;
    db.aim.z = fin.move.z / m;
  }
  // Carga de tiro en curso: actualizar y detectar la suelta.
  if (engine.charge && engine.charge.uid === db.kickerUid) {
    updateCharge(engine, dt, fin.shootHeld, db.aim, fin.sprint);
    if (!engine.charge) afterUserShot(engine);
    return;
  }
  if (db.userKeeping) {
    if (Math.abs(fin.move.x) > 0.2) db.keeperLean = Math.sign(fin.move.x);
    for (const ev of fin.events) {
      if (ev === "actionDown" || ev === "tackleDown") keeperDiveNow(engine);
    }
    return;
  }
  if (!db.userKicking) return;
  // Tecla de acción/tiro mantenida (A en IJKL, Espacio en WASD): en
  // libre/penalti empieza la carga de tiro (0,35 s)
  const aHeld = !!fin.actionHeld;
  if (!engine.charge && aHeld && (db.kind === "free-kick" || db.kind === "penalty")) {
    db.holdT = (db.holdT || 0) + dt;
    if (db.holdT > 0.35) {
      const kicker = byUid(engine, db.kickerUid);
      if (kicker) startShotCharge(engine, kicker, db.aim);
      db.holdT = 0;
    }
  } else if (!aHeld) {
    db.holdT = 0;
  }
  for (const ev of fin.events) {
    // Tiro directo con la tecla de tiro (Espacio en WASD, B en mando):
    // arranca la carga al pulsar en libre/penalti a favor.
    if (ev === "shootDown" && !engine.charge &&
        (db.kind === "free-kick" || db.kind === "penalty")) {
      const kicker = byUid(engine, db.kickerUid);
      if (kicker) startShotCharge(engine, kicker, db.aim);
    }
    // Saque ejecutado al soltar la tecla de acción (IJKL) o al pulsar pase
    // (E en WASD): córner por alto, resto raso. Sin carga en curso.
    if ((ev === "actionUp" || ev === "pass") && !engine.charge) {
      executeDeadBall(engine, db.kind === "corner" ? "high" : "flat");
    }
    // 'actionDown' con carga la consume updateCharge (suelta el tiro).
  }
}

/** Ejecuta el saque del usuario (córner por alto, resto raso). */
export function executeDeadBall(engine, mode) {
  const db = engine.deadBall;
  if (db.state !== DB.READY || !db.userKicking) return;
  const kicker = byUid(engine, db.kickerUid);
  if (!kicker || kicker.sentOff) return;
  userRestartKick(engine, kicker, mode === "high" ? "high" : "flat");
  afterExecution(engine);
}

/**
 * Pita fuera de juego: libre indirecto para el rival desde el punto.
 * La llama doControl (toque del receptor) o checkOffsideInterference.
 */
export function whistleOffside(engine, rec) {
  clearOffsideWatch(engine);
  const opp = rec.side === "home" ? "away" : "home";
  bumpStat(engine, rec.side, "offsides");
  const spot = { x: clamp(rec.x, -52, 52), z: clamp(rec.z, -33.5, 33.5) };
  enterDeadBall(engine, "free-kick", {
    takerSide: opp,
    spot,
    indirect: true,
    notice: `Fuera de juego de ${rec.data.name} — libre indirecto`,
    whistle: 0.7,
  });
}

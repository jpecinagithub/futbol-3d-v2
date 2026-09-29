// Contacto balón-jugador (Fase B). Sustituye al contacto simple de la Fase A:
// - Control del balón con calidad de primer toque (perfecto / malo).
// - Intercepciones: cualquier jugador cuyo cilindro corte la trayectoria con
//   el balón bajo (<1.25 m) y a velocidad controlable, lo controla. Los
//   compañeros que no son el receptor dejan pasar los pases tensos.
// - Conducción por toques programados del poseedor (dribbling.js).
// - Robo: la entrada (tackleT activo) resuelve robo limpio o falta.
// - Disputa suave: acercarse al poseedor sin barrer puede desviar el balón.

import { BALL } from "./constants";
import { clamp, wrapAngle } from "../utils/math";
import { clearPossession } from "./possession";
import { dribbleTouch } from "./dribbling";
import { isGassed } from "./stamina";
import { userSideOf } from "./difficulty";
import { triggerRumble } from "./feedback";
import { registerFoul } from "./fouls";
import { playPass, playTackle } from "../audio/audioEngine";
// Fase D: fuera de juego (interferencia) y balón parado
import { clearOffsideWatch } from "./offside";
import { DB, whistleOffside } from "./deadball";

const CONTACT_R = 0.78;  // radio de control / intercepción
const BODY_R = BALL.radius + 0.35 + 0.12; // separación corporal

/** Velocidad máxima del balón controlable (m/s). El receptor esperado más. */
function controlLimit(p, isTarget) {
  const skill = p.role === "GK" ? p.data.goalkeeper : p.data.dribbling;
  let lim = 8 + skill / 12;
  if (isTarget) lim += 8;
  return lim;
}

/** Calidad del primer toque 0..1: dribbling (o `goalkeeper` en el portero:
 *  atrapar es su oficio), velocidad del balón, orientación del cuerpo y
 *  presión rival. */
function controlQuality(engine, p) {
  const b = engine.ball;
  // El portero controla con las manos: usa su stat de portero, no dribbling.
  // (Si no, un balón manso le "quema" y lo persigue sin atraparlo nunca.)
  const skill = p.role === "GK" ? p.data.goalkeeper : p.data.dribbling;
  let q = skill / 100;
  const ballSp = Math.hypot(b.vx, b.vz);
  // Balón rápido: más difícil, pero sin pasarse (un pase firme de 18 m/s
  // resta 0.14: un buen receptor lo controla; con 0.016 restaba 0.29 y casi
  // todos los controles de pases firmes salían malos: "el rebote").
  q -= ballSp * 0.008;
  // Un balón (casi) parado no tiene "dirección de llegada": no se penaliza
  // la orientación (antes atan2(0,0) daba un ángulo arbitrario y un balón
  // quieto podía salir despedido por "recibir de espaldas").
  if (ballSp > 0.8) {
    const incoming = Math.atan2(-b.vz, -b.vx); // de dónde viene el balón
    const align = Math.cos(wrapAngle(incoming - p.facing));
    q -= (1 - align) * 0.22; // recibir de espaldas es peor
  }
  for (const o of engine.players) {
    if (o.side === p.side || o === p) continue;
    if (Math.hypot(o.x - p.x, o.z - p.z) < 2) { q -= 0.14; break; }
  }
  if (isGassed(p)) q -= 0.12;
  return clamp(q, 0.03, 1);
}

/** Primer toque: perfecto => balón a <0.6 m; malo => despedido 0.5–2 m. */
function doControl(engine, p) {
  const b = engine.ball;
  // Fase D: el receptor vigilado por fuera de juego la toca => se pita.
  const w = engine.offsideWatch;
  if (w && w.receiverUid === p.uid) {
    whistleOffside(engine, p);
    return;
  }
  // ...pero si un defensor la toca antes, la jugada sigue (se acabó el riesgo).
  if (w && p.side !== w.side) clearOffsideWatch(engine);
  const rng = engine.rng;
  const q = controlQuality(engine, p);
  clearPossession(engine);
  if (q > 0.55) {
    // Fase 4: primer toque ORIENTADO — si el usuario lleva una dirección,
    // el control sale hacia ella (no solo hacia el facing).
    let a = p.facing;
    const um = engine.userMove ? Math.hypot(engine.userMove.x, engine.userMove.z) : 0;
    if (p.controlled && um > 0.3) {
      a = Math.atan2(engine.userMove.z, engine.userMove.x);
      p.facing = a;
    }
    b.x = p.x + Math.cos(a) * 0.45;
    b.z = p.z + Math.sin(a) * 0.45;
    // Control limpio: el balón muere en el pie, sin velocidad vertical ni
    // microbotes (antes conservaba la caída y sonaban botes encadenados).
    b.y = BALL.radius;
    b.vx = p.vx * 0.6;
    b.vz = p.vz * 0.6;
    b.vy = 0;
    b.spin *= 0.3;
    p.hasBall = true;
    p.touchTimer = 0.12;
    p.guardT = 0.6; // Fase 4: protección tras el primer toque (sin pokes)
    b.lastTouch = p.uid;
    b.touchCooldown = 0.12;
    maybeAutoSwitch(engine, p);
    // Fase 8: control limpio = recepción amortiguada (no patada).
    p.anim.action = "receive";
    p.anim.timer = 0.3;
  } else {
    const a = p.facing + (rng() * 2 - 1) * 0.9;
    const dist = 0.4 + (1 - q) * 0.9; // malo: se le escapa un poco, no 2 m
    b.x = p.x + Math.cos(a) * dist;
    b.z = p.z + Math.sin(a) * dist;
    // Un control fallido deja el balón cerca y manso (máx. 3 m/s), no lo
    // despide: así la jugada continúa y el fallo no encadena un "pinball"
    // irrecuperable cuando varios jugadores llegan al balón suelto.
    const sk = 1.2 + (1 - q) * 1.8;
    b.vx = Math.cos(a) * sk;
    b.vz = Math.sin(a) * sk;
    if (b.vy < 0.6) b.vy = 0.6;
    b.lastTouch = p.uid;
    b.touchCooldown = 0.2;
    p.hasBall = false;
  }
  engine.passTarget = null;
  if (p.anim.action !== "receive") {
    p.anim.action = "kick";
    p.anim.timer = 0.22;
  }
  try { playPass(0.3); } catch { /* sin audio */ }
}

/** Ayuda opcional (Fase 10): al recuperar, el control pasa al poseedor. */
function maybeAutoSwitch(engine, p) {
  try {
    if (!engine.assistSwitch) return;
  } catch {
    return;
  }
  if (p.side !== userSideOf(engine) || p.controlled) return;
  const cur = engine.players.find((q) => q.controlled);
  if (cur) cur.controlled = false;
  p.controlled = true;
  engine.controlledUid = p.uid;
  engine.charge = null;
}

/** Bloqueo corporal: el balón rebota suave y no atraviesa al jugador. */
function bodyBlock(b, p, dx, dz, d) {
  const nx = d > 1e-4 ? dx / d : 1, nz = d > 1e-4 ? dz / d : 0;
  b.x = p.x + nx * BODY_R;
  b.z = p.z + nz * BODY_R;
  const vn = b.vx * nx + b.vz * nz;
  if (vn < 0) {
    b.vx -= 1.35 * vn * nx;
    b.vz -= 1.35 * vn * nz;
    b.vx *= 0.75;
    b.vz *= 0.75;
    // El bloqueo cuenta como toque (p. ej. parada del portero: permite
    // detectar GK_SAVE y atribuye bien el último contacto).
    b.lastTouch = p.uid;
  }
}

/** Disputa suave: desvía el balón del poseedor sin barrida. Débil a
 *  propósito: el dueño del balón no lo pierde con facilidad; el balón
 *  queda cerca para que pueda recuperarlo. No se usa contra el usuario
 *  (él la conserva parado; hay que entrarle o esperar un balón suelto). */
function pokeBall(engine, p, poss) {
  const b = engine.ball;
  const rng = engine.rng;
  const a = Math.atan2(b.z - poss.z, b.x - poss.x) + (rng() * 2 - 1) * 1.2;
  b.vx = Math.cos(a) * 1.8;
  b.vz = Math.sin(a) * 1.8;
  b.lastTouch = p.uid;
  b.touchCooldown = 0.2;
  poss.hasBall = false;
  p.pokeCd = 1.5;
  try { playPass(0.25); } catch { /* sin audio */ }
}

/** Resolución de una entrada: robo limpio o falta. */
function resolveTackle(engine, t) {
  const b = engine.ball;
  t.tackleT = 0; // la entrada se consume al contacto
  let opp = null, oppD = Infinity;
  for (const o of engine.players) {
    if (o.side === t.side || o === t || o.sentOff) continue;
    const d = Math.hypot(o.x - b.x, o.z - b.z);
    if (d < oppD) { oppD = d; opp = o; }
  }
  const dBall = Math.hypot(t.x - b.x, t.z - b.z);
  // Intensidad 0..1 para el árbitro (Fase D): la velocidad comprometida del
  // lunge, no la instantánea (que aún está acelerando en el contacto).
  const intensity = clamp((t.tackleSpeed || Math.hypot(t.vx, t.vz)) / 9, 0, 1);
  const ballFirst = !opp || oppD > 0.85 || dBall < oppD - 0.15;
  // ¿Entró por detrás? (el vector tackler->víctima, contra el facing de esta)
  let fromBehind = false;
  if (opp) {
    const dx = t.x - opp.x, dz = t.z - opp.z;
    const d = Math.hypot(dx, dz) || 1;
    fromBehind = (Math.cos(opp.facing) * dx + Math.sin(opp.facing) * dz) / d < -0.45;
  }

  if (opp && oppD < 0.85 && !ballFirst) {
    // Tocó al jugador antes que al balón => el árbitro juzga la entrada
    registerFoul(engine, {
      by: t, victim: opp, touchedBallFirst: false, intensity, fromBehind,
    });
    t.kickCooldown = 0.35;
    return;
  }
  // Balón primero => limpio (la Fase D eliminó la falta aleatoria del 10%).
  // Robo limpio: el balón queda en los pies del que entró
  clearPossession(engine);
  b.x = t.x + Math.cos(t.facing) * 0.45;
  b.z = t.z + Math.sin(t.facing) * 0.45;
  b.y = BALL.radius;
  b.vx = t.vx * 0.35;
  b.vz = t.vz * 0.35;
  b.vy = 0;
  b.spin *= 0.4;
  t.hasBall = true;
  t.touchTimer = 0.15;
  b.lastTouch = t.uid;
  b.touchCooldown = 0.15;
  engine.passTarget = null;
  maybeAutoSwitch(engine, t);
  t.anim.action = "kick";
  t.anim.timer = 0.25;
  try { playTackle(); } catch { /* sin audio */ }
  try { triggerRumble(70, 0.7); } catch { /* sin háptica */ }
}

export function ballPlayerContact(engine, dt) {
  const b = engine.ball;

  // El poseedor pierde el balón si se escapa
  for (const p of engine.players) {
    if (!p.hasBall) continue;
    const d = Math.hypot(p.x - b.x, p.z - b.z);
    if (d > 1.7 || Math.hypot(b.vx, b.vz) > 12 || b.y > 1.4) p.hasBall = false;
  }
  if (engine.passTargetT > 0) {
    engine.passTargetT -= dt;
    if (engine.passTargetT <= 0) engine.passTarget = null;
  }

  let poss = null;
  for (const p of engine.players) {
    if (p.hasBall) { poss = p; break; }
  }
  const kickerSide = (() => {
    const k = engine.players.find((q) => q.uid === b.lastTouch);
    return k ? k.side : null;
  })();

  for (const p of engine.players) {
    // Fase D: con el balón parado no hay contacto; los expulsados no juegan.
    if (p.sentOff) continue;
    const dbState = engine.deadBall ? engine.deadBall.state : DB.OPEN;
    if (dbState === DB.SETUP || dbState === DB.READY) continue;
    const dx = b.x - p.x, dz = b.z - p.z;
    const d = Math.hypot(dx, dz);
    if (d > 1.5) continue;

    // Poseedor: sin bloqueo corporal; toques de conducción programados
    if (p.hasBall) {
      if (p.touchTimer <= 0) dribbleTouch(engine, p);
      continue;
    }
    if (b.lastTouch === p.uid && b.touchCooldown > 0) continue;

    // Entrada en curso (Fase 4: alcance 1,15 m para mejor respuesta)
    if (p.tackleT > 0) {
      if (d < 1.15) resolveTackle(engine, p);
      continue;
    }

    const ballSp = Math.hypot(b.vx, b.vz);
    const isTarget = engine.passTarget === p.uid;

    // Un portero en plena estirada "ocupa más": bloquea con el cuerpo en un
    // radio mayor (si no, los tiros tensos pasan a centímetros sin tocarle).
    const divingGk =
      p.role === "GK" && p.ai && p.ai.state === "GK_DIVE";
    const blockR = divingGk ? 1.15 : BODY_R;

    if (b.y < 1.25 && ballSp <= controlLimit(p, isTarget) && d < CONTACT_R) {
      // Posesión real: si alguien es dueño del balón y este va manso, nadie
      // se lo lleva por simple proximidad; solo cabe disputarlo con el poke
      // a menos de 0,6 m (o una entrada). Sin dueño, control normal.
      // (El poke vive aquí y no en el else: d < 0,6 también es < 0,78.)
      // Al usuario no se le hace el poke (petición suya): para quitársela
      // hay que entrarle o que la deje suelta de verdad.
      if (poss && poss.hasBall && ballSp < 4) {
        // Fase 4: con protección de primer toque no hay poke.
        if (p.side !== poss.side && !poss.controlled && !(poss.guardT > 0) && d < 0.6 && p.pokeCd <= 0) {
          pokeBall(engine, p, poss);
        }
      } else {
        // Compañero no destinatario: deja pasar los pases tensos por su carril
        if (!isTarget && kickerSide && p.side === kickerSide && ballSp > 3.5 && d > 0.55) {
          continue;
        }
        doControl(engine, p);
      }
    } else if (d < blockR) {
      // Disputa suave del controlado/rival cercano antes que bloqueo.
      // A 0.6 m: al alcance del presionador que entra a por el balón
      // (la separación entre jugadores es 0.7 m y el balón va a los pies),
      // pero sin el robo a distancia de antes. No se aplica al usuario ni
      // con protección de primer toque.
      if (poss && p.side !== poss.side && !poss.controlled && !(poss.guardT > 0) && ballSp < 4 && d < 0.6 && p.pokeCd <= 0) {
        pokeBall(engine, p, poss);
      } else {
        bodyBlock(b, p, dx, dz, d);
      }
    }
  }
}

// Táctica posicional (Fase C).
// Puestos base de la formación (los homeSpot de la Fase A, que ya vienen de
// assignSpots) desplazados por:
//  - la posición del balón: el bloque se corre hacia su lado (basculación),
//  - la fase colectiva: la línea defensiva sube/baja; el ataque mantiene
//    la profundidad.

import { PHASE } from "./teamPhases";
import { lerp, clamp } from "../utils/math";

const DEF_ROLES = new Set(["LB", "LCB", "RCB", "RB", "DM"]);
const MID_ROLES = new Set(["CM", "AM", "LM", "RM"]);

export const attackDir = (isHome) => (isHome ? 1 : -1);

/**
 * Altura de la línea defensiva en coordenadas de ataque
 * (a = atk*x; a > 0 hacia la portería rival; propia en a = -52.5).
 */
export function lineHeight(phase) {
  switch (phase) {
    case PHASE.HIGH_PRESS: return 8;
    case PHASE.TRANSITION_TO_DEFENCE: return -16;
    case PHASE.DEFENSIVE_BLOCK: return -26;
    case PHASE.BUILD_UP: return -16;
    case PHASE.TRANSITION_TO_ATTACK: return -12;
    case PHASE.COUNTER_ATTACK: return -10;
    case PHASE.POSSESSION: return -4;
    default: return -16;
  }
}

/**
 * Puesto táctico desplazado para un jugador.
 * Distancia entre líneas aprox.: defensa en `line`, DM +5, medios +15,
 * ataque +30 (bloque compacto de 8–12 m entre líneas en repliegue).
 */
export function tacticalTarget(p, ball, phase, isHome) {
  const atk = attackDir(isHome);
  const a = atk * p.homeSpot.x; // puesto base en coords de ataque
  const line = lineHeight(phase);
  let ax;
  if (p.role === "GK") {
    ax = a;
  } else if (DEF_ROLES.has(p.role)) {
    ax = lerp(a, line + (p.role === "DM" ? 5 : 0), 0.7);
  } else if (MID_ROLES.has(p.role)) {
    ax = lerp(a, line + 15, 0.45);
  } else {
    ax = lerp(a, line + 30, 0.55); // delanteros/extremos: profundidad
  }
  // Basculación lateral: todo el bloque se corre hacia el lado del balón.
  const pull = p.role === "GK" ? 0.15 : DEF_ROLES.has(p.role) ? 0.3 : 0.38;
  const z = clamp(p.homeSpot.z * (1 - pull) + ball.z * pull, -31, 31);
  return { x: atk * clamp(ax, -50, 50), z };
}

/** ¿La fase es ofensiva (mi equipo ataca)? */
export function isAttackingPhase(phase) {
  return (
    phase === PHASE.BUILD_UP ||
    phase === PHASE.POSSESSION ||
    phase === PHASE.COUNTER_ATTACK ||
    phase === PHASE.TRANSITION_TO_ATTACK
  );
}

/**
 * Línea de fuera de juego rival en coords de ataque: el defensa de campo
 * rival más retrasado (mínimo a). Sirve para lanzar desmarques a su espalda.
 */
export function opponentDefLine(engine, side, atk) {
  let line = Infinity;
  for (const o of engine.players) {
    if (o.side === side || o.role === "GK") continue;
    const a = atk * o.x;
    if (a < line) line = a;
  }
  return line === Infinity ? 0 : line;
}

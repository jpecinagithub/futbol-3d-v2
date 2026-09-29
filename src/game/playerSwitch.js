// Selección de jugador (Q, Fase B).
// Con dirección pulsada: el compañero (no portero) más cercano a esa
// dirección desde el controlado (alineación > 0.25, prima cercanía).
// Sin dirección: cicla por cercanía al balón (más cercano, segundo, ...).
// Si pasa más de CYCLE_WINDOW s entre pulsaciones, vuelve al más cercano.
// Nunca aleatorio: criterio futbolístico.

import { getControlled } from "./engine";
import { possessorOf } from "./possession";

// Ventana para seguir ciclando con Q; pasado este tiempo se reinicia al
// más cercano al balón.
const CYCLE_WINDOW = 1.5;

/** Predice el resultado de Q sin aplicarlo (Fase 1: vista previa del
 *  siguiente jugador seleccionable). Devuelve el jugador o null.
 *  @param {boolean} advance - si es true avanza el ciclo como una pulsación
 *    real; si es false (vista previa) no muta el estado del ciclo. */
export function predictSwitchTarget(engine, move, advance = false) {
  const cur = getControlled(engine);
  if (!cur) return null;
  const mates = engine.players.filter(
    (p) => p.side === cur.side && p !== cur && p.role !== "GK"
  );
  if (mates.length === 0) return null;

  let best = null;
  const m = Math.hypot(move.x, move.z);
  if (m > 0.25) {
    const dx = move.x / m, dz = move.z / m;
    let bestScore = -Infinity;
    for (const p of mates) {
      const vx = p.x - cur.x, vz = p.z - cur.z;
      const d = Math.hypot(vx, vz) || 1;
      const align = (vx * dx + vz * dz) / d;
      if (align < 0.25) continue;
      const score = align * 2 - d * 0.04;
      if (score > bestScore) { bestScore = score; best = p; }
    }
    if (advance) {
      // Cambio direccional: reinicia el ciclo de cercanía.
      engine.switchCycleT = 0;
      engine.switchCycleIdx = -1;
    }
  }
  if (!best) {
    // Ordenados por distancia al balón; se avanza un puesto por pulsación.
    const b = engine.ball;
    const ordered = mates
      .map((p) => ({ p, d: Math.hypot(p.x - b.x, p.z - b.z) }))
      .sort((a, c) => a.d - c.d);
    let idx = 0;
    const now = engine.time;
    if (
      engine.switchCycleT &&
      now - engine.switchCycleT < CYCLE_WINDOW &&
      engine.switchCycleUid === cur.uid &&
      engine.switchCycleIdx >= 0
    ) {
      idx = advance
        ? (engine.switchCycleIdx + 1) % ordered.length
        : Math.min(engine.switchCycleIdx + 1, ordered.length - 1);
    }
    best = ordered[idx].p;
    if (advance) {
      engine.switchCycleT = now;
      engine.switchCycleIdx = idx;
      engine.switchCycleUid = best.uid;
    }
  }
  return best;
}

export function switchPlayer(engine, move) {
  const cur = getControlled(engine);
  if (!cur) return;
  const best = predictSwitchTarget(engine, move, true);
  if (best && best !== cur) {
    // Si el usuario suelta al portador del balón, la IA no lo rifa de
    // inmediato: 2 s conduciendo antes de pasar o tirar por su cuenta.
    if (possessorOf(engine) === cur) cur.passCd = Math.max(cur.passCd, 2.0);
    cur.controlled = false;
    best.controlled = true;
    engine.controlledUid = best.uid;
    engine.charge = null; // cancelar carga de tiro al cambiar
  }
}

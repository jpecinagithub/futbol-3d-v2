// Estados individuales de la IA (Fase C).
// Cada jugador de campo tiene uno; el portero usa su propia máquina
// (src/ai/goalkeeper.js). El estado se guarda en p.ai.state y se recalcula
// en el tick de decisión (~12 Hz); el steering por frame solo sigue p.ai.goal.

export const ST = {
  IDLE: "IDLE",               // sin tarea (recién creado)
  POSITIONING: "POSITIONING", // vuelve a su puesto táctico desplazado
  SUPPORT: "SUPPORT",         // ofrece línea de pase (triángulos)
  ATTACKING: "ATTACKING",     // desmarque en ruptura / ataca el espacio
  DEFENDING: "DEFENDING",     // cobertura / bloque sin balón
  PRESSING: "PRESSING",       // presiona al poseedor rival
  MARKING: "MARKING",         // marca zonal al rival de su zona
  INTERCEPTING: "INTERCEPTING", // corta un pase en trayectoria
  RECEIVING: "RECEIVING",     // va al encuentro del pase en curso
  DRIBBLING: "DRIBBLING",     // conduce el balón (cerebro del poseedor)
  PASSING: "PASSING",         // acaba de pasar (transitorio)
  SHOOTING: "SHOOTING",       // acaba de tirar (transitorio)
  RECOVERING: "RECOVERING",   // repliegue rápido tras pérdida
};

export const STATE_LIST = Object.values(ST);

import { mulberry32 } from "../utils/math";

/** Hash entero de un string (para seeds deterministas por jugador). */
function hashUid(uid) {
  let h = 2166136261;
  for (let i = 0; i < uid.length; i++) {
    h ^= uid.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Memoria individual de IA del jugador (p.ai). Se crea de forma perezosa.
 * - react: tiempo de reacción individual 150–400 ms (según "mental" aprox.:
 *   media de passing/defending). Evita sincronía robótica.
 * - reactT: próximo instante en que este jugador re-decide.
 * - offX/offZ: offset individual de su posición objetivo (±1.8 m).
 */
export function ensureAI(p) {
  let ai = p.ai;
  if (!ai) {
    const h = hashUid(p.uid || "x");
    const r1 = mulberry32(h)();
    const r2 = mulberry32(h ^ 0x9e3779b9)();
    const mental = ((p.data.passing || 60) + (p.data.defending || 60)) / 2;
    ai = p.ai = {
      state: ST.IDLE,
      goal: { x: p.homeSpot.x, z: p.homeSpot.z },
      speedF: 0.45, // fracción de maxSpeed que pide el steering
      react: 0.15 + (1 - mental / 100) * 0.25,
      reactT: r1 * 0.4, // arranque escalonado
      offX: (r1 * 2 - 1) * 1.8,
      offZ: (r2 * 2 - 1) * 1.8,
      hadBall: false,
      gotBallT: 0,
      lastShotT: -9,
      lockT: 0, // el portero lo usa para no re-decidir en plena estirada
    };
  }
  return ai;
}

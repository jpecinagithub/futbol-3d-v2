// Stamina 0–100 por jugador (Fase B + Fase 4).
// - Baja con el sprint, sube al trotar/parado.
// - Afecta a la velocidad máxima y penaliza la calidad técnica si < 25.
// Fase 4: el sprint cuesta un poco más pero se recupera antes — la gestión
// (cuándo correr) importa más que el ahorro pasivo.

import { clamp } from "../utils/math";

const DRAIN = 8.5;   // por segundo esprintando
const REGEN_JOG = 4.0;
const REGEN_IDLE = 6.5;

export function updateStamina(p, dt, sprinting, moving) {
  if (sprinting && moving) {
    p.stamina = clamp(p.stamina - DRAIN * dt, 0, 100);
  } else {
    const rate = moving ? REGEN_JOG : REGEN_IDLE;
    p.stamina = clamp(p.stamina + rate * dt, 0, 100);
  }
}

/** Factor multiplicador de la velocidad máxima según stamina. */
export function staminaSpeedFactor(p) {
  let f = 0.72 + 0.28 * (p.stamina / 100);
  if (p.stamina < 25) f *= 0.92; // fundido: pierde punta
  return f;
}

/** ¿La stamina baja penaliza pase/tiro/control? */
export function isGassed(p) {
  return p.stamina < 25;
}

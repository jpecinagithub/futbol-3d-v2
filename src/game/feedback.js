// Retroalimentación háptica (Fase 10): vibración del mando/móvil en
// entradas y goles. Respeta el ajuste (f3d.vib) y degrada en silencio donde
// no hay soporte (la mayoría de navegadores de escritorio).

import { useMatchStore } from "../stores/useMatchStore";

/** Vibra `ms` milisegundos (0..1 fuerza en mandos con actuador). */
export function triggerRumble(ms = 60, strong = 0.6) {
  try {
    if (!useMatchStore.getState().vibration) return;
  } catch {
    return;
  }
  try {
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      navigator.vibrate(ms);
    }
  } catch { /* sin vibrador */ }
  try {
    const pads = typeof navigator !== "undefined" && navigator.getGamepads
      ? navigator.getGamepads()
      : null;
    const gp = pads ? [...pads].find((p) => p && p.connected) : null;
    const act = gp && gp.vibrationActuator;
    if (act && act.playEffect) {
      act.playEffect("dual-rumble", {
        duration: ms,
        strongMagnitude: Math.max(0, Math.min(1, strong)),
        weakMagnitude: Math.max(0, Math.min(1, strong * 0.6)),
      }).catch(() => {});
    }
  } catch { /* sin actuador */ }
}

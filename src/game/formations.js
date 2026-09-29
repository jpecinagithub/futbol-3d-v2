// Mapas tácticos: posición -> coordenadas base (x, z) en metros.
// Referencia: equipo LOCAL, que defiende la portería de x=-52.5 y ataca hacia +x.
// El equipo visitante espeja las coordenadas (x -> -x) en el motor.
// Posiciones: GK, LB, LCB, RCB, RB, DM, CM, AM, LM, RM, LW, RW, ST.

const F = (role, x, z) => ({ role, x, z });

export const FORMATIONS = {
  "4-3-3": [
    F("GK", -48, 0),
    F("LB", -30, -17), F("LCB", -35, -6), F("RCB", -35, 6), F("RB", -30, 17),
    F("DM", -22, 0), F("CM", -16, -9), F("CM", -16, 9),
    F("LW", -7, -21), F("ST", -5, 0), F("RW", -7, 21),
  ],
  "4-2-3-1": [
    F("GK", -48, 0),
    F("LB", -30, -17), F("LCB", -35, -6), F("RCB", -35, 6), F("RB", -30, 17),
    F("DM", -24, -6), F("DM", -24, 6),
    F("LW", -12, -20), F("AM", -11, 0), F("RW", -12, 20),
    F("ST", -4, 0),
  ],
  "4-4-2": [
    F("GK", -48, 0),
    F("LB", -30, -17), F("LCB", -35, -6), F("RCB", -35, 6), F("RB", -30, 17),
    F("LM", -14, -21), F("CM", -17, -7), F("CM", -17, 7), F("RM", -14, 21),
    F("ST", -5, -5), F("ST", -5, 5),
  ],
};

/**
 * Devuelve las coordenadas tácticas de un rol para un equipo.
 * @param {string} formation - "4-3-3" | "4-2-3-1" | "4-4-2"
 * @param {string} role
 * @param {boolean} isHome - false => espeja el campo (x -> -x)
 */
export function tacticalSpot(formation, role, isHome) {
  const list = FORMATIONS[formation] || FORMATIONS["4-3-3"];
  // Si hay roles duplicados (p.ej. dos CM), se reparten en orden de aparición.
  const spots = list.filter((s) => s.role === role);
  const spot = spots[0] || list[0];
  return { x: isHome ? spot.x : -spot.x, z: spot.z, _index: list.indexOf(spot) };
}

/** Reparte los 11 titulares en sus puestos (maneja roles duplicados por orden). */
export function assignSpots(formation, starters, isHome) {
  const list = FORMATIONS[formation] || FORMATIONS["4-3-3"];
  const used = new Set();
  return starters.map((p, i) => {
    // Busca el primer puesto libre con ese rol; si no hay, usa el i-ésimo.
    let idx = list.findIndex((s, k) => !used.has(k) && s.role === p.position);
    if (idx === -1) idx = i % list.length;
    used.add(idx);
    const s = list[idx];
    return { x: isHome ? s.x : -s.x, z: s.z };
  });
}

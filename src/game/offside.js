// Fuera de juego (Fase D).
//
// Mecánica:
//  - En el momento de cada pase, passing.js (y aiGroundPass en ai/tick.js)
//    llama a snapshotPass(): guarda la posición del receptor objetivo, la del
//    penúltimo defensor rival y la del balón.
//  - Regla: atacante en campo rival, por delante del penúltimo defensor Y por
//    delante del balón en el momento del pase => posición de fuera de juego.
//    Nivelado con el penúltimo defensor o con el balón => habilitado.
//    Excepciones: recibir en campo propio, o balón jugado directamente desde
//    saque de banda / córner / saque de puerta (el snapshot se marca exento
//    y no se crea vigilancia).
//  - Se pita cuando el receptor vigilado TOCA el balón (gancho en
//    ballContact.js: doControl) o INTERFIERE (el balón llega a <3 m de su
//    zona, comprobado cada paso en checkOffside()). Si no participa, el juego
//    sigue (sin ventaja compleja).
//  - wouldBeOffside(passer, receiver) es la versión pura y reutilizable que
//    usa la IA para no lanzar pases al hueco a receptores adelantados.
//  - offsideLineX() da la línea del fuera de juego para disciplinar los
//    desmarques de la IA (los delanteros contienen la carrera en la línea).

/** Penúltimo defensor rival (el portero cuenta): el 2º más cercano a la
 *  portería que ataca `side`. Si hay menos de 2 rivales, la línea de fondo. */
function penultimateDefender(engine, side) {
  const atk = side === "home" ? 1 : -1;
  const opps = [];
  for (const p of engine.players) {
    if (p.side === side || p.sentOff) continue;
    opps.push(p);
  }
  opps.sort((a, b) => atk * b.x - atk * a.x);
  if (opps.length < 2) return { x: atk * 52.5, z: 0 };
  return opps[1];
}

/**
 * ¿Estaría `receiver` en fuera de juego si `passer` le pasa AHORA?
 * Puro (no toca el motor): la IA lo usa antes de lanzar el pase al hueco.
 */
export function wouldBeOffside(engine, passer, receiver) {
  if (!passer || !receiver || passer.side !== receiver.side) return false;
  const atk = passer.isHome ? 1 : -1;
  // En campo propio nunca hay fuera de juego.
  if (atk * receiver.x <= 0) return false;
  // Nivelado o por detrás del balón => habilitado.
  if (atk * receiver.x <= atk * engine.ball.x) return false;
  // Nivelado o por detrás del penúltimo defensor => habilitado.
  const def = penultimateDefender(engine, passer.side);
  if (atk * receiver.x <= atk * def.x) return false;
  return true;
}

/**
 * Línea de fuera de juego para el equipo atacante `side`: x del penúltimo
 * defensor rival (en coordenadas de campo, no relativas).
 */
export function offsideLineX(engine, side) {
  return penultimateDefender(engine, side).x;
}

/**
 * Snapshot en el momento del pase.
 * - `engine.lastPassSnapshot`: registro completo de TODOS los pases
 *   (para depuración y para la IA).
 * - `engine.offsideWatch`: vigilancia activa SOLO si el receptor estaba en
 *   posición sancionable en el momento del golpeo (si no, pitaríamos por
 *   mera proximidad). No se crea si `receiver` es null (despeje / tiro) o
 *   si el pase viene directamente de un saque exento (banda/córner/puerta).
 */
export function snapshotPass(engine, passer, receiver, opts = {}) {
  engine.lastPassSnapshot = receiver
    ? { passerUid: passer.uid, receiverUid: receiver.uid, t: engine.time, exempt: !!opts.exempt }
    : null;
  if (!receiver || opts.exempt || !wouldBeOffside(engine, passer, receiver)) {
    engine.offsideWatch = null;
    return;
  }
  const def = penultimateDefender(engine, passer.side);
  engine.offsideWatch = {
    receiverUid: receiver.uid,
    receiverName: receiver.data.name,
    side: passer.side,
    atk: passer.isHome ? 1 : -1,
    rx: receiver.x,
    rz: receiver.z,
    ballX: engine.ball.x,
    ballZ: engine.ball.z,
    defX: def.x,
    defZ: def.z,
    t: engine.time,
  };
}

/** Limpia la vigilancia (toque de un defensor, fin de la jugada, etc.). */
export function clearOffsideWatch(engine) {
  engine.offsideWatch = null;
}

/**
 * ¿El receptor vigilado interfiere sin haber tocado aún el balón?
 * Se pita si el balón llega a <3 m de su zona. El toque directo lo pita
 * doControl (ballContact.js). Devuelve true si se pitó.
 */
export function checkOffsideInterference(engine, onWhistle) {
  const w = engine.offsideWatch;
  if (!w) return false;
  // La vigilancia caduca a los 6 s (el pase ya murió).
  if (engine.time - w.t > 6) {
    engine.offsideWatch = null;
    return false;
  }
  const rec = engine.players.find((p) => p.uid === w.receiverUid);
  if (!rec || rec.sentOff) {
    engine.offsideWatch = null;
    return false;
  }
  // Si otro jugador se hizo con el balón, el pase terminó sin fuera de juego.
  for (const p of engine.players) {
    if (p.hasBall && p.uid !== w.receiverUid) {
      engine.offsideWatch = null;
      return false;
    }
  }
  const b = engine.ball;
  const d = Math.hypot(b.x - rec.x, b.z - rec.z);
  if (d < 3 && b.y < 2.2) {
    onWhistle(engine, rec);
    return true;
  }
  return false;
}

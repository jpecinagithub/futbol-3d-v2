// Fases colectivas por equipo (Fase C).
// La fase modula dónde se coloca el bloque (tactics.js) y qué deberes tiene
// cada rol (tick.js). Transiciones por eventos de posesión con temporizadores.

export const PHASE = {
  DEFENSIVE_BLOCK: "DEFENSIVE_BLOCK",
  BUILD_UP: "BUILD_UP",
  POSSESSION: "POSSESSION",
  COUNTER_ATTACK: "COUNTER_ATTACK",
  HIGH_PRESS: "HIGH_PRESS",
  TRANSITION_TO_ATTACK: "TRANSITION_TO_ATTACK",
  TRANSITION_TO_DEFENCE: "TRANSITION_TO_DEFENCE",
};

const TRANS_ATK_T = 2.5; // transición ataque: 2.5 s antes de asentarse
const TRANS_DEF_T = 1.5; // transición defensa: 1.5 s
const COUNTER_T = 6;     // duración máxima del contraataque como fase
const GEGEN_T = 6;       // contrapresión tras pérdida: 6 s

/**
 * ¿Quién tiene el balón? 'home' | 'away'.
 * Solo cuenta la posesión real (p.hasBall). Si está suelto, se mantiene el
 * último conocido (evita parpadeo de fases). A propósito NO se atribuye por
 * proximidad: un defensa que pasa corriendo junto al balón no "tiene" el balón.
 */
export function possessionSide(engine, tai) {
  for (const p of engine.players) {
    if (p.hasBall) {
      tai.possSide = p.side;
      return p.side;
    }
  }
  return tai.possSide || "home";
}

/** ¿Hay espacio para contraatacar? Balón en campo propio y pocos rivales por detrás. */
function counterOpportunity(engine, side, atk, aBall) {
  if (aBall > -8) return false;
  let oppBehind = 0;
  for (const o of engine.players) {
    if (o.side === side || o.role === "GK") continue;
    if (atk * o.x < aBall + 6) oppBehind++;
  }
  return oppBehind <= 4;
}

function settle(tai, engine, isHome, possSide) {
  const side = isHome ? "home" : "away";
  const atk = isHome ? 1 : -1;
  const aBall = atk * engine.ball.x;
  if (possSide === side) {
    if (tai.counterFlag) {
      tai.phase = PHASE.COUNTER_ATTACK;
      tai.phaseT = COUNTER_T;
    } else {
      tai.phase = aBall < 5 ? PHASE.BUILD_UP : PHASE.POSSESSION;
      tai.phaseT = 0;
    }
    tai.counterFlag = false;
  } else {
    // Contrapresión solo si el balón está en campo rival y la pérdida es reciente.
    tai.phase = tai.sinceLoss < GEGEN_T && aBall > 0 ? PHASE.HIGH_PRESS : PHASE.DEFENSIVE_BLOCK;
    tai.phaseT = 0;
  }
}

/**
 * Avanza la máquina de fases del equipo. Llamar en el tick de decisión.
 * @param {object} tai estado IA del equipo
 * @param {number} dtDec paso del tick de decisión (s)
 */
export function updatePhase(tai, engine, isHome, possSide, dtDec) {
  const side = isHome ? "home" : "away";
  const atk = isHome ? 1 : -1;
  const aBall = atk * engine.ball.x;

  if (possSide !== tai.prevPoss) {
    tai.prevPoss = possSide;
    if (possSide === side) {
      tai.phase = PHASE.TRANSITION_TO_ATTACK;
      tai.phaseT = TRANS_ATK_T;
      tai.sinceWin = 0;
      tai.counterFlag = counterOpportunity(engine, side, atk, aBall);
    } else {
      tai.phase = PHASE.TRANSITION_TO_DEFENCE;
      tai.phaseT = TRANS_DEF_T;
      tai.sinceLoss = 0;
    }
  }
  tai.sinceWin += dtDec;
  tai.sinceLoss += dtDec;

  if (tai.phaseT > 0) {
    tai.phaseT -= dtDec;
    if (tai.phaseT <= 0) settle(tai, engine, isHome, possSide);
    return;
  }

  // Fase asentada: re-evaluar de forma continua (el balón se mueve).
  if (tai.phase === PHASE.COUNTER_ATTACK) return; // expira por phaseT
  if (possSide === side) {
    const want = aBall < 5 ? PHASE.BUILD_UP : PHASE.POSSESSION;
    if (tai.phase !== want && tai.phase !== PHASE.TRANSITION_TO_ATTACK) {
      tai.phase = want;
    }
  } else if (tai.phase === PHASE.HIGH_PRESS) {
    if (!(tai.sinceLoss < GEGEN_T && aBall > 0)) tai.phase = PHASE.DEFENSIVE_BLOCK;
  } else if (tai.phase === PHASE.DEFENSIVE_BLOCK) {
    if (tai.sinceLoss < GEGEN_T && aBall > 0) tai.phase = PHASE.HIGH_PRESS;
  } else {
    tai.phase = PHASE.DEFENSIVE_BLOCK;
  }
}

/** Estado inicial de la máquina de fases de un equipo. */
export function initialTeamPhase() {
  return {
    phase: PHASE.BUILD_UP,
    phaseT: 0,
    prevPoss: null,
    possSide: null,
    sinceWin: 99,
    sinceLoss: 99,
    counterFlag: false,
    // --- presión ---
    presserUid: null,
    presserT: -9,
    coverUid: null,
    // --- tick de decisión ---
    acc: 0,
  };
}

/**
 * Fase D: resetea la fase colectiva tras una reanudación.
 * El equipo que sacó sale jugando (BUILD_UP); el otro repliega
 * (DEFENSIVE_BLOCK). Evita que una presión alta o un contraataque queden
 * "enganchados" durante la colocación del balón parado.
 */
export function resetPhaseForRestart(tai, isHome, takerSide, _ballX) {
  const ownSide = isHome ? "home" : "away";
  tai.phase = takerSide === ownSide ? PHASE.BUILD_UP : PHASE.DEFENSIVE_BLOCK;
  tai.phaseT = 0;
  tai.sinceWin = 99;
  tai.sinceLoss = 99;
  tai.counterFlag = false;
  tai.presserUid = null;
  tai.coverUid = null;
  tai.possSide = takerSide;
}

// Dificultad (Fase 5): fácil / normal / difícil.
//
// Filosofía SIN TRAMPAS: la dificultad solo toca el COMPORTAMIENTO de la IA
// rival (cada cuánto decide, cuánto corre a presionar, cuánto se equivoca
// pasando/tirando, cuándo se estira el portero) y la ASISTENCIA al usuario.
// Nunca toca físicas (misma maxSpeed, mismos atributos), ni teleporta, ni da
// información perfecta, ni altera el azar del usuario.

export const DIFFICULTIES = ["easy", "normal", "hard"];
export const DIFFICULTY_LABEL = { easy: "Fácil", normal: "Normal", hard: "Difícil" };
export const DIFFICULTY_DESC = {
  easy: "La IA rival decide lento, presiona suave y perdona ocasiones. Más ayuda en tus pases y tiros.",
  normal: "El partido equilibrado de siempre.",
  hard: "La IA rival decide rápido, presiona arriba y casi no perdona. Menos ayuda para ti.",
};

export const DIFF = {
  easy: {
    hz: 6,            // decisiones de la IA rival por segundo (normal: 12)
    pressSpeed: 0.85, // velocidad del presionador rival (×, topada por maxSpeed)
    passErr: 1.4,     // error de pase rival (×)
    shotErr: 1.4,     // dispersión de tiro rival (×)
    tackleRadius: 1.3,// radio de auto-entrada rival (normal: 1,7)
    gkDiveSpd: 8,     // el portero rival solo bucea tiros tensos (normal: 6)
    gkReach: 11,      // alcance de estirada rival (normal: 13)
    gkReflex: 0.3,    // lectura de penaltis rival (normal: 0,45)
    userAim: 0.5,     // asistencia de tiro al usuario (mezcla a portería)
    userPassErr: 0.7, // error de pase del usuario (×)
  },
  normal: {
    hz: 12,
    pressSpeed: 1.0,
    passErr: 1.0,
    shotErr: 1.0,
    tackleRadius: 1.7,
    gkDiveSpd: 6,
    gkReach: 13,
    gkReflex: 0.45,
    userAim: 0.35,
    userPassErr: 1.0,
  },
  hard: {
    hz: 18,
    pressSpeed: 1.1,
    passErr: 0.75,
    shotErr: 0.75,
    tackleRadius: 2.0,
    gkDiveSpd: 5,
    gkReach: 14,
    gkReflex: 0.6,
    userAim: 0.25,
    userPassErr: 1.2,
  },
};

export function normalizeDifficulty(v) {
  return v === "easy" || v === "hard" ? v : "normal";
}

/** Lado del usuario: el del jugador controlado (local por defecto). */
export function userSideOf(engine) {
  const c = engine.players ? engine.players.find((p) => p.controlled) : null;
  return c ? c.side : "home";
}

/** Parámetros que aplican a un jugador/equipo según su lado. */
export function paramsFor(engine, side) {
  const d = normalizeDifficulty(engine.difficulty);
  if (side === userSideOf(engine)) return DIFF.normal; // tu equipo siempre rinde igual
  return DIFF[d]; // el rival escala con la dificultad
}

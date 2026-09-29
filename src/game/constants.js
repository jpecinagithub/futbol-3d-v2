// Constantes del partido y del mundo. Eje X = largo del campo (porterías en x=±52.5),
// eje Z = ancho, Y = altura. Unidades en metros.

export const FIELD = {
  length: 105,          // largo reglamentario
  width: 68,            // ancho reglamentario
  halfLength: 52.5,
  halfWidth: 34,
  centerCircleR: 9.15,
  boxDepth: 16.5,       // área grande
  boxWidth: 40.32,
  sixYardDepth: 5.5,    // área pequeña
  sixYardWidth: 18.32,
  penaltySpot: 11,      // distancia del punto de penalti
  penaltyArcR: 9.15,
};

export const GOAL = {
  width: 7.32,
  height: 2.44,
  halfWidth: 3.66,
  depth: 2.2,           // fondo de la red
  postRadius: 0.06,
};

export const BALL = {
  radius: 0.17,         // balón nº5 ampliado (~1.5x) para que se vea bien en cámara broadcast
  restitution: 0.6,     // rebote contra el suelo
  rollFriction: 2.8,    // el balón pierde velocidad rodando, como un pase real
  airDrag: 0.5,         // los tiros se frenan en el aire de forma visible
  magnus: 0.35,         // efecto del spin (fuerza lateral simplificada)
  stopSpeed: 0.25,      // por debajo se considera parado
  gravity: 9.81,
};

export const PLAYER = {
  radius: 0.35,         // cápsula lógica 2D
  walkSpeed: 2.2,       // trote táctico de la IA mínima (fase A)
  maxSpeed: 7.4,        // esprint aprox. de un extremo rápido
  accel: 22,            // aceleración del jugador controlado
  turnRate: 10,         // rad/s de giro del cuerpo
  touchDistance: 0.55,  // distancia de contacto para conducir
  dribbleKick: 5.2,     // impulso base al tocar el balón conduciendo
};

// Salidas reglamentarias (Fase D): ya NO hay muros invisibles.
// El balón puede cruzar las líneas del campo; src/game/deadball.js detecta
// la salida (checkOutOfBounds) y reanuda con saque de banda, córner o saque
// de puerta según la línea cruzada y el último toque. Los jugadores siguen
// limitados al rectángulo de juego en engine.js (MX/MZ).

// Reloj: el tiempo de partido es tiempo real (1 segundo real = 1 segundo
// de partido). Antes iba x6 y un partido de "5 min" duraba 50 segundos
// reales, por eso parecían terminar antes de tiempo.
export const MATCH_TIME_SCALE = 1;

// Duraciones elegibles (minutos de partido).
export const DURATION_OPTIONS = [3, 5, 10, 15];

// Paso fijo del motor determinista (física + lógica).
export const FIXED_DT = 1 / 60;
// Subpasos de física del balón por cada paso fijo.
export const BALL_SUBSTEPS = 2;

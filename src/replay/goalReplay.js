// Buffer circular de estados para la repetición automática de goles (Fase E).
//
// Decisión de diseño: grabar ESTADOS (posiciones del balón + 22 jugadores)
// en vez de re-simular con semilla+inputs. Aunque el motor es determinista,
// re-simular exigiría reproducir bit a bit los inputs del usuario y de la IA
// durante esos segundos; grabar estados es más simple, robusto y barato:
// ~18 s a 30 Hz ≈ 540 fotogramas de ~120 números (~260 KB).

export const REPLAY_HZ = 30;
export const REPLAY_SECONDS = 18;

/** Segundos de metraje de la repetición (Fase 2: 6–8 s, del buffer). */
export const REPLAY_WINDOW_S = 7;

/** Últimos segundos del metraje a cámara lenta (el remate y el gol). */
export const REPLAY_SLOWMO_TAIL_S = 2;
/** Velocidad de la cola final (gol a cámara lenta). */
export const REPLAY_TAIL_SPEED = 0.35;

/** Ventana de metraje: los últimos REPLAY_WINDOW_S s del buffer. */
export function getReplayWindow(engine) {
  const buf = engine.replayBuf.frames;
  return buf.slice(Math.max(0, buf.length - REPLAY_HZ * REPLAY_WINDOW_S));
}

export function createReplayBuffer() {
  return {
    frames: [],                       // [{ ball:[x,y,z,vx,vy,vz], pl:Float32Array }]
    maxFrames: REPLAY_HZ * REPLAY_SECONDS,
    lastTick: -1,
  };
}

/** Guarda un fotograma si toca (llamar tras cada paso fijo; muestrea a 30 Hz). */
export function recordTick(engine) {
  const buf = engine.replayBuf;
  if (!buf) return;
  if (engine.tickCount - buf.lastTick < 2) return; // 60 Hz / 2 = 30 Hz
  buf.lastTick = engine.tickCount;
  const n = engine.players.length;
  const pl = new Float32Array(n * 5);
  for (let i = 0; i < n; i++) {
    const p = engine.players[i];
    pl[i * 5] = p.x;
    pl[i * 5 + 1] = p.z;
    pl[i * 5 + 2] = p.facing;
    pl[i * 5 + 3] = p.vx;
    pl[i * 5 + 4] = p.vz;
  }
  const b = engine.ball;
  buf.frames.push({ ball: [b.x, b.y, b.z, b.vx, b.vy, b.vz], pl });
  if (buf.frames.length > buf.maxFrames) {
    buf.frames.splice(0, buf.frames.length - buf.maxFrames);
  }
}

function lerpAngle(a, b, f) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * f;
}

/**
 * Interpola el instante t (segundos de repetición) y lo aplica al motor.
 * El reproductor es desacoplado: escribe posiciones directamente; la
 * simulación está congelada y al salir se hace kickoff (no hay que restaurar).
 */
export function applyReplayFrame(engine, frames, t) {
  if (!frames.length) return;
  const ft = t * REPLAY_HZ;
  const i0 = Math.max(0, Math.min(frames.length - 2, Math.floor(ft)));
  const f = Math.min(1, Math.max(0, ft - i0));
  const A = frames[i0];
  const B = frames[i0 + 1] || A;
  const L = (a, b) => a + (b - a) * f;

  const b = engine.ball;
  b.x = L(A.ball[0], B.ball[0]);
  b.y = L(A.ball[1], B.ball[1]);
  b.z = L(A.ball[2], B.ball[2]);
  b.vx = L(A.ball[3], B.ball[3]);
  b.vy = L(A.ball[4], B.ball[4]);
  b.vz = L(A.ball[5], B.ball[5]);

  const n = Math.min(engine.players.length, A.pl.length / 5);
  for (let i = 0; i < n; i++) {
    const p = engine.players[i];
    p.x = L(A.pl[i * 5], B.pl[i * 5]);
    p.z = L(A.pl[i * 5 + 1], B.pl[i * 5 + 1]);
    p.facing = lerpAngle(A.pl[i * 5 + 2], B.pl[i * 5 + 2], f);
    p.vx = L(A.pl[i * 5 + 3], B.pl[i * 5 + 3]);
    p.vz = L(A.pl[i * 5 + 4], B.pl[i * 5 + 4]);
  }
}

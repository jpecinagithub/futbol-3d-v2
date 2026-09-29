// Utilidades matemáticas pequeñas usadas por física, IA y cámara.
// Todo determinista: sin Math.random() aquí (la aleatoriedad visual vive en componentes).

export const clamp = (v, min, max) => (v < min ? min : v > max ? max : v);

export const lerp = (a, b, t) => a + (b - a) * t;

/** Interpolación suave (smoothstep) de a hacia b con factor t en [0,1]. */
export const damp = (a, b, t) => {
  const s = clamp(t, 0, 1);
  const smooth = s * s * (3 - 2 * s);
  return lerp(a, b, smooth);
};

export const dist2D = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);

/** Ángulo (radianes) del vector (x,z). Convención: 0 = +X, crece hacia +Z. */
export const angleOf = (x, z) => Math.atan2(z, x);

/** Normaliza un ángulo a (-PI, PI]. */
export const wrapAngle = (a) => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a <= -Math.PI) a += Math.PI * 2;
  return a;
};

/** Generador pseudoaleatorio determinista (mulberry32) para replays. */
export function mulberry32(seed) {
  let s = seed >>> 0;
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

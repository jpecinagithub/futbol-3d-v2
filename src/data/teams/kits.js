// Resolución de equipaciones de contraste (Fase 10).
// Vive fuera del registro JSX para mantener Fast Refresh fiable.

export const ALT_KIT = {
  primary: "#f2f2f2",
  secondary: "#141414",
  shorts: "#141414",
  socks: "#f2f2f2",
};

function hexRgb(hex) {
  const h = String(hex || "#888888").replace("#", "");
  const v = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(v.slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** ¿Se confunden los dos primarios? (distancia euclídea < umbral). */
export function kitsClash(a, b) {
  const [r1, g1, b1] = hexRgb(a);
  const [r2, g2, b2] = hexRgb(b);
  return Math.hypot(r1 - r2, g1 - g2, b1 - b2) < 110;
}

/** Colores a vestir por cada lado. */
export function resolveKits(homeTeam, awayTeam, altOn) {
  if (altOn && kitsClash(homeTeam.colors.primary, awayTeam.colors.primary)) {
    return { home: homeTeam.colors, away: ALT_KIT, clashed: true };
  }
  return { home: homeTeam.colors, away: awayTeam.colors, clashed: false };
}

// Registro de equipos y escudos SVG ORIGINALES.
// Diseños genéricos inspirados SOLO en los colores de cada club
// (círculos, franjas y formas simples). No reproducen escudos oficiales.
// NOTA LINT: registro a propósito (datos + componente); no aplica fast-refresh.

import { realMadrid } from "./realMadrid";
import { barcelona } from "./barcelona";
import { athletic } from "./athletic";
import { realSociedad } from "./realSociedad";

// oxlint-disable-next-line react/only-export-components
export const TEAMS = [realMadrid, barcelona, athletic, realSociedad];

// oxlint-disable-next-line react/only-export-components
export const getTeam = (id) => TEAMS.find((t) => t.id === id);

/** Escudo genérico según la clave `crest` del equipo. */
export function TeamCrest({ crest, size = 64 }) {
  const s = { width: size, height: size };
  switch (crest) {
    case "rma": // círculo blanco, anillo dorado, franja diagonal morada
      return (
        <svg viewBox="0 0 64 64" {...s}>
          <circle cx="32" cy="32" r="30" fill="#ffffff" stroke="#c9a227" strokeWidth="4" />
          <circle cx="32" cy="32" r="22" fill="none" stroke="#1c2c6e" strokeWidth="2" />
          <path d="M10 44 L54 20 L54 28 L10 52 Z" fill="#5b2a86" />
          <circle cx="32" cy="32" r="6" fill="#c9a227" />
        </svg>
      );
    case "bar": // círculo mitad azul / mitad grana con banda amarilla
      return (
        <svg viewBox="0 0 64 64" {...s}>
          <defs>
            <clipPath id="barclip"><circle cx="32" cy="32" r="30" /></clipPath>
          </defs>
          <circle cx="32" cy="32" r="30" fill="#004d98" />
          <g clipPath="url(#barclip)">
            <rect x="32" y="0" width="32" height="64" fill="#a50044" />
            <rect x="0" y="27" width="64" height="10" fill="#edbb00" />
          </g>
          <circle cx="32" cy="32" r="30" fill="none" stroke="#edbb00" strokeWidth="3" />
          <circle cx="32" cy="32" r="7" fill="#edbb00" />
        </svg>
      );
    case "ath": // escudo de franjas verticales rojas y blancas
      return (
        <svg viewBox="0 0 64 64" {...s}>
          <defs>
            <clipPath id="athclip">
              <path d="M8 6 H56 V34 C56 48 46 56 32 60 C18 56 8 48 8 34 Z" />
            </clipPath>
          </defs>
          <path d="M8 6 H56 V34 C56 48 46 56 32 60 C18 56 8 48 8 34 Z" fill="#ffffff" stroke="#1a1a1a" strokeWidth="3" />
          <g clipPath="url(#athclip)">
            <rect x="14" y="0" width="7" height="64" fill="#d0202e" />
            <rect x="28.5" y="0" width="7" height="64" fill="#d0202e" />
            <rect x="43" y="0" width="7" height="64" fill="#d0202e" />
          </g>
        </svg>
      );
    case "rso": // círculo en cuartos azules y blancos con balón central
      return (
        <svg viewBox="0 0 64 64" {...s}>
          <defs>
            <clipPath id="rsoclip"><circle cx="32" cy="32" r="30" /></clipPath>
          </defs>
          <circle cx="32" cy="32" r="30" fill="#ffffff" stroke="#1c5fae" strokeWidth="4" />
          <g clipPath="url(#rsoclip)">
            <rect x="0" y="0" width="32" height="32" fill="#1c5fae" />
            <rect x="32" y="32" width="32" height="32" fill="#1c5fae" />
          </g>
          <circle cx="32" cy="32" r="10" fill="#ffffff" stroke="#1c5fae" strokeWidth="3" />
          <circle cx="32" cy="32" r="3" fill="#1c5fae" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 64 64" {...s}>
          <circle cx="32" cy="32" r="30" fill="#888" />
        </svg>
      );
  }
}

// ---------- Equipaciones de contraste (Fase 10) ----------
// Si los primarios se parecen y el ajuste está activo, el visitante viste
// un alternativo neutro de alto contraste (blanco/negro).
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

/** Colores a vestir por cada lado (respeta porteros: siempre oscuro). */
export function resolveKits(homeTeam, awayTeam, altOn, isGK = false) {
  if (isGK) return null; // el portero mantiene su kit oscuro
  if (altOn && kitsClash(homeTeam.colors.primary, awayTeam.colors.primary)) {
    return { home: homeTeam.colors, away: ALT_KIT, clashed: true };
  }
  return { home: homeTeam.colors, away: awayTeam.colors, clashed: false };
}

// Estado global del partido (zustand).
// Solo estado "alto nivel": fase, equipos, marcador, reloj, eventos.
// La simulación por fotograma (posiciones, balón) vive en el motor mutable
// de src/game/engine.js para no re-renderizar React a 60 FPS.

import { create } from "zustand";
import { DURATION_OPTIONS, MATCH_TIME_SCALE } from "../game/constants";
import { getTeam } from "../data/teams";
import { BIND_ACTIONS, defaultBinding } from "../game/input";

const initialScore = () => ({ home: 0, away: 0 });
// Fase 1: preferencias de cámara/radar/halo persistidas en localStorage.
function loadPref(key, fallback) {
  try {
    if (typeof window === "undefined") return fallback;
    const v = window.localStorage.getItem(key);
    return v === null ? fallback : v;
  } catch {
    return fallback;
  }
}
function savePref(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch { /* almacenamiento no disponible */ }
}
function loadJSONPref(key, fallback) {
  try {
    if (typeof window === "undefined") return fallback;
    const v = window.localStorage.getItem(key);
    return v === null ? fallback : JSON.parse(v);
  } catch {
    return fallback;
  }
}
// Compatibilidad: antes solo había "broadcast" (TV) y "close" (cercana).
function normalizeCamera(v) {
  if (v === "broadcast" || v === "normal") return "normal";
  if (v === "close" || v === "near") return "near";
  if (v === "far") return "far";
  return "normal";
}
export const CAMERA_MODES = ["normal", "near", "far"];
export const CAMERA_LABEL = { normal: "TV", near: "Cercana", far: "Lejos" };
// Fase D: estadísticas arbitrales y de balón parado por equipo
// (el motor las actualiza vía bumpStat; la Fase E las mostrará).
// Fase E: se añaden posesión (segundos con balón), tiros y tiros a puerta.
const initialStats = () => ({
  home: { fouls: 0, yellow: 0, red: 0, corners: 0, offsides: 0, penalties: 0, possession: 0, shots: 0, shotsOnTarget: 0 },
  away: { fouls: 0, yellow: 0, red: 0, corners: 0, offsides: 0, penalties: 0, possession: 0, shots: 0, shotsOnTarget: 0 },
});

export const useMatchStore = create((set, get) => ({
  // ---- flujo de pantallas ----
  phase: "menu", // menu | select | versus | lineups | playing | paused | goal | replay | fulltime
  showStats: false, // overlay de estadísticas (tecla Tab)

  // ---- configuración ----
  homeTeamId: "real-madrid",
  awayTeamId: "barcelona",
  durationMin: 5, // minutos de partido (tiempo real)
  matchId: 0, // crece en cada startMatch: App remonta <Match> (revancha limpia)

  // ---- partido ----
  score: initialScore(),
  clock: 0,            // segundos de partido transcurridos
  events: [],          // { type:'goal', team:'home'|'away', scorer, minute }
  lastGoal: null,      // último gol (para el banner y la repetición)
  controlledId: null,  // id del jugador controlado con el teclado
  notice: null,        // aviso temporal en el HUD (p. ej. "Falta de X")
  replayVideo: null,   // blob URL del vídeo de la última repetición (descargable)
  cameraMode: normalizeCamera(loadPref("f3d.camera", "normal")), // "normal" (TV) | "near" | "far" (Z para ciclar)
  radarOn: loadPref("f3d.radar", "1") !== "0", // minimapa (R para mostrar/ocultar)
  ballHalo: loadPref("f3d.halo", "0") === "1", // halo del balón (H para activar)
  // ---- controles (Fase 3) ----
  controlScheme: loadPref("f3d.scheme", "ijkl") === "wasd" ? "wasd" : "ijkl",
  bindings: loadJSONPref("f3d.bindings", {}), // overrides { scheme: { action: code|[codes] } }
  padDeadzone: Number(loadPref("f3d.padDeadzone", "0.22")) || 0.22,
  padSensitivity: Number(loadPref("f3d.padSensitivity", "1")) || 1,
  // ---- dificultad (Fase 5) ----
  difficulty: ["easy", "normal", "hard"].includes(loadPref("f3d.difficulty", "normal"))
    ? loadPref("f3d.difficulty", "normal")
    : "normal",
  // ---- entrenamiento (Fase 6) ----
  drillId: null, // drill activo (null = partido normal)
  drillRunId: 0, // crece en cada reintento: remonta el partido
  drillsDone: loadJSONPref("f3d.drillsDone", {}), // { drillId: true }
  drillMarker: null, // { x, z, r } objetivo visible del drill (no persistido)
  // ---- sonido (Fase 7): volúmenes 0..1 por categoría ----
  volCrowd: Number(loadPref("f3d.volCrowd", "0.8")) || 0.8,
  volFx: Number(loadPref("f3d.volFx", "0.9")) || 0.9,
  volUi: Number(loadPref("f3d.volUi", "0.9")) || 0.9,
  // ---- gráficos (Fase 9) ----
  gfxQuality: ["baja", "media", "alta"].includes(loadPref("f3d.gfx", "alta"))
    ? loadPref("f3d.gfx", "alta")
    : "alta",
  shadowsOn: loadPref("f3d.shadows", "1") !== "0",
  fpsLimit: [30, 60].includes(Number(loadPref("f3d.fps", "60")))
    ? Number(loadPref("f3d.fps", "60"))
    : 60,
  stats: initialStats(), // faltas, tarjetas, córners, fueras de juego, penaltis, posesión, tiros
  subs: { home: 0, away: 0 }, // sustituciones usadas (máx. 5 por equipo)

  // ---- acciones ----
  setPhase: (phase) => set({ phase }),
  setHomeTeam: (homeTeamId) => set({ homeTeamId }),
  setAwayTeam: (awayTeamId) => set({ awayTeamId }),
  setDuration: (durationMin) => set({ durationMin }),
  setControlled: (controlledId) => set({ controlledId }),
  setNotice: (notice) => set({ notice }),
  /** Guarda la URL del vídeo de la última repetición (o null para ocultarlo). */
  setReplayVideo: (replayVideo) => set({ replayVideo }),
  /** Cicla la cámara: TV → cercana → lejos → TV (Z). Persiste la elección. */
  toggleCamera: () => {
    const cur = normalizeCamera(get().cameraMode);
    const next = cur === "normal" ? "near" : cur === "near" ? "far" : "normal";
    savePref("f3d.camera", next);
    set({ cameraMode: next });
  },
  /** Fija un modo de cámara concreto (lo usa el menú de opciones). */
  setCameraMode: (mode) => {
    const next = normalizeCamera(mode);
    savePref("f3d.camera", next);
    set({ cameraMode: next });
  },
  /** Muestra/oculta el radar (persistido). */
  toggleRadar: () =>
    set((s) => {
      const next = !s.radarOn;
      savePref("f3d.radar", next ? "1" : "0");
      return { radarOn: next };
    }),
  /** Activa/desactiva el halo del balón (persistido). */
  toggleHalo: () =>
    set((s) => {
      const next = !s.ballHalo;
      savePref("f3d.halo", next ? "1" : "0");
      return { ballHalo: next };
    }),
  // ---- controles (Fase 3) ----
  /** Cambia de esquema de teclado (ijkl | wasd), persistido. */
  setControlScheme: (scheme) => {
    const next = scheme === "wasd" ? "wasd" : "ijkl";
    savePref("f3d.scheme", next);
    set({ controlScheme: next });
  },
  /** Reasigna una acción del esquema activo a una tecla (con swap si estaba
   *  ocupada por otra acción: nunca quedan dos acciones en conflicto). */
  setBinding: (action, code) =>
    set((s) => {
      const scheme = s.controlScheme;
      const prev = { ...(s.bindings[scheme] || {}) };
      const eff = (a) => (prev[a] !== undefined ? prev[a] : defaultBinding(scheme, a));
      // Swap: si otra acción usaba esa tecla, le damos la anterior de esta.
      const oldOfAction = eff(action);
      for (const a of [...BIND_ACTIONS, "action"]) {
        if (a === action) continue;
        const v = eff(a);
        const uses = Array.isArray(v) ? v.includes(code) : v === code;
        if (uses) {
          prev[a] = Array.isArray(v)
            ? v.map((c) => (c === code ? oldOfAction : c))
            : oldOfAction;
        }
      }
      prev[action] = action === "sprint" && !Array.isArray(code) ? [code] : code;
      const bindings = { ...s.bindings, [scheme]: prev };
      savePref("f3d.bindings", JSON.stringify(bindings));
      return { bindings };
    }),
  /** Restaura los bindings del esquema activo a sus valores por defecto. */
  resetBindings: () =>
    set((s) => {
      const bindings = { ...s.bindings };
      delete bindings[s.controlScheme];
      savePref("f3d.bindings", JSON.stringify(bindings));
      return { bindings };
    }),
  /** Zona muerta del stick (0–0,5), persistida. */
  setPadDeadzone: (v) => {
    const next = Math.max(0, Math.min(0.5, Number(v) || 0));
    savePref("f3d.padDeadzone", String(next));
    set({ padDeadzone: next });
  },
  /** Sensibilidad del stick (0,5–2), persistida. */
  setPadSensitivity: (v) => {
    const next = Math.max(0.5, Math.min(2, Number(v) || 1));
    savePref("f3d.padSensitivity", String(next));
    set({ padSensitivity: next });
  },
  // ---- dificultad (Fase 5) ----
  /** Nivel de la IA rival (easy | normal | hard), persistido. */
  setDifficulty: (difficulty) => {
    const next = ["easy", "normal", "hard"].includes(difficulty) ? difficulty : "normal";
    savePref("f3d.difficulty", next);
    set({ difficulty: next });
  },
  // ---- entrenamiento (Fase 6) ----
  /** Empieza un drill (fase playing con motor de entrenamiento). */
  startDrill: (drillId) =>
    set((s) => ({
      matchId: s.matchId + 1,
      phase: "playing",
      drillId,
      drillRunId: s.drillRunId + 1,
      score: initialScore(),
      clock: 0,
      events: [],
      lastGoal: null,
      controlledId: null,
      notice: null,
      replayVideo: null,
      stats: initialStats(),
      subs: { home: 0, away: 0 },
      showStats: false,
    })),
  /** Reintenta el drill actual (remonta limpio). */
  retryDrill: () =>
    set((s) => ({
      matchId: s.matchId + 1,
      phase: "playing",
      drillRunId: s.drillRunId + 1,
      score: initialScore(),
      clock: 0,
      events: [],
      lastGoal: null,
      controlledId: null,
      notice: null,
      replayVideo: null,
      stats: initialStats(),
      subs: { home: 0, away: 0 },
      showStats: false,
    })),
  /** Marca un drill como superado (persistido). */
  markDrillDone: (drillId) =>
    set((s) => {
      const drillsDone = { ...s.drillsDone, [drillId]: true };
      savePref("f3d.drillsDone", JSON.stringify(drillsDone));
      return { drillsDone };
    }),
  /** Sale del entrenamiento al menú. */
  quitDrill: () => set({ phase: "menu", drillId: null }),
  /** Objetivo visible del drill (lo pinta TrainingMarker). */
  setDrillMarker: (drillMarker) => set({ drillMarker }),
  // ---- sonido (Fase 7) ----
  /** Volumen de una categoría (crowd|fx|ui), 0..1, persistido. */
  setVolume: (cat, v) => {
    const next = Math.max(0, Math.min(1, Number(v) || 0));
    const key = cat === "crowd" ? "volCrowd" : cat === "fx" ? "volFx" : "volUi";
    savePref(`f3d.${key}`, String(next));
    set({ [key]: next });
  },
  // ---- gráficos (Fase 9) ----
  /** Preset de calidad (baja|media|alta), persistido. */
  setGfxQuality: (q) => {
    const next = ["baja", "media", "alta"].includes(q) ? q : "alta";
    savePref("f3d.gfx", next);
    set({ gfxQuality: next });
  },
  /** Sombras sí/no (persistido; se aplica al instante). */
  toggleShadows: () =>
    set((s) => {
      const next = !s.shadowsOn;
      savePref("f3d.shadows", next ? "1" : "0");
      return { shadowsOn: next };
    }),
  /** Límite de FPS (30|60), persistido. */
  setFpsLimit: (v) => {
    const next = v === 30 ? 30 : 60;
    savePref("f3d.fps", String(next));
    set({ fpsLimit: next });
  },  toggleStats: () =>
    set((s) =>
      s.phase === "playing" || s.phase === "paused"
        ? { showStats: !s.showStats }
        : {}
    ),
  setShowStats: (showStats) => set({ showStats }),
  /** Suma segundos de posesión a un equipo (la llama la sincronización del reloj). */
  setPossession: (home, away) =>
    set((s) => ({
      stats: {
        home: { ...s.stats.home, possession: home },
        away: { ...s.stats.away, possession: away },
      },
    })),
  /** Incrementa una estadística de un equipo ('home'|'away'). */
  bumpStat: (side, key) =>
    set((s) => ({
      stats: {
        ...s.stats,
        [side]: { ...s.stats[side], [key]: (s.stats[side][key] || 0) + 1 },
      },
    })),
  /** Cuenta una sustitución (máx. 5 por equipo y partido). */
  bumpSub: (side) =>
    set((s) => ({ subs: { ...s.subs, [side]: (s.subs[side] || 0) + 1 } })),

  startMatch: () =>
    set((s) => ({
      matchId: s.matchId + 1,
      phase: "playing",
      drillId: null, // partido normal, no entrenamiento
      score: initialScore(),
      clock: 0,
      events: [],
      lastGoal: null,
      controlledId: null,
      notice: null,
      replayVideo: null,
      stats: initialStats(),
      subs: { home: 0, away: 0 },
      showStats: false,
    })),

  pause: () => get().phase === "playing" && set({ phase: "paused" }),
  resume: () => get().phase === "paused" && set({ phase: "playing" }),
  quitToMenu: () =>
    set({
      phase: "menu",
      drillId: null,
      score: initialScore(),
      clock: 0,
      events: [],
      lastGoal: null,
      controlledId: null,
      notice: null,
      replayVideo: null,
      stats: initialStats(),
      subs: { home: 0, away: 0 },
      showStats: false,
    }),

  /** Registra un gol y abre la fase de celebración. */
  goal: (side, scorerName) => {
    const { score, clock, events, replayVideo } = get();
    if (replayVideo) {
      try { URL.revokeObjectURL(replayVideo); } catch { /* nada */ }
    }
    const minute = Math.floor(clock / 60) + 1;
    const entry = { type: "goal", team: side, scorer: scorerName, minute };
    set({
      score: { ...score, [side]: score[side] + 1 },
      events: [...events, entry],
      lastGoal: entry,
      replayVideo: null,
      phase: "goal",
    });
  },

  /** Tras la celebración: entra la repetición automática. */
  startReplay: () => get().phase === "goal" && set({ phase: "replay" }),

  /** Vuelve a "playing" tras la repetición (el motor re-saca de centro). */
  resumeAfterGoal: () => set({ phase: "playing", lastGoal: null, showStats: false }),

  finish: () => set({ phase: "fulltime" }),

  // ---- relojes derivados (solo lectura) ----
  /** Segundos de partido restantes (cuenta atrás). */
  getRemaining: () => {
    const { clock, durationMin } = get();
    return Math.max(0, durationMin * 60 - clock);
  },
  getHomeTeam: () => getTeam(get().homeTeamId),
  getAwayTeam: () => getTeam(get().awayTeamId),
  getTimeScale: () => MATCH_TIME_SCALE,
  getDurationOptions: () => DURATION_OPTIONS,
}));

/** DPR por preset de calidad (Fase 9). */
export const GFX_DPR = { baja: [1, 1], media: [1, 1.25], alta: [1, 1.75] };

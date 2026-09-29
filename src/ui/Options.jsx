// Opciones, historial y confirmaciones (Fase 9).
// OptionsPanel se usa en el menú principal (pantalla "options") y en la
// pestaña de pausa: cámara, esquema, dificultad y gráficos (el sonido vive
// en su pestaña; la reasignación fina, en Controles).

import { useEffect, useRef, useState } from "react";
import { useMatchStore, CAMERA_LABEL, GFX_DPR } from "../stores/useMatchStore";
import { SCHEMES, SCHEME_LABEL } from "../game/input";
import { DIFFICULTY_DESC } from "../game/difficulty";
import { SoundPanel } from "./HUD";

export function OptionsPanel() {
  const cameraMode = useMatchStore((s) => s.cameraMode);
  const setCameraMode = useMatchStore((s) => s.setCameraMode);
  const radarOn = useMatchStore((s) => s.radarOn);
  const toggleRadar = useMatchStore((s) => s.toggleRadar);
  const ballHalo = useMatchStore((s) => s.ballHalo);
  const toggleHalo = useMatchStore((s) => s.toggleHalo);
  const controlScheme = useMatchStore((s) => s.controlScheme);
  const setControlScheme = useMatchStore((s) => s.setControlScheme);
  const difficulty = useMatchStore((s) => s.difficulty);
  const setDifficulty = useMatchStore((s) => s.setDifficulty);
  const gfxQuality = useMatchStore((s) => s.gfxQuality);
  const setGfxQuality = useMatchStore((s) => s.setGfxQuality);
  const shadowsOn = useMatchStore((s) => s.shadowsOn);
  const toggleShadows = useMatchStore((s) => s.toggleShadows);
  const fpsLimit = useMatchStore((s) => s.fpsLimit);
  const setFpsLimit = useMatchStore((s) => s.setFpsLimit);
  const drillId = useMatchStore((s) => s.drillId);

  return (
    <div className="controls-table">
      <h3>CÁMARA Y RADAR</h3>
      <div className="subs-teams">
        {Object.keys(CAMERA_LABEL).map((m) => (
          <button
            key={m}
            className={`duration-btn${m === cameraMode ? " active" : ""}`}
            onClick={() => setCameraMode(m)}
          >
            {CAMERA_LABEL[m]}
          </button>
        ))}
      </div>
      <div className="controls-row">
        <span className="controls-desc">Radar</span>
        <button className="controls-key" onClick={toggleRadar}>{radarOn ? "Visible (R)" : "Oculto (R)"}</button>
      </div>
      <div className="controls-row">
        <span className="controls-desc">Halo del balón</span>
        <button className="controls-key" onClick={toggleHalo}>{ballHalo ? "Sí (H)" : "No (H)"}</button>
      </div>

      <h3>CONTROLES</h3>
      <div className="subs-teams">
        {SCHEMES.map((s) => (
          <button
            key={s}
            className={`duration-btn${s === controlScheme ? " active" : ""}`}
            onClick={() => setControlScheme(s)}
          >
            {SCHEME_LABEL[s]}
          </button>
        ))}
      </div>

      {!drillId && (
        <>
          <h3>DIFICULTAD</h3>
          <div className="subs-teams">
            {[["easy", "Fácil"], ["normal", "Normal"], ["hard", "Difícil"]].map(([v, label]) => (
              <button
                key={v}
                className={`duration-btn${v === difficulty ? " active" : ""}`}
                onClick={() => setDifficulty(v)}
                title={DIFFICULTY_DESC[v]}
              >
                {label}
              </button>
            ))}
          </div>
        </>
      )}

      <h3>GRÁFICOS</h3>
      <div className="subs-teams">
        {[["baja", "Baja"], ["media", "Media"], ["alta", "Alta"]].map(([v, label]) => (
          <button
            key={v}
            className={`duration-btn${v === gfxQuality ? " active" : ""}`}
            onClick={() => setGfxQuality(v)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="controls-row">
        <span className="controls-desc">Sombras</span>
        <button className="controls-key" onClick={toggleShadows}>{shadowsOn ? "Sí" : "No"}</button>
      </div>
      <div className="controls-row">
        <span className="controls-desc">Límite de FPS</span>
        <span>
          <button className={`controls-key${fpsLimit === 30 ? " active-btn" : ""}`} onClick={() => setFpsLimit(30)}>30</button>{" "}
          <button className={`controls-key${fpsLimit === 60 ? " active-btn" : ""}`} onClick={() => setFpsLimit(60)}>60</button>
        </span>
      </div>
      <p className="controls-note">
        Los gráficos se aplican al instante sin perder el partido (DPR {GFX_DPR[gfxQuality].join("–")}).
      </p>

      <h3>SONIDO</h3>
      <SoundPanel />
    </div>
  );
}

/** Botón con confirmación en dos pasos (reiniciar, salir...). */
export function ConfirmButton({ onConfirm, className = "btn btn-secondary", children, armText = "¿Seguro? pulsa otra vez" }) {
  const [armed, setArmed] = useState(false);
  const t = useRef(null);
  useEffect(() => () => clearTimeout(t.current), []);
  if (!armed) {
    return (
      <button
        className={className}
        onClick={() => {
          setArmed(true);
          t.current = setTimeout(() => setArmed(false), 3000);
        }}
      >
        {children}
      </button>
    );
  }
  return (
    <button
      className={className}
      onClick={() => {
        clearTimeout(t.current);
        setArmed(false);
        onConfirm();
      }}
    >
      {armText}
    </button>
  );
}

/** Historial de eventos del partido (Fase 9): goles, tarjetas y cambios. */
export function HistoryPanel() {
  const events = useMatchStore((s) => s.events);
  const { getHomeTeam, getAwayTeam } = useMatchStore();
  const home = getHomeTeam();
  const away = getAwayTeam();
  const abbr = (side) => (side === "home" ? home.abbreviation : away.abbreviation);
  const rows = [];
  for (const e of events) {
    if (e.type === "goal") rows.push({ min: e.minute, text: `⚽ ¡Gol de ${e.scorer}! (${abbr(e.team)})` });
  }
  const engine = typeof window !== "undefined" ? window.__match?.engine : null;
  if (engine) {
    for (const f of engine.fouls || []) {
      const card = f.card === "yellow" ? " 🟨" : f.card === "yellow2" || f.card === "red" ? " 🟥" : "";
      rows.push({ min: f.minute || 1, text: `⛔ Falta de ${f.byName} a ${f.victimName}${card}` });
    }
    for (const s of engine.subLog || []) {
      rows.push({ min: s.minute || 1, text: `🔄 Cambio (${abbr(s.side)}): sale ${s.out}, entra ${s.in}` });
    }
  }
  rows.sort((a, b) => a.min - b.min);
  if (!rows.length) return <p className="hint">Sin eventos todavía.</p>;
  return (
    <ul className="events">
      {rows.map((r, i) => (
        <li key={i}>{r.min}&prime; — {r.text}</li>
      ))}
    </ul>
  );
}

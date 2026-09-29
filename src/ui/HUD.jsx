// HUD y overlays del partido, todo en español (Fase E: estilo retransmisión
// propio). Marcador con escudos, reloj en minutos de partido, banners de
// eventos, indicador de balón parado, overlay de estadísticas (Tab), pausa
// con pestañas (controles / estadísticas / cambios) y pantalla final.

import { useState, useEffect } from "react";
import { useMatchStore, CAMERA_LABEL } from "../stores/useMatchStore";
import { TeamCrest } from "../data/teams";
import { StatsTable } from "./StatsTable";
import { Radar } from "./Radar";
import { OptionsPanel, ConfirmButton, HistoryPanel } from "./Options";
import {
  BIND_ACTIONS, ACTION_LABEL, SCHEMES, SCHEME_LABEL,
  resolveBindings, keyLabel,
} from "../game/input";
import { substitutionCandidates, availableSubs } from "../game/engine";

// ---------- Marcador estilo retransmisión ----------
export function HUD() {
  const { score, clock, getHomeTeam, getAwayTeam } = useMatchStore();
  const cameraMode = useMatchStore((s) => s.cameraMode);
  const controlScheme = useMatchStore((s) => s.controlScheme);
  const home = getHomeTeam();
  const away = getAwayTeam();
  const min = Math.floor(clock / 60);
  const moveKeys = controlScheme === "wasd" ? "WASD/Flechas" : "IJKL/Flechas";
  const actKeys = controlScheme === "wasd"
    ? "E: pase (mantener: potencia) · Espacio: tiro · F: entrada · X: alto · C: hueco"
    : "A: pasar / entrada (mantener: tiro) · X: alto · C: hueco";
  return (
    <>
      <div className="hud">
        <div className="scoreboard">
          <TeamCrest crest={home.crest} size={30} />
          <span className="abr">{home.abbreviation}</span>
          <span className="goals">{score.home} - {score.away}</span>
          <span className="abr">{away.abbreviation}</span>
          <TeamCrest crest={away.crest} size={30} />
          <span className="clock">{min}&prime;</span>
        </div>
      </div>
      <DeadBallIndicator />
      <Radar />
      <InputBadge />
      <div className="camera-badge">
        📷 {CAMERA_LABEL[cameraMode] || "TV"} · <b>Z</b> cambia
      </div>
      <div className="hud-hint">
        <b>{moveKeys}:</b> mover · <b>Shift:</b> correr · {actKeys} ·{" "}
        <b>Q:</b> cambiar · <b>Z:</b> cámara · <b>R:</b> radar · <b>Tab:</b> estadísticas · <b>Esc:</b> pausa
      </div>
    </>
  );
}

// ---------- Indicador de balón parado ----------
const KIND_TEXT = {
  "throw-in": "Saque de banda",
  corner: "Córner",
  "goal-kick": "Saque de puerta",
  "free-kick": "Tiro libre",
  penalty: "Penalti",
};

export function DeadBallIndicator() {
  const [info, setInfo] = useState(null);
  useEffect(() => {
    const id = setInterval(() => {
      const db = window.__match?.engine?.deadBall;
      if (db && (db.state === "DEAD_BALL_SETUP" || db.state === "DEAD_BALL_READY")) {
        setInfo((v) =>
          v && v.kind === db.kind && v.userKicking === db.userKicking && v.userKeeping === db.userKeeping
            ? v
            : { kind: db.kind, userKicking: db.userKicking, userKeeping: db.userKeeping }
        );
      } else {
        setInfo((v) => (v ? null : v));
      }
    }, 250);
    return () => clearInterval(id);
  }, []);
  if (!info) return null;
  let instr = "Apunta con IJKL · A para sacar";
  if (info.kind === "penalty" && info.userKeeping) {
    instr = "Mueve al portero con J/L · A para lanzarte";
  } else if (info.kind === "penalty") {
    instr = "Apunta con IJKL · A para tirar (mantener: con carga)";
  } else if (info.kind === "free-kick") {
    instr = "Apunta con IJKL · A para sacar (mantener: tiro con carga)";
  }
  return (
    <div className="deadball-indicator">
      <b>{KIND_TEXT[info.kind] || "Balón parado"}</b>
      <span>{instr}</span>
    </div>
  );
}

// ---------- Indicador del dispositivo de entrada (Fase 3) ----------
// ⌨ teclado o 🎮 mando, según el último usado (el mando se detecta solo).
export function InputBadge() {
  const [source, setSource] = useState("keys");
  useEffect(() => {
    const id = setInterval(() => {
      const s = window.__match?.engine?.inputSource;
      setSource((v) => (s && s !== v ? s : v));
    }, 500);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="input-badge" title="Dispositivo detectado automáticamente">
      {source === "pad" ? "🎮 Mando" : "⌨ Teclado"}
    </div>
  );
}

// ---------- Aviso temporal (faltas, tarjetas, fueras de juego, penaltis) ----------
export function NoticeToast() {
  const notice = useMatchStore((s) => s.notice);
  if (!notice) return null;
  return <div className="notice-toast">{notice}</div>;
}

// ---------- Banner de gol ----------
export function GoalBanner() {
  const lastGoal = useMatchStore((s) => s.lastGoal);
  const { getHomeTeam, getAwayTeam } = useMatchStore();
  if (!lastGoal) return null;
  const team = lastGoal.team === "home" ? getHomeTeam() : getAwayTeam();
  return (
    <div className="goal-banner">
      <h1>¡GOOOL!</h1>
      <p>¡Gol de {lastGoal.scorer}!</p>
      <p className="goal-sub">
        {team.abbreviation} · {lastGoal.minute}&prime;
      </p>
    </div>
  );
}

// ---------- Rótulo de la repetición ----------
export function ReplayLabel() {
  const lastGoal = useMatchStore((s) => s.lastGoal);
  const { getHomeTeam, getAwayTeam } = useMatchStore();
  if (!lastGoal) return null;
  const team = lastGoal.team === "home" ? getHomeTeam() : getAwayTeam();
  return (
    <div className="replay-label">
      <div className="replay-tag">REPETICIÓN · CÁMARA LENTA</div>
      <div className="replay-scorer">
        ⚽ {lastGoal.scorer} · {team.abbreviation} {lastGoal.minute}&prime;
      </div>
      <div className="replay-hint">Enter: saltar · Espacio: pausa · ←/→: navegar</div>
    </div>
  );
}

/** Botón para descargar la última repetición como vídeo (.webm). Aparece
 *  al terminar la repetición y queda disponible hasta el siguiente gol. */
export function ReplayDownloadButton() {
  const url = useMatchStore((s) => s.replayVideo);
  if (!url) return null;
  const download = () => {
    const a = document.createElement("a");
    a.href = url;
    a.download = "repeticion-gol.webm";
    document.body.appendChild(a);
    a.click();
    a.remove();
    try { URL.revokeObjectURL(url); } catch { /* nada */ }
    useMatchStore.getState().setReplayVideo(null);
  };
  return (
    <button className="replay-download" onClick={download}>
      ⬇ Descargar repetición (.webm)
    </button>
  );
}

// ---------- Overlay de estadísticas (tecla Tab) ----------
export function StatsOverlay() {
  const showStats = useMatchStore((s) => s.showStats);
  const phase = useMatchStore((s) => s.phase);
  if (!showStats || (phase !== "playing" && phase !== "paused")) return null;
  return (
    <div className="stats-overlay">
      <h3>
        ESTADÍSTICAS <span className="stats-tab-hint">— Tab para cerrar</span>
      </h3>
      <StatsTable />
    </div>
  );
}

// ---------- Tabla de controles (integrada en la pausa, Fase 3) ----------
// Muestra el esquema activo (IJKL/WASD), permite cambiarlo, reasignar teclas
// (clic en la tecla y pulsar la nueva; Esc cancela) y ajustar el mando.
function SchemeControls() {
  const controlScheme = useMatchStore((s) => s.controlScheme);
  const setControlScheme = useMatchStore((s) => s.setControlScheme);
  const bindings = useMatchStore((s) => s.bindings);
  const setBinding = useMatchStore((s) => s.setBinding);
  const resetBindings = useMatchStore((s) => s.resetBindings);
  const padDeadzone = useMatchStore((s) => s.padDeadzone);
  const padSensitivity = useMatchStore((s) => s.padSensitivity);
  const setPadDeadzone = useMatchStore((s) => s.setPadDeadzone);
  const setPadSensitivity = useMatchStore((s) => s.setPadSensitivity);
  const [capturing, setCapturing] = useState(null); // acción en captura | null
  const resolved = resolveBindings(controlScheme, bindings);

  useEffect(() => {
    if (!capturing) return undefined;
    const h = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.code !== "Escape") setBinding(capturing, e.code);
      setCapturing(null);
    };
    window.addEventListener("keydown", h, true);
    return () => window.removeEventListener("keydown", h, true);
  }, [capturing, setBinding]);

  const keyOf = (a) => {
    const v = resolved[a];
    return Array.isArray(v) ? v.map(keyLabel).join(" / ") : keyLabel(v);
  };

  return (
    <div className="controls-table">
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
      {BIND_ACTIONS.map((a) => (
        <div className="controls-row" key={a}>
          <span className="controls-desc">{ACTION_LABEL[a]}</span>
          <button
            className={`controls-key${capturing === a ? " capturing" : ""}`}
            onClick={() => setCapturing(a)}
          >
            {capturing === a ? "pulsa una tecla…" : keyOf(a)}
          </button>
        </div>
      ))}
      <p className="controls-note">
        {controlScheme === "ijkl"
          ? "En IJKL la tecla de pase/tiro/entrada es contextual: toque = pase, mantener = tiro, sin balón = entrada. Sprint al pasar = pase tenso; sprint al tirar = potente; carga corta = colocado; C durante la carga = vaselina. Las flechas siempre mueven."
          : "En WASD la S mueve (Shift corre: sin conflicto). E = pase (mantener = potencia, sale al soltar); Espacio = tiro; F = entrada. Sprint al pasar/tirar = tenso/potente; carga corta = colocado; C durante la carga = vaselina. Las flechas siempre mueven."}
      </p>
      <p className="controls-note">
        Pulsa <b>Esc</b> mientras capturas para cancelar.{" "}
        <button className="link-btn" onClick={resetBindings}>Restablecer teclas</button>
      </p>
      <h3>MANDO</h3>
      <div className="controls-row">
        <span className="controls-desc">Zona muerta del stick ({padDeadzone.toFixed(2)})</span>
        <span>
          <button className="controls-key" onClick={() => setPadDeadzone(padDeadzone - 0.05)}>−</button>{" "}
          <button className="controls-key" onClick={() => setPadDeadzone(padDeadzone + 0.05)}>+</button>
        </span>
      </div>
      <div className="controls-row">
        <span className="controls-desc">Sensibilidad ({padSensitivity.toFixed(1)})</span>
        <span>
          <button className="controls-key" onClick={() => setPadSensitivity(padSensitivity - 0.1)}>−</button>{" "}
          <button className="controls-key" onClick={() => setPadSensitivity(padSensitivity + 0.1)}>+</button>
        </span>
      </div>
      <p className="controls-pad">
        Mando: stick izq. mover · RT sprint · A pase · Y hueco · B tiro ·
        X centro · LB cambiar · RB 2º defensor · LT regate
      </p>
    </div>
  );
}

export function ControlsTable() {
  return <SchemeControls />;
}

// ---------- Panel de sonido (Fase 7): volúmenes por categoría ----------
const VOL_ROWS = [
  ["crowd", "Ambiente", "Grada, cánticos y reacciones"],
  ["fx", "Efectos", "Golpeos, madera, red, entradas y silbatos"],
  ["ui", "Interfaz", "Clics de menús"],
];

export function SoundPanel() {
  const volCrowd = useMatchStore((s) => s.volCrowd);
  const volFx = useMatchStore((s) => s.volFx);
  const volUi = useMatchStore((s) => s.volUi);
  const vols = { crowd: volCrowd, fx: volFx, ui: volUi };
  const setVolume = useMatchStore((s) => s.setVolume);
  return (
    <div className="controls-table">
      <h3>SONIDO</h3>
      {VOL_ROWS.map(([cat, label, desc]) => (
        <div className="controls-row" key={cat}>
          <span className="controls-desc">{label} <span className="controls-sub">{desc}</span></span>
          <span>
            <button className="controls-key" onClick={() => setVolume(cat, vols[cat] - 0.1)}>−</button>{" "}
            <span className="vol-val">{Math.round(vols[cat] * 100)}</span>{" "}
            <button className="controls-key" onClick={() => setVolume(cat, vols[cat] + 0.1)}>+</button>
          </span>
        </div>
      ))}
    </div>
  );
}

// ---------- Sustituciones (pausa): titular por suplente, máx. 5 por equipo ----------
function SubstitutionPanel() {
  const subs = useMatchStore((s) => s.subs);
  const [side, setSide] = useState("home");
  const [titular, setTitular] = useState("");
  const [suplente, setSuplente] = useState("");
  const [msg, setMsg] = useState("");
  const engine = window.__match?.engine;
  if (!engine) return <p className="hint">Motor no disponible</p>;

  const cands = substitutionCandidates(engine, side);
  const bench = availableSubs(engine, side);
  const left = 5 - (subs[side] || 0);

  const doIt = () => {
    const r = window.__match.doSubstitution(side, titular, suplente);
    if (r.ok) {
      setMsg(`Cambio realizado: sale ${r.out}, entra ${r.in}.`);
      setTitular("");
      setSuplente("");
    } else {
      setMsg(`No se pudo hacer el cambio: ${r.error}.`);
    }
  };

  return (
    <div className="subs-panel">
      <div className="subs-teams">
        <button
          className={`duration-btn${side === "home" ? " active" : ""}`}
          onClick={() => { setSide("home"); setTitular(""); setSuplente(""); setMsg(""); }}
        >
          Local
        </button>
        <button
          className={`duration-btn${side === "away" ? " active" : ""}`}
          onClick={() => { setSide("away"); setTitular(""); setSuplente(""); setMsg(""); }}
        >
          Visitante
        </button>
        <span className="subs-left">Cambios restantes: {left}/5</span>
      </div>
      <div className="subs-row">
        <label>
          Sale (titular)
          <select value={titular} onChange={(e) => setTitular(e.target.value)}>
            <option value="">— elige —</option>
            {cands.map((p) => (
              <option key={p.uid} value={p.uid}>
                {p.data.number} · {p.data.name} ({p.role})
              </option>
            ))}
          </select>
        </label>
        <label>
          Entra (suplente)
          <select value={suplente} onChange={(e) => setSuplente(e.target.value)}>
            <option value="">— elige —</option>
            {bench.map((d) => (
              <option key={d.id} value={d.id}>
                {d.number} · {d.name} ({d.position})
              </option>
            ))}
          </select>
        </label>
      </div>
      <button
        className="btn"
        disabled={!titular || !suplente || left <= 0}
        onClick={doIt}
      >
        Hacer cambio
      </button>
      {msg && <p className="subs-msg">{msg}</p>}
    </div>
  );
}

// ---------- Menú de pausa con pestañas (Fase 9: opciones, historial,
// reinicio limpio y salidas con confirmación) ----------
export function PauseMenu() {
  const { resume, quitToMenu, startMatch, quitDrill, retryDrill } = useMatchStore();
  const difficulty = useMatchStore((s) => s.difficulty);
  const setDifficulty = useMatchStore((s) => s.setDifficulty);
  const drillId = useMatchStore((s) => s.drillId);
  const [tab, setTab] = useState("controles"); // controles | sonido | opciones | historial | stats | cambios
  return (
    <div className="overlay">
      <h2>PAUSA</h2>
      <p className="hint">Tómate un respiro, míster</p>
      {!drillId && (
        <div className="subs-teams">
          <span className="subs-left">Dificultad:</span>
          {[["easy", "Fácil"], ["normal", "Normal"], ["hard", "Difícil"]].map(([v, label]) => (
            <button
              key={v}
              className={`duration-btn${v === difficulty ? " active" : ""}`}
              onClick={() => setDifficulty(v)}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      <div className="pause-tabs">
        <button
          className={`duration-btn${tab === "controles" ? " active" : ""}`}
          onClick={() => setTab("controles")}
        >
          Controles
        </button>
        <button
          className={`duration-btn${tab === "sonido" ? " active" : ""}`}
          onClick={() => setTab("sonido")}
        >
          Sonido
        </button>
        <button
          className={`duration-btn${tab === "opciones" ? " active" : ""}`}
          onClick={() => setTab("opciones")}
        >
          Opciones
        </button>
        <button
          className={`duration-btn${tab === "historial" ? " active" : ""}`}
          onClick={() => setTab("historial")}
        >
          Historial
        </button>
        <button
          className={`duration-btn${tab === "stats" ? " active" : ""}`}
          onClick={() => setTab("stats")}
        >
          Estadísticas
        </button>
        <button
          className={`duration-btn${tab === "cambios" ? " active" : ""}`}
          onClick={() => setTab("cambios")}
        >
          Cambios
        </button>
      </div>
      {tab === "controles" && <ControlsTable />}
      {tab === "sonido" && <SoundPanel />}
      {tab === "opciones" && <OptionsPanel />}
      {tab === "historial" && <HistoryPanel />}
      {tab === "stats" && <StatsTable />}
      {tab === "cambios" && <SubstitutionPanel />}
      <div>
        <button className="btn" onClick={resume}>Continuar</button>
        {!drillId && (
          <ConfirmButton onConfirm={startMatch} armText="¿Reiniciar el partido?">
            Reiniciar
          </ConfirmButton>
        )}
        {drillId && (
          <ConfirmButton onConfirm={retryDrill} armText="¿Repetir el ejercicio?">
            Repetir
          </ConfirmButton>
        )}
        <ConfirmButton onConfirm={drillId ? quitDrill : quitToMenu} armText="¿Abandonar?">
          Salir al menú
        </ConfirmButton>
      </div>
    </div>
  );
}

// ---------- Pantalla final: resultado, goleadores y comparativa ----------
export function FullTimeScreen() {
  const { score, events, getHomeTeam, getAwayTeam, quitToMenu, setPhase, startMatch } =
    useMatchStore();
  const drillId = useMatchStore((s) => s.drillId);
  const retryDrill = useMatchStore((s) => s.retryDrill);
  const home = getHomeTeam();
  const away = getAwayTeam();
  const winner =
    score.home > score.away ? home.name : score.away > score.home ? away.name : null;
  return (
    <div className="overlay">
      <h2>FINAL DEL PARTIDO</h2>
      <div className="final-score">
        <TeamCrest crest={home.crest} size={44} /> {home.abbreviation}{" "}
        <span className="goals">{score.home} - {score.away}</span>{" "}
        {away.abbreviation} <TeamCrest crest={away.crest} size={44} />
      </div>
      <p className="hint">{winner ? `Victoria de ${winner}` : "Empate"}</p>
      {events.length > 0 && (
        <>
          <h3 className="final-h3">Goleadores</h3>
          <ul className="events">
            {events.map((e, i) => (
              <li key={i}>
                ⚽ {e.minute}&prime; — {e.scorer} (
                {e.team === "home" ? home.abbreviation : away.abbreviation})
              </li>
            ))}
          </ul>
        </>
      )}
      <h3 className="final-h3">Estadísticas</h3>
      <StatsTable />
      <div>
        <button className="btn" onClick={drillId ? retryDrill : startMatch}>Revancha</button>
        <button className="btn btn-secondary" onClick={() => setPhase("select")}>
          Cambiar equipos
        </button>
        <button className="btn btn-secondary" onClick={quitToMenu}>
          Menú principal
        </button>
      </div>
    </div>
  );
}

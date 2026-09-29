// Pantallas del flujo: menú → selector → versus → alineaciones.

import { useState } from "react";
import { useMatchStore } from "../stores/useMatchStore";
import { TEAMS, TeamCrest } from "../data/teams";
import { assignSpots } from "../game/formations";
import { DIFFICULTY_DESC } from "../game/difficulty";
import { DRILLS } from "../training/drills";
import { OptionsPanel } from "./Options";
import { uiClick } from "../audio/audioEngine";

export function MainMenu() {
  const setPhase = useMatchStore((s) => s.setPhase);
  return (
    <div className="screen">
      <h1 className="game-title">FÚTBOL 3D</h1>
      <p className="game-subtitle">Estadio Aurora · 11 contra 11 · 100 % original</p>
      <button className="btn" onClick={() => { try { uiClick(); } catch { /* nada */ } setPhase("select"); }}>Jugar partido</button>
      <button className="btn btn-secondary" onClick={() => { try { uiClick(); } catch { /* nada */ } setPhase("drills"); }}>Entrenamiento</button>
      <button className="btn btn-secondary" onClick={() => { try { uiClick(); } catch { /* nada */ } setPhase("options"); }}>Opciones</button>
      <p className="hint" style={{ marginTop: 24 }}>
        Mueve con IJKL, WASD o las flechas · Cambia el esquema en Pausa → Controles
      </p>
    </div>
  );
}

export function TeamSelect() {
  const { homeTeamId, awayTeamId, setHomeTeam, setAwayTeam, setPhase } = useMatchStore();
  const [picking, setPicking] = useState("home"); // 'home' | 'away' | 'done'

  const choose = (id) => {
    if (picking === "home") {
      setHomeTeam(id);
      setPicking("away");
    } else if (picking === "away") {
      if (id === homeTeamId) return; // no vale el mismo equipo
      setAwayTeam(id);
      setPicking("done");
    }
  };

  const cardClass = (id) => {
    let c = "team-card";
    if (id === homeTeamId && picking !== "home") c += " selected-home";
    if (id === awayTeamId && picking === "done") c += " selected-away";
    return c;
  };

  return (
    <div className="screen">
      <h2>
        {picking === "home" && "ELIGE EL EQUIPO LOCAL"}
        {picking === "away" && "ELIGE EL EQUIPO VISITANTE"}
        {picking === "done" && "EQUIPOS ELEGIDOS"}
      </h2>
      <p className="hint">
        {picking === "home" && "Primero el local (amarillo)"}
        {picking === "away" && "Ahora el visitante (rojo) — no puede ser el mismo"}
        {picking === "done" && "Pulsa continuar para ver el cartel del partido"}
      </p>
      <div className="team-grid">
        {TEAMS.map((t) => (
          <div key={t.id} className={cardClass(t.id)} onClick={() => choose(t.id)}>
            <div
              className="team-stripe"
              style={{ background: `linear-gradient(90deg, ${t.colors.primary}, ${t.colors.secondary})` }}
            />
            <TeamCrest crest={t.crest} size={72} />
            <h3>{t.name}</h3>
            <div className="formation">{t.formation}</div>
            {picking !== "home" && t.id === homeTeamId && (
              <div className="pick-badge pick-home">LOCAL</div>
            )}
            {picking === "done" && t.id === awayTeamId && (
              <div className="pick-badge pick-away">VISITANTE</div>
            )}
          </div>
        ))}
      </div>
      <div>
        <button className="btn btn-secondary" onClick={() => setPhase("menu")}>Atrás</button>
        <button
          className="btn"
          disabled={picking !== "done"}
          onClick={() => setPhase("versus")}
        >
          Continuar
        </button>
      </div>
    </div>
  );
}

export function VersusScreen() {
  const { getHomeTeam, getAwayTeam, setPhase, durationMin, setDuration, getDurationOptions } =
    useMatchStore();
  const difficulty = useMatchStore((s) => s.difficulty);
  const setDifficulty = useMatchStore((s) => s.setDifficulty);
  const home = getHomeTeam();
  const away = getAwayTeam();
  return (
    <div className="screen">
      <h2>CARTEL DEL PARTIDO</h2>
      <div className="versus">
        <div className="side">
          <div className="label">Equipo local</div>
          <TeamCrest crest={home.crest} size={120} />
          <h2>{home.name}</h2>
          <div className="formation">{home.formation}</div>
        </div>
        <div className="vs">VS</div>
        <div className="side">
          <div className="label">Equipo visitante</div>
          <TeamCrest crest={away.crest} size={120} />
          <h2>{away.name}</h2>
          <div className="formation">{away.formation}</div>
        </div>
      </div>
      <div className="duration-row">
        <span>Duración:</span>
        {getDurationOptions().map((m) => (
          <button
            key={m}
            className={`duration-btn${m === durationMin ? " active" : ""}`}
            onClick={() => setDuration(m)}
          >
            {m} min
          </button>
        ))}
      </div>
      <div className="duration-row">
        <span>Dificultad:</span>
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
      <p className="hint">{DIFFICULTY_DESC[difficulty]}</p>
      <div>
        <button className="btn btn-secondary" onClick={() => setPhase("select")}>Cambiar equipos</button>
        <button className="btn" onClick={() => setPhase("lineups")}>Ver alineaciones</button>
      </div>
    </div>
  );
}

export function LineupsScreen() {
  const { getHomeTeam, getAwayTeam, setPhase, startMatch } = useMatchStore();
  const home = getHomeTeam();
  const away = getAwayTeam();

  return (
    <div className="screen">
      <h2>ALINEACIONES</h2>
      <div className="lineups-pitch">
        <FormationPitch team={home} isHome={true} tag="Local" />
        <FormationPitch team={away} isHome={false} tag="Visitante" />
      </div>
      <div>
        <button className="btn btn-secondary" onClick={() => setPhase("versus")}>Atrás</button>
        <button className="btn" onClick={startMatch}>¡A jugar!</button>
      </div>
    </div>
  );
}

/**
 * Campo dibujado con los 11 titulares en su puesto táctico (Fase E).
 * El SVG usa metros reales como unidades (105×68): assignSpots devuelve
 * coordenadas de motor y se trasladan al rectángulo del campo.
 */
function FormationPitch({ team, isHome, tag }) {
  const starters = team.players.slice(0, 11);
  const bench = team.players.slice(11);
  const spots = assignSpots(team.formation, starters, isHome);
  const X = (x) => x + 52.5; // -52.5..52.5 -> 0..105
  const Z = (z) => z + 34;   // -34..34 -> 0..68
  return (
    <div className="pitch-col">
      <h3>
        <TeamCrest crest={team.crest} size={30} /> {team.name}
      </h3>
      <div className="formation">
        {tag} · {team.formation}
      </div>
      <svg viewBox="-2 -2 109 72" className="mini-pitch">
        <rect x="0" y="0" width="105" height="68" className="mp-field" />
        <line x1="52.5" y1="0" x2="52.5" y2="68" className="mp-line" />
        <circle cx="52.5" cy="34" r="9.15" className="mp-line" />
        <rect x="0" y="13.84" width="16.5" height="40.32" className="mp-line" />
        <rect x="88.5" y="13.84" width="16.5" height="40.32" className="mp-line" />
        {spots.map((s, i) => (
          <g key={starters[i].id}>
            <circle cx={X(s.x)} cy={Z(s.z)} r="3.6" className="mp-dot" />
            <text x={X(s.x)} y={Z(s.z) + 1.5} textAnchor="middle" className="mp-num">
              {starters[i].number}
            </text>
            <text x={X(s.x)} y={Z(s.z) + 7.2} textAnchor="middle" className="mp-name">
              {starters[i].name}
            </text>
          </g>
        ))}
      </svg>
      <div className="mp-bench">
        <b>Suplentes:</b>{" "}
        {bench.map((p) => `${p.number} ${p.name}`).join(" · ")}
      </div>
    </div>
  );
}

/** Lista de ejercicios del modo entrenamiento (Fase 6). */
export function DrillsScreen() {
  const { setPhase, startDrill, drillsDone } = useMatchStore();
  return (
    <div className="screen">
      <h2>ENTRENAMIENTO</h2>
      <p className="hint">7 ejercicios con la IA congelada · se guarda tu progreso</p>
      <div className="drill-list">
        {DRILLS.map((d) => (
          <button key={d.id} className="drill-item" onClick={() => { try { uiClick(); } catch { /* nada */ } startDrill(d.id); }}>
            <span className="drill-item-title">{drillsDone[d.id] ? "✅ " : ""}{d.title}</span>
            <span className="drill-item-hint">{d.hint}</span>
          </button>
        ))}
      </div>
      <div>
        <button className="btn btn-secondary" onClick={() => setPhase("menu")}>Atrás</button>
      </div>
    </div>
  );
}

/** Pantalla de opciones (Fase 9): mismo panel que en la pausa. */
export function OptionsScreen() {
  const setPhase = useMatchStore((s) => s.setPhase);
  return (
    <div className="screen">
      <h2>OPCIONES</h2>
      <p className="hint">Todo se guarda automáticamente en este navegador</p>
      <div className="options-sheet">
        <OptionsPanel />
      </div>
      <div>
        <button className="btn btn-secondary" onClick={() => setPhase("menu")}>Atrás</button>
      </div>
    </div>
  );
}

// Tabla de estadísticas comparativa por equipo (Fase E).
// Lee los contadores del store (el motor los actualiza vía bumpStat y la
// sincronización de posesión). Se usa en el overlay de Tab, en la pausa y
// en la pantalla de fin de partido.

import { useMatchStore } from "../stores/useMatchStore";
import { TeamCrest } from "../data/teams";

const ROWS = [
  { key: "possessionPct", label: "Posesión %" },
  { key: "shots", label: "Tiros" },
  { key: "shotsOnTarget", label: "Tiros a puerta" },
  { key: "fouls", label: "Faltas" },
  { key: "yellow", label: "Amarillas" },
  { key: "red", label: "Rojas" },
  { key: "corners", label: "Córners" },
  { key: "offsides", label: "Fueras de juego" },
  { key: "penalties", label: "Penaltis" },
];

function cellValue(key, side, stats) {
  const s = stats[side];
  switch (key) {
    case "possessionPct": {
      const tot = s.possession + stats[side === "home" ? "away" : "home"].possession;
      if (tot <= 0.01) return "50%";
      return `${Math.round((s.possession / tot) * 100)}%`;
    }
    case "shots":
      return `${s.shots} (${s.shotsOnTarget})`;
    default:
      return String(s[key] ?? 0);
  }
}

export function StatsTable() {
  const { stats, getHomeTeam, getAwayTeam } = useMatchStore();
  const home = getHomeTeam();
  const away = getAwayTeam();
  return (
    <div className="stats-table-wrap">
      <table className="stats-table">
        <thead>
          <tr>
            <th className="st-team">
              <TeamCrest crest={home.crest} size={26} /> {home.abbreviation}
            </th>
            <th className="st-label">ESTADÍSTICAS</th>
            <th className="st-team">
              {away.abbreviation} <TeamCrest crest={away.crest} size={26} />
            </th>
          </tr>
        </thead>
        <tbody>
          {ROWS.map((r) => {
            const hv = cellValue(r.key, "home", stats);
            const av = cellValue(r.key, "away", stats);
            const hN = parseFloat(hv), aN = parseFloat(av);
            return (
              <tr key={r.key}>
                <td className={`st-val${hN > aN ? " st-best" : ""}`}>{hv}</td>
                <td className="st-label">{r.label}</td>
                <td className={`st-val${aN > hN ? " st-best" : ""}`}>{av}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="stats-note">Tiros: totales (a puerta)</p>
    </div>
  );
}

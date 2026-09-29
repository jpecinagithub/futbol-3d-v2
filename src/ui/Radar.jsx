// Radar / minimapa del partido (Fase 1).
// Canvas 2D barato (~10 Hz): campo 105×68, puntos por jugador con los
// colores de cada equipo, balón destacado y anillo en el controlado.
// Se muestra/oculta con R (preferencia persistida `f3d.radar`).

import { useEffect, useRef } from "react";
import { useMatchStore } from "../stores/useMatchStore";
import { FIELD } from "../game/constants";

const W = 152;
const H = 100;

export function Radar() {
  const radarOn = useMatchStore((s) => s.radarOn);
  const ref = useRef(null);

  useEffect(() => {
    if (!radarOn) return;
    const cv = ref.current;
    if (!cv) return;
    const g = cv.getContext("2d");
    const sx = W / FIELD.length;
    const sz = H / FIELD.width;
    const px = (x) => (x + FIELD.halfLength) * sx;
    const pz = (z) => (z + FIELD.halfWidth) * sz;

    const id = setInterval(() => {
      const engine = window.__match?.engine;
      const st = useMatchStore.getState();
      if (!engine) return;
      const home = st.getHomeTeam();
      const away = st.getAwayTeam();
      // Fondo
      g.clearRect(0, 0, W, H);
      g.fillStyle = "rgba(10, 26, 16, 0.82)";
      g.fillRect(0, 0, W, H);
      g.strokeStyle = "rgba(220, 235, 220, 0.55)";
      g.lineWidth = 1;
      g.strokeRect(4.5, 4.5, W - 9, H - 9);
      g.beginPath();
      g.moveTo(W / 2, 4.5);
      g.lineTo(W / 2, H - 4.5);
      g.stroke();
      g.beginPath();
      g.arc(W / 2, H / 2, 9.15 * sx, 0, Math.PI * 2);
      g.stroke();
      // Jugadores
      for (const p of engine.players) {
        if (p.sentOff) continue;
        const team = p.side === "home" ? home : away;
        g.beginPath();
        g.arc(px(p.x), pz(p.z), p.controlled ? 3.4 : 2.4, 0, Math.PI * 2);
        g.fillStyle = team.colors.primary;
        g.fill();
        g.strokeStyle = p.controlled ? "#ffd21f" : "rgba(255,255,255,0.75)";
        g.lineWidth = p.controlled ? 2 : 1;
        g.stroke();
      }
      // Balón destacado
      const b = engine.ball;
      g.beginPath();
      g.arc(px(b.x), pz(b.z), 2.6, 0, Math.PI * 2);
      g.fillStyle = "#ffd21f";
      g.fill();
      g.strokeStyle = "#fff";
      g.lineWidth = 1;
      g.stroke();
    }, 100);
    return () => clearInterval(id);
  }, [radarOn]);

  if (!radarOn) return null;
  return (
    <div className="radar">
      <canvas ref={ref} width={W} height={H} />
      <div className="radar-hint">Radar · <b>R</b></div>
    </div>
  );
}

// FÚTBOL 3D — Fase E: presentación.
// Flujo: menú → selector de equipos → versus → alineaciones → partido
// (con pausa, estadísticas, cambios y repetición automática de goles).

import { useEffect } from "react";
import { useMatchStore } from "./stores/useMatchStore";
import { Match } from "./game/Match";
import { MainMenu, TeamSelect, VersusScreen, LineupsScreen, DrillsScreen } from "./ui/Screens";
import { TrainingOverlay } from "./training/Training";
import {
  HUD,
  GoalBanner,
  ReplayLabel,
  ReplayDownloadButton,
  StatsOverlay,
  PauseMenu,
  FullTimeScreen,
  NoticeToast,
} from "./ui/HUD";
import "./ui/screens.css";

const IN_MATCH = ["playing", "paused", "goal", "replay", "fulltime"];
const IN_HUD = ["playing", "paused", "goal", "replay"];

export default function App() {
  const phase = useMatchStore((s) => s.phase);
  const matchId = useMatchStore((s) => s.matchId);

  // Tab: overlay de estadísticas durante el partido o la pausa.
  // Z: cicla cámara TV → cercana → lejos. R: radar. H: halo del balón.
  useEffect(() => {
    const onKey = (e) => {
      const s = useMatchStore.getState();
      if (e.code === "Tab") {
        if (s.phase === "playing" || s.phase === "paused") {
          e.preventDefault();
          s.toggleStats();
        }
      } else if (e.code === "KeyZ") {
        if (s.phase === "playing" || s.phase === "paused" || s.phase === "goal") {
          s.toggleCamera();
        }
      } else if (e.code === "KeyR") {
        if (s.phase === "playing" || s.phase === "paused") {
          s.toggleRadar();
        }
      } else if (e.code === "KeyH") {
        if (s.phase === "playing" || s.phase === "paused") {
          s.toggleHalo();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      {phase === "menu" && <MainMenu />}
      {phase === "select" && <TeamSelect />}
      {phase === "versus" && <VersusScreen />}
      {phase === "lineups" && <LineupsScreen />}
      {phase === "drills" && <DrillsScreen />}

      {/* matchId: la "Revancha" remonta el partido con un motor limpio */}
      {IN_MATCH.includes(phase) && <Match key={matchId} />}
      {/* Capa para la etiqueta del jugador controlado (proyección manual) */}
      {IN_MATCH.includes(phase) && (
        <div id="label-layer" style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 15 }} />
      )}

      {IN_HUD.includes(phase) && <HUD />}
      {/* Fase 6: la tarjeta del drill sigue visible en gol/repetición para
        marcar el éxito durante la celebración. */}
      {(phase === "playing" || phase === "paused" || phase === "goal" || phase === "replay") && <TrainingOverlay />}
      {(phase === "playing" || phase === "paused") && <NoticeToast />}
      {(phase === "playing" || phase === "paused") && <StatsOverlay />}
      {phase === "goal" && <GoalBanner />}
      {phase === "replay" && <ReplayLabel />}
      {IN_MATCH.includes(phase) && <ReplayDownloadButton />}
      {phase === "paused" && <PauseMenu />}
      {phase === "fulltime" && <FullTimeScreen />}
    </div>
  );
}

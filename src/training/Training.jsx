// Modo entrenamiento (Fase 6): 7 ejercicios en la escena real con la IA
// congelada. TrainingScript (R3F, dentro del Canvas) ejecuta el guion del
// drill por frame; TrainingOverlay (DOM) aplica el setup, evalúa la
// condición de éxito y ofrece repetir / saltar / salir.

import { useEffect, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useMatchStore } from "../stores/useMatchStore";
import { DRILLS, getDrill } from "./drills";

export function TrainingScript({ engine }) {
  const drillId = useMatchStore((s) => s.drillId);
  useFrame((_, rawDt) => {
    if (!drillId) return;
    if (useMatchStore.getState().phase !== "playing") return;
    const d = getDrill(drillId);
    if (!d || !d.script) return;
    try {
      d.script(engine, Math.min(rawDt, 0.05));
    } catch { /* el guion nunca rompe el partido */ }
  });
  return null;
}

/** Anillo del objetivo del drill (p. ej. círculo de llegada). */
export function TrainingMarker() {
  const marker = useMatchStore((s) => s.drillMarker);
  const g = useRef();
  useFrame(({ clock }) => {
    if (!g.current) return;
    g.current.visible = !!marker;
    if (marker) {
      g.current.position.set(marker.x, 0.04, marker.z);
      const s = 1 + 0.06 * Math.sin(clock.elapsedTime * 3);
      g.current.scale.set(s, s, 1);
    }
  });
  return (
    <group ref={g} visible={false}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[2.6, 3.0, 40]} />
        <meshBasicMaterial color="#ffd21f" transparent opacity={0.9} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
    </group>
  );
}

function nextDrillId(id) {
  const i = DRILLS.findIndex((d) => d.id === id);
  return i >= 0 && i + 1 < DRILLS.length ? DRILLS[i + 1].id : null;
}

export function TrainingOverlay() {
  const drillId = useMatchStore((s) => s.drillId);
  const drillRunId = useMatchStore((s) => s.drillRunId);
  const [text, setText] = useState("");
  const [done, setDone] = useState(false);
  const aux = useRef({});
  const setupKey = useRef("");
  const doneRef = useRef(false);
  useEffect(() => {
    doneRef.current = done;
  }, [done]);

  // Setup al montar y al reanudar tras un gol del drill de tiro.
  useEffect(() => {
    if (!drillId) return undefined;
    const id = setInterval(() => {
      const engine = window.__match?.engine;
      const st = useMatchStore.getState();
      if (!engine || st.phase === "menu") return;
      const d = getDrill(st.drillId);
      if (!d) return;
      const goals = (st.events || []).filter((e) => e.type === "goal").length;
      const key = `${st.drillRunId}:${goals}`;
      if (key !== setupKey.current) {
        setupKey.current = key;
        try {
          d.setup(engine);
        } catch { /* nada */ }
        st.setDrillMarker(d.marker || null);
        aux.current = { startUid: engine.controlledUid, passes: 0, armed: true };
        if (!d.setupOnResume) setDone(false);
      }
      // Auxiliares para el check.
      const a = aux.current;
      if (engine.passTarget && engine.ball.lastTouch === engine.controlledUid) {
        if (!a.lastPass || a.lastPass.uid !== engine.passTarget || engine.time - a.lastPass.t > 3) {
          a.lastPass = { uid: engine.passTarget, t: engine.time };
          a.passes = (a.passes || 0) + 1;
        }
      }
      if (engine.controlledUid !== a.startUid) a.switched = true;
      const dbSt = engine.deadBall ? engine.deadBall.state : null;
      if (dbSt === "DEAD_BALL_READY") a.sawReady = true;
      if (a.sawReady && (dbSt === "OPEN_PLAY" || dbSt === "DEAD_BALL_EXECUTED")) a.executed = true;
      // Condición de éxito.
      let r = { done: false, text: "" };
      try {
        r = d.check(engine, a, st);
      } catch { /* nada */ }
      setText(r.text || "");
      if (r.done && !doneRef.current) {
        setDone(true);
        st.markDrillDone(st.drillId);
      }
    }, 200);
    return () => clearInterval(id);
  }, [drillId, drillRunId]);

  if (!drillId) return null;
  const d = getDrill(drillId);
  if (!d) return null;
  const st = useMatchStore.getState();
  const next = nextDrillId(drillId);

  return (
    <div className="drill-card">
      <div className="drill-title">{done ? `✅ ${d.title} ¡superado!` : `🎯 ${d.title}`}</div>
      <div className="drill-hint">{d.hint}</div>
      {!done && text && <div className="drill-progress">{text}</div>}
      <div className="drill-btns">
        <button className="btn btn-secondary" onClick={() => { setDone(false); st.retryDrill(); }}>
          Repetir
        </button>
        {next && (
          <button className="btn" onClick={() => { setDone(false); st.startDrill(next); }}>
            {done ? "Siguiente" : "Saltar"}
          </button>
        )}
        <button className="btn btn-secondary" onClick={() => st.quitDrill()}>
          Salir
        </button>
      </div>
    </div>
  );
}

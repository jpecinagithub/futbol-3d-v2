// Celebración y confeti de gol (Fase 11: extraído de Match.jsx).
// Durante la fase "goal" el motor está congelado: estos componentes animan a
// mano al goleador y lanzan el confeti sobre la portería.

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useMatchStore } from "../stores/useMatchStore";
import { clamp } from "../utils/math";

// ---------- Celebración de gol (Fase E + Fase 8) ----------
// Goleador con 3 variantes (brazos en alto, deslizamiento de rodillas, puño
// en alto) y compañeros que se acercan a felicitar (al llegar festejan).
export function GoalCelebration({ engine }) {
  const t = useRef(0);
  const init = useRef(false);

  useFrame((_, rawDt) => {
    if (useMatchStore.getState().phase !== "goal") return;
    const dt = Math.min(rawDt, 0.05); // el motor está congelado: animación manual
    if (!init.current) {
      init.current = true;
      t.current = 0;
      const scorer = engine.players.find((p) => p.uid === engine.lastScorerUid);
      if (scorer && !scorer.sentOff) {
        scorer.anim.action = "celebrate";
        scorer.anim.timer = 10; // no decae: el motor está congelado
        // Fase 8: variante por goleador (estable por uid).
        let h = 0;
        for (let i = 0; i < scorer.uid.length; i++) h = (h * 31 + scorer.uid.charCodeAt(i)) >>> 0;
        scorer.anim.celebr = h % 3;
        const sp = scorer.anim.celebr === 1 ? 4.6 : 3.6;
        scorer.vx = Math.cos(scorer.facing) * sp;
        scorer.vz = Math.sin(scorer.facing) * sp;
      }
    }
    t.current += dt;
    const scorer = engine.players.find((p) => p.uid === engine.lastScorerUid);
    if (scorer && !scorer.sentOff) {
      if (t.current < 1.5) {
        // Corre con los brazos en alto
        scorer.x = clamp(scorer.x + scorer.vx * dt, -55, 55);
        scorer.z = clamp(scorer.z + scorer.vz * dt, -36, 36);
      } else {
        scorer.vx = 0;
        scorer.vz = 0;
      }
      // Compañeros cercanos (no portero) se acercan a felicitar; al llegar,
      // festejan con él (Fase 8: reacción de compañeros).
      for (const p of engine.players) {
        if (p.side !== scorer.side || p === scorer || p.sentOff || p.role === "GK") continue;
        const dx = scorer.x - p.x, dz = scorer.z - p.z;
        const d = Math.hypot(dx, dz);
        if (d < 13 && d > 1.7) {
          const sp = Math.min(p.maxSpeed * 0.85, d * 3);
          p.x += (dx / d) * sp * dt;
          p.z += (dz / d) * sp * dt;
          p.vx = (dx / d) * sp;
          p.vz = (dz / d) * sp;
          p.facing = Math.atan2(dz, dx);
        } else if (d <= 1.7) {
          p.vx = 0;
          p.vz = 0;
          if (p.anim.action !== "celebrate") {
            p.anim.action = "celebrate";
            p.anim.timer = 10;
            p.anim.celebr = 0;
          }
        }
      }
    }
  });
  return null;
}

// ---------- Confeti de gol (Fase 8): lluvia de papel sobre la portería ----------
// Points procedurales (220 partículas, 2,5 s de vida) durante la celebración.
export function GoalConfetti({ engine }) {
  const ref = useRef();
  const data = useRef(null);
  const N = 220;

  useFrame((_, rawDt) => {
    if (!ref.current) return;
    const isGoal = useMatchStore.getState().phase === "goal";
    ref.current.visible = isGoal;
    if (!isGoal) {
      data.current = null;
      return;
    }
    if (!data.current) {
      // Emisor sobre la portería atacada (o el centro si no hay meta).
      const gx = engine.replayMeta ? engine.replayMeta.gx : 52.5;
      const pos = new Float32Array(N * 3);
      const vel = new Float32Array(N * 3);
      const col = new Float32Array(N * 3);
      const palette = [[1, 0.83, 0.13], [1, 1, 1], [0.2, 0.44, 0.96], [1, 0.36, 0.36]];
      for (let i = 0; i < N; i++) {
        pos[i * 3] = gx + (Math.random() - 0.5) * 14;
        pos[i * 3 + 1] = 14 + Math.random() * 8;
        pos[i * 3 + 2] = (Math.random() - 0.5) * 24;
        vel[i * 3] = (Math.random() - 0.5) * 2;
        vel[i * 3 + 1] = -1 - Math.random() * 2;
        vel[i * 3 + 2] = (Math.random() - 0.5) * 2;
        const c = palette[i % palette.length];
        col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2];
      }
      const g = ref.current.geometry;
      g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      g.setAttribute("color", new THREE.BufferAttribute(col, 3));
      data.current = { vel, t: 0 };
    }
    const dt = Math.min(rawDt, 0.05);
    const d = data.current;
    d.t += dt;
    const posA = ref.current.geometry.getAttribute("position");
    const arr = posA.array;
    for (let i = 0; i < N; i++) {
      arr[i * 3] += d.vel[i * 3] * dt;
      arr[i * 3 + 1] = Math.max(0.1, arr[i * 3 + 1] + d.vel[i * 3 + 1] * dt);
      arr[i * 3 + 2] += d.vel[i * 3 + 2] * dt;
    }
    posA.needsUpdate = true;
  });

  return (
    <points ref={ref} visible={false}>
      <bufferGeometry />
      <pointsMaterial size={0.35} vertexColors transparent opacity={0.95} depthWrite={false} />
    </points>
  );
}

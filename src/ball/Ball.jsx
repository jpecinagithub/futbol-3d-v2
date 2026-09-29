// Balón de fútbol procedural (diseño propio: esfera blanca con parches oscuros).
// La malla se coloca cada fotograma desde el motor (sin React state).

import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { BALL } from "../game/constants";
import { useMatchStore } from "../stores/useMatchStore";
import { playBounce, playWoodwork } from "../audio/audioEngine";

/** Textura procedural de balón: base blanca con manchas pentagonales oscuras. */
function makeBallTexture() {
  const c = document.createElement("canvas");
  c.width = 256; c.height = 128;
  const g = c.getContext("2d");
  g.fillStyle = "#f4f4f2";
  g.fillRect(0, 0, 256, 128);
  g.fillStyle = "#1c1c22";
  // Parches distribuidos de forma regular (no es un balón oficial, es genérico)
  const spots = [
    [32, 32], [96, 20], [160, 34], [224, 26],
    [64, 74], [128, 66], [192, 78], [240, 96],
    [16, 104], [104, 108], [168, 110], [224, 60], [0, 60], [256, 110],
  ];
  for (const [x, y] of spots) {
    g.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
      const px = x + Math.cos(a) * 13, py = y + Math.sin(a) * 13;
      if (i === 0) g.moveTo(px, py);
      else g.lineTo(px, py);
    }
    g.closePath();
    g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

let cachedTex = null;

/** Textura compartida del balón (un solo balón en escena: se cachea). */
function getBallTexture() {
  if (!cachedTex) cachedTex = makeBallTexture();
  return cachedTex;
}

export function Ball({ engine }) {
  const ref = useRef();
  const shadow = useRef();
  const elev = useRef();
  const halo = useRef();
  const ballHalo = useMatchStore((s) => s.ballHalo);
  // Fase 10: tamaño visual configurable (la física NO cambia: mismo radio).
  const ballScale = useMatchStore((s) => s.ballScale);
  const tex = useMemo(() => getBallTexture(), []);

  useFrame(({ clock }) => {
    const b = engine.ball;
    if (!ref.current) return;
    ref.current.position.set(b.x, b.y, b.z);
    ref.current.scale.setScalar(ballScale);
    // Fase 1: sombra blob en el suelo (siempre visible, se atenúa en alto).
    if (shadow.current) {
      const h = Math.max(0, b.y - BALL.radius);
      const s = (1 + h * 0.12) * ballScale;
      shadow.current.position.set(b.x, 0.02, b.z);
      shadow.current.scale.set(s, s, 1);
      shadow.current.material.opacity = Math.max(0.12, 0.42 - h * 0.05);
    }
    // Fase 1: indicador de balón elevado (línea + anillo pulsante en el suelo).
    if (elev.current) {
      const high = b.y > 1.4;
      elev.current.visible = high;
      if (high) {
        const t = clock.elapsedTime;
        elev.current.position.set(b.x, 0, b.z);
        const line = elev.current.children[0];
        line.scale.y = Math.max(0.1, b.y);
        line.position.y = b.y / 2;
        const ring = elev.current.children[1];
        const pulse = 1 + 0.18 * Math.sin(t * 6);
        ring.scale.set(pulse, pulse, 1);
      }
    }
    // Fase 1: halo opcional alrededor del balón (H para activar).
    if (halo.current) {
      halo.current.visible = !!ballHalo;
      if (ballHalo) halo.current.position.set(b.x, b.y, b.z);
    }
    // Fase E: sonido de bote (la física marca b.bounced al impactar)
    if (b.bounced > 0) {
      try {
        playBounce(Math.min(6, b.bounced));
      } catch { /* sin audio */ }
      b.bounced = 0;
    }
    // Fase 7: madera (la física marca b.woodwork al dar en poste/travesaño)
    if (b.woodwork > 0) {
      try {
        playWoodwork(Math.min(1, b.woodwork / 15));
      } catch { /* sin audio */ }
      b.woodwork = 0;
    }
    // Rodadura visual: gira según la velocidad horizontal
    const sp = Math.hypot(b.vx, b.vz);
    if (sp > 0.05) {
      const axis = new THREE.Vector3(b.vz, 0, -b.vx).normalize();
      ref.current.rotateOnWorldAxis(axis, (sp / BALL.radius) * 0.016);
    }
  });

  return (
    <>
      <mesh ref={ref} castShadow>
        <sphereGeometry args={[BALL.radius, 20, 14]} />
        <meshStandardMaterial map={tex} roughness={0.55} />
      </mesh>
      {/* Sombra blob: disco oscuro pegado al césped bajo el balón */}
      <mesh ref={shadow} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.32, 24]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.42} depthWrite={false} />
      </mesh>
      {/* Indicador de balón elevado: línea vertical + anillo en el suelo */}
      <group ref={elev} visible={false}>
        <mesh>
          <cylinderGeometry args={[0.03, 0.03, 1, 6]} />
          <meshBasicMaterial color="#ffd21f" transparent opacity={0.55} depthWrite={false} />
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]}>
          <ringGeometry args={[0.45, 0.6, 28]} />
          <meshBasicMaterial color="#ffd21f" transparent opacity={0.85} side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
      </group>
      {/* Halo opcional (H): anillo brillante que envuelve el balón */}
      <mesh ref={halo} visible={false}>
        <sphereGeometry args={[BALL.radius * 1.9, 16, 12]} />
        <meshBasicMaterial color="#ffd21f" transparent opacity={0.22} depthWrite={false} />
      </mesh>
    </>
  );
}

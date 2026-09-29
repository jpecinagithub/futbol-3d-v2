// Estadio original "Estadio Aurora": 4 gradas escalonadas, ~12.000 espectadores
// simplificados con INSTANCING (dos InstancedMesh: cuerpos + cabezas), 4 torres
// de focos (solo emissive, sin spotlights reales por rendimiento) y paneles
// electrónicos con marcas ficticias. Objetivo: 60 FPS en PC medio.
//
// Iluminación real: 1 hemisphere + 1 directional con sombras (mapa 2048,
// frustum ajustado al campo). La grada y el público NO proyectan sombras.

import { useMemo, useLayoutEffect, useRef } from "react";
import * as THREE from "three";
import { FIELD } from "../game/constants";

export function StadiumLights() {
  return (
    <group>
      <hemisphereLight args={["#bcd7ff", "#3a5f3a", 0.75]} />
      <directionalLight
        position={[40, 60, 25]}
        intensity={1.6}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-75}
        shadow-camera-right={75}
        shadow-camera-top={60}
        shadow-camera-bottom={-60}
        shadow-camera-far={180}
        shadow-bias={-0.0004}
      />
    </group>
  );
}

const CROWD_COLORS = [
  "#c0392b", "#2980b9", "#27ae60", "#f39c12", "#8e44ad",
  "#ecf0f1", "#2c3e50", "#d35400", "#16a085", "#e91e63",
];
const SKIN = ["#f1c9a5", "#e8b88a", "#d29a63", "#a06a3c", "#6e4423"];

// Una grada: filas escalonadas (3 niveles x 7 filas), cubierta y panel electrónico.
// `rotationY` orienta el local +Z hacia fuera del campo.
function Stand({ length, position, rotationY }) {
  const rows = [];
  for (let tier = 0; tier < 3; tier++) {
    for (let row = 0; row < 7; row++) {
      const topY = 2.5 + tier * 4.2 + row * 0.55;
      const zc = tier * 7.6 + 1.2 + row * 0.95;
      rows.push(
        <mesh key={`${tier}-${row}`} position={[0, topY - 0.6, zc]}>
          <boxGeometry args={[length, 1.2, 1.15]} />
          <meshStandardMaterial color={(tier + row) % 2 ? "#2b3350" : "#323c5e"} roughness={0.95} />
        </mesh>
      );
    }
  }
  const topY = 2.5 + 2 * 4.2 + 6 * 0.55; // 14.2
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      {rows}
      {/* Cubierta */}
      <mesh position={[0, topY + 4.4, 20]} castShadow>
        <boxGeometry args={[length + 4, 0.5, 30]} />
        <meshStandardMaterial color="#1a2033" roughness={0.9} />
      </mesh>
      {/* Panel electrónico al frente del nivel superior */}
      <PanelStrip length={length} y={topY + 1.4} z={2 * 7.6 - 0.4} />
    </group>
  );
}

function panelTexture() {
  const c = document.createElement("canvas");
  c.width = 1024; c.height = 64;
  const g = c.getContext("2d");
  g.fillStyle = "#0a0f1e";
  g.fillRect(0, 0, 1024, 64);
  g.fillStyle = "#ffd21f";
  g.font = "900 40px Arial";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText("ESTADIO AURORA  •  NOVA Cola  •  DeporteX", 512, 34);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function PanelStrip({ length, y, z }) {
  const tex = useMemo(() => panelTexture(), []);
  return (
    <mesh position={[0, y, z]}>
      <boxGeometry args={[length * 0.92, 1.4, 0.3]} />
      <meshStandardMaterial
        color="#0a0f1e"
        emissive="#ffffff"
        emissiveMap={tex}
        emissiveIntensity={1.4}
        map={tex}
      />
    </mesh>
  );
}

// Torres de focos: mástil + cabezal emissive (sin luces reales).
function Floodlight({ x, z }) {
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 14, 0]} castShadow>
        <cylinderGeometry args={[0.5, 0.8, 28, 8]} />
        <meshStandardMaterial color="#3a4152" roughness={0.8} />
      </mesh>
      <group position={[0, 29, 0]} rotation={[0.45, Math.atan2(-x, -z), 0]}>
        <mesh>
          <boxGeometry args={[6, 3, 1]} />
          <meshStandardMaterial color="#222222" emissive="#fffbe8" emissiveIntensity={2.2} />
        </mesh>
      </group>
    </group>
  );
}

// Público: dos InstancedMesh (cuerpos y cabezas) con la misma matriz por persona.
function Crowd() {
  const bodies = useRef();
  const heads = useRef();

  const data = useMemo(() => {
    const arr = [];
    for (let side = 0; side < 4; side++) {
      for (let tier = 0; tier < 3; tier++) {
        for (let row = 0; row < 7; row++) {
          const y = 2.5 + tier * 4.2 + row * 0.55;
          const off = tier * 7.6 + 1.2 + row * 0.95;
          const n = side < 2 ? 150 : 96;
          const span = side < 2 ? 116 : 74;
          for (let i = 0; i < n; i++) {
            // Jitter determinista (estable entre montajes; sin Math.random en render).
            const jitter = (((i * 37 + row * 11 + tier * 7 + side * 13) % 100) / 100 - 0.5) * 0.2;
            const along = -span / 2 + (span * i) / (n - 1) + jitter;
            let x, z, rotY;
            if (side === 0) { x = along; z = FIELD.halfWidth + 8 + off; rotY = Math.PI; }
            else if (side === 1) { x = along; z = -(FIELD.halfWidth + 8 + off); rotY = 0; }
            else if (side === 2) { x = FIELD.halfLength + 10 + off; z = along; rotY = -Math.PI / 2; }
            else { x = -(FIELD.halfLength + 10 + off); z = along; rotY = Math.PI / 2; }
            arr.push({ x, y, z, rotY });
          }
        }
      }
    }
    return arr;
  }, []);

  const bodyGeo = useMemo(() => {
    const g = new THREE.BoxGeometry(0.45, 0.75, 0.3);
    g.translate(0, 0.375, 0); // origen en los pies
    return g;
  }, []);
  const headGeo = useMemo(() => {
    const g = new THREE.SphereGeometry(0.14, 8, 6);
    g.translate(0, 0.92, 0); // sobre los hombros
    return g;
  }, []);

  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const v = new THREE.Vector3();
    const sc = new THREE.Vector3();
    const c = new THREE.Color();
    data.forEach((p, i) => {
      const s = 0.85 + Math.random() * 0.3;
      e.set(0, p.rotY, 0);
      q.setFromEuler(e);
      v.set(p.x, p.y, p.z);
      sc.set(s, s, s);
      m.compose(v, q, sc);
      bodies.current.setMatrixAt(i, m);
      heads.current.setMatrixAt(i, m);
      c.set(CROWD_COLORS[(Math.random() * CROWD_COLORS.length) | 0]);
      bodies.current.setColorAt(i, c);
      c.set(SKIN[(Math.random() * SKIN.length) | 0]);
      heads.current.setColorAt(i, c);
    });
    bodies.current.instanceMatrix.needsUpdate = true;
    heads.current.instanceMatrix.needsUpdate = true;
    bodies.current.instanceColor.needsUpdate = true;
    heads.current.instanceColor.needsUpdate = true;
  }, [data]);

  return (
    <group>
      <instancedMesh ref={bodies} args={[undefined, undefined, data.length]} frustumCulled={false}>
        <primitive object={bodyGeo} attach="geometry" />
        <meshStandardMaterial roughness={0.95} />
      </instancedMesh>
      <instancedMesh ref={heads} args={[undefined, undefined, data.length]} frustumCulled={false}>
        <primitive object={headGeo} attach="geometry" />
        <meshStandardMaterial roughness={0.9} />
      </instancedMesh>
    </group>
  );
}

export function Stadium() {
  return (
    <group>
      <StadiumLights />
      {/* local +Z debe apuntar hacia fuera del campo */}
      <Stand length={132} position={[0, 0, FIELD.halfWidth + 8]} rotationY={0} />
      <Stand length={132} position={[0, 0, -(FIELD.halfWidth + 8)]} rotationY={Math.PI} />
      <Stand length={92} position={[FIELD.halfLength + 10, 0, 0]} rotationY={Math.PI / 2} />
      <Stand length={92} position={[-(FIELD.halfLength + 10), 0, 0]} rotationY={-Math.PI / 2} />
      {/* Suelo bajo las gradas */}
      <mesh position={[0, -0.12, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[230, 190]} />
        <meshStandardMaterial color="#141a2b" roughness={1} />
      </mesh>
      <Crowd />
      <Floodlight x={74} z={54} />
      <Floodlight x={-74} z={54} />
      <Floodlight x={74} z={-54} />
      <Floodlight x={-74} z={-54} />
    </group>
  );
}

// Humanoide procedural y genérico (sin caras reales ni assets externos).
// Una sola geometría base reutilizada (cajas/esferas de módulo); las variaciones
// (altura, complexión, piel, pelo, dorsal) se hacen por escala y materiales.
// El dorsal se genera por canvas y se cachea por (equipo, número).

import { useRef, useMemo, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { createAnimState, posePlayer } from "../animation/animator";

// --- Geometrías base compartidas (una sola instancia para los 22 jugadores) ---
const GEO = {
  box: new THREE.BoxGeometry(1, 1, 1),
  sphere: new THREE.SphereGeometry(1, 12, 10),
  plane: new THREE.PlaneGeometry(1, 1),
};

// --- Caché de materiales por color (evita cientos de materiales) ---
const matCache = new Map();
function mat(color, roughness = 0.8) {
  const key = `${color}|${roughness}`;
  if (!matCache.has(key)) {
    matCache.set(key, new THREE.MeshStandardMaterial({ color, roughness }));
  }
  return matCache.get(key);
}

// --- Dorsales cacheados por (equipo, número) ---
const numberCache = new Map();
function numberTexture(teamId, number, shirtColor) {
  const key = `${teamId}-${number}`;
  if (numberCache.has(key)) return numberCache.get(key);
  const c = document.createElement("canvas");
  c.width = 128; c.height = 160;
  const g = c.getContext("2d");
  g.clearRect(0, 0, 128, 160);
  // Color del número según luminosidad de la camiseta
  const col = new THREE.Color(shirtColor);
  const lum = 0.299 * col.r + 0.587 * col.g + 0.114 * col.b;
  const ink = lum > 0.55 ? "#141414" : "#ffffff";
  g.font = "900 104px Arial";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.lineWidth = 8;
  g.strokeStyle = lum > 0.55 ? "#ffffff" : "#141414";
  const txt = String(number);
  g.strokeText(txt, 64, 84);
  g.fillStyle = ink;
  g.fillText(txt, 64, 84);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  numberCache.set(key, tex);
  return tex;
}

const SKIN = ["#f1c9a5", "#e8b88a", "#d29a63", "#a06a3c", "#6e4423"];
const HAIR_C = ["#141414", "#2e1d0e", "#5a3a1a", "#b5893b", "#7a2a12"];

function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

export function PlayerModel({ player, teamId }) {
  const root = useRef();
  const parts = useRef({});
  const anim = useMemo(() => createAnimState(), []);
  // Fase E: tras una sustitución la ficha (nombre/dorsal/rol) cambia sin
  // re-render; este tick fuerza uno solo para actualizar dorsal y colores.
  const [, setSubTick] = useState(0);
  const lastNum = useRef(player.data.number);

  const look = useMemo(() => {
    const h1 = hashStr(player.uid + "a"), h2 = hashStr(player.uid + "b");
    const h3 = hashStr(player.uid + "c"), h4 = hashStr(player.uid + "d");
    return {
      height: 0.94 + h1 * 0.14,          // 1.69 – 1.94 m aprox.
      build: 0.9 + h2 * 0.25,            // complexión (ancho torso)
      skin: SKIN[Math.floor(h3 * SKIN.length)],
      hairStyle: Math.floor(h3 * 7) % 3, // 0 corto, 1 largo, 2 calvo
      hairColor: HAIR_C[Math.floor(h4 * HAIR_C.length)],
    };
  }, [player.uid]);

  const isGK = player.role === "GK";
  const shirt = isGK ? "#20242c" : player.teamColors.primary;
  const shorts = isGK ? "#20242c" : player.teamColors.shorts;
  const socks = isGK ? "#c8c8c8" : player.teamColors.socks;
  const numTex = useMemo(
    () => numberTexture(teamId, player.data.number, shirt),
    [teamId, player.data.number, shirt]
  );

  useFrame((_, dt) => {
    const g = root.current;
    if (!g) return;
    // Fase D: los expulsados abandonan el campo (no se pintan ni se mueven).
    g.visible = !player.sentOff;
    if (player.sentOff) return;
    // Fase E: la sustitución cambia la ficha sin re-render de React.
    if (player.data.number !== lastNum.current) {
      lastNum.current = player.data.number;
      setSubTick((t) => t + 1);
    }
    g.position.set(player.x, 0, player.z);
    g.rotation.y = Math.PI / 2 - player.facing;
    posePlayer(parts.current, player, Math.min(dt, 0.05), anim);
  });

  const mShirt = mat(shirt), mShorts = mat(shorts), mSocks = mat(socks);
  const mSkin = mat(look.skin), mHair = mat(look.hairColor, 0.95);
  const mBoot = mat("#181818", 0.6);

  return (
    <group ref={root} scale={[1, look.height, 1]}>
      {/* Cadera / pantalón corto */}
      <group position={[0, 1.04, 0]}>
        <mesh geometry={GEO.box} material={mShorts} scale={[0.36, 0.24, 0.24]} castShadow />
      </group>

      {/* Torso (pivote bajo para inclinación) */}
      <group
        ref={(r) => (parts.current.torso = r)}
        position={[0, 1.16, 0]}
        userData={{ baseY: 1.16 }}
      >
        <mesh geometry={GEO.box} material={mShirt} scale={[0.42 * look.build, 0.52, 0.26]} position={[0, 0.26, 0]} castShadow />
        {/* Dorsal en la espalda (-Z = atrás, el modelo mira a +Z) */}
        <mesh geometry={GEO.plane} position={[0, 0.3, -0.135]} rotation={[0, Math.PI, 0]} scale={[0.3, 0.36, 1]}>
          <meshBasicMaterial map={numTex} transparent />
        </mesh>
        {/* Cabeza */}
        <group ref={(r) => (parts.current.head = r)} position={[0, 0.62, 0]}>
          <mesh geometry={GEO.sphere} material={mSkin} scale={[0.125, 0.14, 0.125]} position={[0, 0.1, 0]} castShadow />
          {look.hairStyle === 0 && (
            <mesh geometry={GEO.sphere} material={mHair} scale={[0.132, 0.1, 0.132]} position={[0, 0.16, -0.01]} />
          )}
          {look.hairStyle === 1 && (
            <>
              <mesh geometry={GEO.sphere} material={mHair} scale={[0.132, 0.1, 0.132]} position={[0, 0.16, -0.01]} />
              <mesh geometry={GEO.box} material={mHair} scale={[0.16, 0.22, 0.08]} position={[0, 0.02, -0.12]} />
            </>
          )}
        </group>
        {/* Brazos (pivote en el hombro) */}
        {[-1, 1].map((s) => (
          <group
            key={s}
            ref={(r) => (parts.current[s < 0 ? "armL" : "armR"] = r)}
            position={[s * 0.27 * look.build, 0.46, 0]}
          >
            <mesh geometry={GEO.box} material={mShirt} scale={[0.11, 0.32, 0.11]} position={[0, -0.16, 0]} castShadow />
            <mesh geometry={GEO.box} material={mSkin} scale={[0.095, 0.26, 0.095]} position={[0, -0.44, 0]} castShadow />
            <mesh geometry={GEO.sphere} material={mSkin} scale={[0.06, 0.07, 0.06]} position={[0, -0.6, 0]} />
          </group>
        ))}
      </group>

      {/* Piernas: muslo (pivote cadera) + espinilla (pivote rodilla) */}
      {[-1, 1].map((s) => (
        <group key={s} position={[s * 0.11, 0.96, 0]}>
          <group ref={(r) => (parts.current[s < 0 ? "thighL" : "thighR"] = r)}>
            <mesh geometry={GEO.box} material={mSkin} scale={[0.15, 0.44, 0.15]} position={[0, -0.22, 0]} castShadow />
            <group ref={(r) => (parts.current[s < 0 ? "shinL" : "shinR"] = r)} position={[0, -0.44, 0]}>
              <mesh geometry={GEO.box} material={mSocks} scale={[0.13, 0.42, 0.13]} position={[0, -0.21, 0]} castShadow />
              <mesh geometry={GEO.box} material={mBoot} scale={[0.13, 0.1, 0.27]} position={[0, -0.42, 0.05]} castShadow />
            </group>
          </group>
        </group>
      ))}
    </group>
  );
}

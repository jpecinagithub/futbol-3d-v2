// Cámara broadcast: lateral elevada (lado +Z), inclinada al campo.
// Estilo TV: el objetivo sigue al balón pero apenas se desplaza a las
// bandas, y la cámara lo acompaña solo un 32% en lateral (casi fija, panea).
// Así el campo llena siempre el encuadre y la cámara nunca acaba encima de
// la grada cercana dejando medio encuadre a oscuras.
// Target = balón*0.8 + centroDeAcción*0.2, con interpolación suave.
// Zoom dinámico: se aleja con el balón rápido o en contraataques, se acerca
// en las áreas y a balón parado en zona central. Sin brusquedades.

import { useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { actionCenter } from "../game/engine";
import { DB } from "../game/deadball";
import { useMatchStore } from "../stores/useMatchStore";
import { clamp, damp } from "../utils/math";

const CAM_OFFSETS = {
  normal: new THREE.Vector3(0, 31, 47),
  // Cámara cercana (tecla Z): más baja y pegada a la jugada, sigue al balón
  // de verdad. Se mantiene por dentro de la grada (z=±42): con el seguimiento
  // lateral al 55% la cámara no pasa de z=38,3.
  near: new THREE.Vector3(0, 15, 24),
  // Cámara lejana: plano táctico amplio para leer desmarques.
  far: new THREE.Vector3(0, 44, 66),
};
const LATERAL_FOLLOW = { normal: 0.32, near: 0.55, far: 0.22 };
const LATERAL_CLAMP = { normal: 17, near: 26, far: 22 };

export function BroadcastCamera({ engine }) {
  const { camera } = useThree();
  const mode = useMatchStore((s) => s.cameraMode);
  const reduceMotion = useMatchStore((s) => s.reduceMotion);
  const target = useRef(new THREE.Vector3(0, 0, 0));
  const zoom = useRef(1);
  // Offset actual (se interpola hacia el modo activo: transición suave
  // al ciclar Z entre TV/cercana/lejos, sin saltos).
  const offNow = useRef(CAM_OFFSETS.normal.clone());
  const lookNow = useRef(new THREE.Vector3(0, 0, 0));
  const initialized = useRef(false);

  useFrame((_, rawDt) => {
    // Fase E: durante la repetición la cámara la lleva el ReplayPlayer.
    if (useMatchStore.getState().phase === "replay") return;
    // Gancho de test: congela la cámara para capturas de verificación.
    if (typeof window !== "undefined" && window.__CAM_FREEZE) return;
    const dt = Math.min(rawDt, 0.05);
    const b = engine.ball;
    const ac = actionCenter(engine);

    // Punto de interés ponderado: el balón manda (80%) con un ancla al centro
    // de la acción (20%). En lateral no persigue al balón hasta la banda
    // (clamp): el balón queda cerca del borde del encuadre, como en la TV.
    // En cámara cercana el objetivo sí sigue al balón (clamp más amplio).
    const key = CAM_OFFSETS[mode] ? mode : "normal";
    const lx = b.x * 0.8 + ac.x * 0.2;
    const lz = b.z * 0.8 + ac.z * 0.2;
    // El target no sale del rectángulo central (la cámara no se pierde)
    const cx = clamp(lx, -45, 45);
    const cz = clamp(lz, -LATERAL_CLAMP[key], LATERAL_CLAMP[key]);

    // Zoom dinámico
    const ballSpeed = Math.hypot(b.vx, b.vz);
    let z = 1;
    z += clamp(ballSpeed / 30, 0, 0.28);          // balón rápido => abrir
    const nearBox = Math.abs(b.x) > 34;           // cerca de un área...
    if (nearBox && ballSpeed < 4) z -= 0.16;      // ...y juego pausado => acercar
    if (ballSpeed < 0.6 && Math.abs(b.z) < 14) z -= 0.1; // balón parado en zona central => acercar
    // (a balón parado en banda/córner no se acerca: el balón saldría del encuadre)
    // Balón parado en preparación/aiming (córner, falta, penalti): abrir el
    // plano para ver la jugada de estrategia, como en la TV.
    const db = engine.deadBall;
    if (db && (db.state === DB.SETUP || db.state === DB.READY)) z += 0.18;
    // Contraataque: balón en campo rival moviéndose rápido hacia la portería
    const attacking = (b.x > 12 && b.vx > 5) || (b.x < -12 && b.vx < -5);
    if (attacking) z += 0.08;
    // "Kick" de cámara en tiros a puerta (Fase B): zoom-in breve de 0.3 s.
    // Fase 10: desactivado con reducción de movimiento.
    if (engine.camKick > 0 && !reduceMotion) z *= 1 - 0.13 * (engine.camKick / 0.3);
    z = reduceMotion ? clamp(z, 0.9, 1.15) : clamp(z, 0.82, 1.32);

    // Suavizado (sin movimientos bruscos; más lento si se reduce movimiento)
    const kPos = 1 - Math.exp(-(reduceMotion ? 1.6 : 2.6) * dt);
    target.current.x = damp(target.current.x, cx, kPos);
    target.current.z = damp(target.current.z, cz, kPos);
    zoom.current = damp(zoom.current, z, 1 - Math.exp(-2.2 * dt));
    // Transición suave de modo de cámara (Z): el offset se interpola.
    const kOff = 1 - Math.exp(-3.2 * dt);
    offNow.current.x = damp(offNow.current.x, CAM_OFFSETS[key].x, kOff);
    offNow.current.y = damp(offNow.current.y, CAM_OFFSETS[key].y, kOff);
    offNow.current.z = damp(offNow.current.z, CAM_OFFSETS[key].z, kOff);

    const off = offNow.current.clone().multiplyScalar(zoom.current);
    // La cámara acompaña al objetivo en lateral: 32% en broadcast (casi
    // fija como una cámara de TV real; con el seguimiento total anterior,
    // en banda la cámara quedaba encima de la grada cercana y medio
    // encuadre era oscuridad), 55% en cercana (sigue la jugada sin
    // meterse en la grada) y 22% en lejana (plano táctico estable).
    const lateralFollow = LATERAL_FOLLOW[key];
    const desired = new THREE.Vector3(
      target.current.x + off.x,
      off.y,
      off.z + target.current.z * lateralFollow
    );
    if (!initialized.current) {
      camera.position.copy(desired);
      lookNow.current.set(target.current.x, 0, target.current.z);
      initialized.current = true;
    } else {
      camera.position.lerp(desired, kPos);
    }
    lookNow.current.x = damp(lookNow.current.x, target.current.x, kPos);
    lookNow.current.z = damp(lookNow.current.z, target.current.z, kPos);
    camera.lookAt(lookNow.current.x, 0.5, lookNow.current.z);
  });

  return null;
}

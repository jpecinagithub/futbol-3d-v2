// Cámara broadcast: lateral elevada (lado +Z), inclinada al campo.
// Estilo TV: el objetivo sigue al balón pero apenas se desplaza a las
// bandas, y la cámara lo acompaña solo un 32% en lateral (casi fija, panea).
// Así el campo llena siempre el encuadre y la cámara nunca acaba encima de
// la grada cercana dejando medio encuadre a oscuras.
// Target = balón*0.92 + centroDeAcción*0.08, con interpolación suave.
// Zoom dinámico: se aleja con el balón rápido o en contraataques, se acerca
// en las áreas y a balón parado en zona central. Una guarda en espacio de
// pantalla impide que el balón abandone el encuadre en desplazamientos rápidos.

import { useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { actionCenter } from "../game/engine";
import { DB } from "../game/deadball";
import { useMatchStore } from "../stores/useMatchStore";
import { clamp, lerp } from "../utils/math";

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
  const ballNdc = useRef(new THREE.Vector3());
  const initialized = useRef(false);

  useFrame((_, rawDt) => {
    // Fase E: durante la repetición la cámara la lleva el ReplayPlayer.
    if (useMatchStore.getState().phase === "replay") return;
    // Gancho de test: congela la cámara para capturas de verificación.
    if (typeof window !== "undefined" && window.__CAM_FREEZE) return;
    const dt = Math.min(rawDt, 0.05);
    const b = engine.ball;
    const ac = actionCenter(engine);

    // Punto de interés ponderado: el balón manda. El centro de acción solo
    // aporta contexto y nunca puede arrastrar el foco lejos de la jugada.
    const key = CAM_OFFSETS[mode] ? mode : "normal";
    const lx = b.x * 0.92 + ac.x * 0.08;
    const lz = b.z * 0.92 + ac.z * 0.08;
    // El foco puede llegar a las líneas y córners. Los clamps anteriores lo
    // retenían en el centro y eran una causa directa de balones fuera de plano.
    const cx = clamp(lx, -56, 56);
    const cz = clamp(lz, -36, 36);

    // Zoom dinámico
    const ballSpeed = Math.hypot(b.vx, b.vz);
    let z = 1;
    z += clamp(ballSpeed / 30, 0, 0.28);          // balón rápido => abrir
    z += clamp(Math.hypot(b.x - ac.x, b.z - ac.z) / 75, 0, 0.14); // conservar entorno
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
    const followRate = reduceMotion ? 4.5 : 6.5;
    const kPos = 1 - Math.exp(-followRate * dt);
    target.current.x = lerp(target.current.x, cx, kPos);
    target.current.z = lerp(target.current.z, cz, kPos);
    zoom.current = lerp(zoom.current, z, 1 - Math.exp(-3.5 * dt));
    // Transición suave de modo de cámara (Z): el offset se interpola.
    const kOff = 1 - Math.exp(-3.2 * dt);
    offNow.current.x = lerp(offNow.current.x, CAM_OFFSETS[key].x, kOff);
    offNow.current.y = lerp(offNow.current.y, CAM_OFFSETS[key].y, kOff);
    offNow.current.z = lerp(offNow.current.z, CAM_OFFSETS[key].z, kOff);

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
    lookNow.current.x = lerp(lookNow.current.x, target.current.x, kPos);
    lookNow.current.z = lerp(lookNow.current.z, target.current.z, kPos);
    const lookY = clamp(0.5 + Math.max(0, b.y - 1) * 0.12, 0.5, 2.2);
    camera.lookAt(lookNow.current.x, lookY, lookNow.current.z);

    // Garantía de visibilidad. Se comprueba el balón ya proyectado por la
    // cámara de este frame. Si alcanza el borde de seguridad (76% del plano),
    // se corrige la mirada antes de renderizar. Normalmente no interviene: el
    // seguimiento rápido de arriba absorbe el movimiento sin tirones.
    camera.updateMatrixWorld();
    ballNdc.current.set(b.x, b.y, b.z).project(camera);
    if (Math.abs(ballNdc.current.x) > 0.76 || Math.abs(ballNdc.current.y) > 0.76) {
      target.current.x = b.x;
      target.current.z = b.z;
      lookNow.current.x = b.x;
      lookNow.current.z = b.z;
      camera.lookAt(b.x, clamp(b.y, 0.5, 3), b.z);
      camera.updateMatrixWorld();
    }
  });

  return null;
}

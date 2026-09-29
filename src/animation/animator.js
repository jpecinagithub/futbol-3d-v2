// Animación procedural del humanoide (sin mocap ni assets externos).
// - Carrera: balanceo de brazos y piernas; amplitud y frecuencia proporcionales a la velocidad.
// - Idle: respiración leve (torso) y balanceo mínimo.
// - Acciones: "kick" (golpeo con variantes por potencia/estilo), "receive"
//   (control: brazos abiertos y amortiguación), "slide" (barrida),
//   "fall" (caída tras falta) y "celebrate" (3 variantes).
// - Transiciones suavizadas: el factor de carrera se interpola (sin saltos
//   walk->run) y las acciones se funden con envolvente.
// - Frenadas y giros: el torso se inclina con la aceleración y el balanceo.
//
// parts: { torso, head, armL, armR, thighL, thighR, shinL, shinR }
// state: objeto mutable { phase, runSm, prevSpd, prevFacing } entre fotogramas.

export function createAnimState() {
  return {
    phase: Math.random() * Math.PI * 2,
    runSm: 0,       // factor de carrera suavizado
    prevSpd: 0,     // velocidad anterior (aceleración)
    prevFacing: 0,  // orientación anterior (giros)
  };
}

function damp(a, b, k) {
  return a + (b - a) * k;
}

export function posePlayer(parts, p, dt, state) {
  const speed = Math.hypot(p.vx, p.vz);
  const run = Math.min(1, speed / 4);          // 0 = quieto, 1 = corriendo
  // Fase 8: transición suavizada (walk->jog->run sin saltos).
  const kSm = 1 - Math.exp(-8 * Math.max(dt, 0.001));
  state.runSm = damp(state.runSm ?? run, run, kSm);
  const rs = state.runSm;
  const freq = 4 + speed * 1.9;                // frecuencia proporcional a la velocidad
  state.phase += freq * dt;
  const ph = state.phase;

  // Fase 8: aceleración (frenada = negativa) y giro para inclinar el torso.
  const accel = dt > 0.0005 ? (speed - (state.prevSpd ?? speed)) / dt : 0;
  state.prevSpd = speed;
  let turn = 0;
  if (state.prevFacing !== undefined) {
    let d = p.facing - state.prevFacing;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    turn = dt > 0.0005 ? d / dt : 0;
  }
  state.prevFacing = p.facing;

  const swing = 0.12 + rs * 0.62;             // amplitud de zancada
  const armSwing = 0.08 + rs * 0.5;

  const sL = Math.sin(ph), sR = Math.sin(ph + Math.PI);

  // Piernas: muslo oscila, espinilla flexiona al pasar atrás
  if (parts.thighL) parts.thighL.rotation.x = sL * swing;
  if (parts.thighR) parts.thighR.rotation.x = sR * swing;
  if (parts.shinL) parts.shinL.rotation.x = Math.max(0, -sL) * swing * 1.4 + rs * 0.12;
  if (parts.shinR) parts.shinR.rotation.x = Math.max(0, -sR) * swing * 1.4 + rs * 0.12;

  // Brazos: opuestos a las piernas
  if (parts.armL) {
    parts.armL.rotation.x = sR * armSwing;
    parts.armL.rotation.z = 0.12 + rs * 0.08;
  }
  if (parts.armR) {
    parts.armR.rotation.x = sL * armSwing;
    parts.armR.rotation.z = -0.12 - rs * 0.08;
  }

  // Torso: inclinación por velocidad + aceleración (frenada hacia atrás) +
  // balanceo lateral en giros + "respiración" en idle
  const leanAcc = Math.max(-0.22, Math.min(0.25, accel * 0.03));
  const leanTurn = Math.max(-0.2, Math.min(0.2, -turn * 0.06));
  if (parts.torso) {
    parts.torso.rotation.x = rs * 0.14 + leanAcc + Math.sin(ph * 0.5) * 0.012;
    parts.torso.rotation.z = leanTurn;
    parts.torso.position.y = parts.torso.userData.baseY + Math.abs(Math.sin(ph)) * 0.028 * rs;
  }
  if (parts.head) {
    parts.head.rotation.x = -rs * 0.1;
  }

  // Envolvente de acción 0->1->0 para fundir golpeos y gestos.
  const actT = (total) => {
    if (!p.anim || !p.anim.timer || p.anim.timer <= 0) return 0;
    const k = 1 - p.anim.timer / total;
    return Math.sin(Math.max(0, Math.min(1, k)) * Math.PI);
  };

  // Acción de golpeo con variantes (Fase 8: potencia y estilo del tiro).
  if (p.anim.action === "kick" && p.anim.timer > 0) {
    const env = actT(0.32);
    const power = p.anim.power !== undefined ? p.anim.power : 0.5;
    const style = p.anim.style || "normal";
    // Vaselina/colocado: pierna más contenida, torso erguido o atrás.
    const lift = env * (style === "chip" ? 0.7 : 0.8 + power * 0.5);
    if (parts.thighR) parts.thighR.rotation.x = -lift;
    if (parts.shinR) parts.shinR.rotation.x = env * 0.5;
    if (parts.torso) {
      parts.torso.rotation.x += env * (style === "chip" ? -0.22 : -0.12 - power * 0.1);
    }
    if (parts.armL) parts.armL.rotation.z = 0.12 + env * 0.5;
  }

  // Recepción del balón (Fase 8): amortigua con el cuerpo, brazos abiertos.
  if (p.anim.action === "receive" && p.anim.timer > 0) {
    const env = actT(0.3);
    if (parts.torso) {
      parts.torso.rotation.x += env * 0.18;
      parts.torso.position.y = parts.torso.userData.baseY - env * 0.06;
    }
    if (parts.armL) { parts.armL.rotation.z = 0.12 + env * 0.9; parts.armL.rotation.x = -env * 0.4; }
    if (parts.armR) { parts.armR.rotation.z = -0.12 - env * 0.9; parts.armR.rotation.x = -env * 0.4; }
    if (parts.thighR) parts.thighR.rotation.x = -env * 0.35;
    if (parts.shinR) parts.shinR.rotation.x = env * 0.5;
  }

  // Barrida (Fase 8): cuerpo bajo, piernas al frente.
  if (p.anim.action === "slide" && p.anim.timer > 0) {
    const env = actT(0.4);
    if (parts.torso) {
      parts.torso.rotation.x = -0.35 * env + rs * 0.1;
      parts.torso.position.y = parts.torso.userData.baseY - env * 0.35;
    }
    if (parts.thighL) parts.thighL.rotation.x = -env * 1.1;
    if (parts.thighR) parts.thighR.rotation.x = -env * 1.1;
    if (parts.shinL) parts.shinL.rotation.x = env * 0.2;
    if (parts.shinR) parts.shinR.rotation.x = env * 0.2;
    if (parts.armL) parts.armL.rotation.z = 0.12 + env * 1.1;
    if (parts.armR) parts.armR.rotation.z = -0.12 - env * 1.1;
  }

  // Caída tras falta (Fase 8): desplome lateral estilizado.
  if (p.anim.action === "fall" && p.anim.timer > 0) {
    const total = 0.9;
    const k = 1 - p.anim.timer / total;
    const env = Math.sin(Math.max(0, Math.min(1, k)) * Math.PI);
    if (parts.torso) {
      parts.torso.rotation.x = -0.9 * env;
      parts.torso.rotation.z = 0.5 * env;
      parts.torso.position.y = parts.torso.userData.baseY - env * 0.55;
    }
    if (parts.armL) parts.armL.rotation.z = 0.12 + env * 1.6;
    if (parts.armR) parts.armR.rotation.z = -0.12 - env * 1.6;
    if (parts.head) parts.head.rotation.x = -env * 0.4;
  }

  // Celebraciones de gol (Fase 8): 3 variantes por goleador.
  if (p.anim.action === "celebrate" && p.anim.timer > 0) {
    const v = p.anim.celebr || 0;
    if (v === 1) {
      // Deslizamiento de rodillas: cuerpo bajo, brazos en alto quietos.
      if (parts.torso) {
        parts.torso.rotation.x = -0.3;
        parts.torso.position.y = parts.torso.userData.baseY - 0.3;
      }
      if (parts.thighL) parts.thighL.rotation.x = -1.0;
      if (parts.thighR) parts.thighR.rotation.x = -1.0;
      if (parts.armL) { parts.armL.rotation.z = 2.75; parts.armL.rotation.x = 0; }
      if (parts.armR) { parts.armR.rotation.z = -2.75; parts.armR.rotation.x = 0; }
      if (parts.head) parts.head.rotation.x = -0.18;
    } else if (v === 2) {
      // Puño en alto corriendo: pierna sigue el ciclo, brazo derecho bombea.
      if (parts.armR) {
        parts.armR.rotation.z = -0.4;
        parts.armR.rotation.x = -2.4 + Math.abs(Math.sin(ph * 2)) * 0.5;
      }
      if (parts.armL) { parts.armL.rotation.x = sR * armSwing; parts.armL.rotation.z = 0.12 + rs * 0.08; }
      if (parts.torso) parts.torso.rotation.x = -0.05;
      if (parts.head) parts.head.rotation.x = -0.12;
    } else {
      // Brazos en alto clásica con leve bote del torso.
      if (parts.armL) {
        parts.armL.rotation.z = 2.75;
        parts.armL.rotation.x = Math.sin(ph * 2) * 0.12;
      }
      if (parts.armR) {
        parts.armR.rotation.z = -2.75;
        parts.armR.rotation.x = Math.sin(ph * 2 + Math.PI) * 0.12;
      }
      if (parts.torso) {
        parts.torso.rotation.x = -0.08;
        parts.torso.position.y = parts.torso.userData.baseY + Math.abs(Math.sin(ph * 2)) * 0.05;
      }
      if (parts.head) parts.head.rotation.x = -0.18; // mira al cielo
    }
  }
}

// Física propia del balón — integración manual, determinista y sin dependencias.
// El balón es una esfera con: gravedad, rebote (restitución), fricción de
// rodadura, resistencia aerodinámica y spin básico (efecto Magnus simplificado).
// Se integra con paso fijo desde el motor (engine.js) para que las repeticiones
// (módulo replay, fase futura) sean bit a bit reproducibles.
//
// ¿Por qué física propia en vez de rapier?
//  1. Determinismo: paso fijo + aritmética simple => replays y netcode futuro.
//  2. Control de "game feel": un balón de fútbol arcade necesita rebotes,
//     amortiguaciones y curvas ajustadas a mano, no un solver genérico.
//  3. Rendimiento: 1 esfera + 22 cápsulas 2D cuesta microsegundos; un motor
//     de cuerpo rígido completo es overkill y añade ~1 MB al bundle.
//  4. Sin dependencias pesadas: menos superficie de bugs y de mantenimiento.

import { BALL, GOAL, FIELD } from "../game/constants";

/** Crea el estado inicial del balón en el punto de saque. */
export function createBall() {
  return {
    x: 0, y: BALL.radius, z: 0,
    vx: 0, vy: 0, vz: 0,
    spin: 0,          // giro vertical (efecto / curva), rad/s aprox.
    lastTouch: null,  // id del último jugador que lo tocó
    touchCooldown: 0,
    bounced: 0,       // Fase E: velocidad de impacto del último bote (sonido)
  };
}

export function resetBall(b) {
  b.x = 0; b.y = BALL.radius; b.z = 0;
  b.vx = 0; b.vy = 0; b.vz = 0;
  b.spin = 0; b.lastTouch = null; b.touchCooldown = 0;
}

/**
 * Aplica un impulso al balón (pase, tiro, toque de conducción).
 * @param {object} b estado del balón
 * @param {number} dx, dz dirección horizontal normalizada
 * @param {number} power velocidad horizontal resultante (m/s)
 * @param {number} up velocidad vertical (m/s), 0 = raso
 * @param {number} spin efecto lateral
 * @param {string|null} by id del jugador que golpea
 */
export function kickBall(b, dx, dz, power, up = 0, spin = 0, by = null) {
  b.vx = dx * power;
  b.vz = dz * power;
  b.vy = up;
  b.spin = spin;
  b.lastTouch = by;
  b.touchCooldown = 0.25;
}

/** Distancia de un punto al segmento AB (3D). Devuelve {d2, cx, cy, cz}. */
function segDist2(px, py, pz, ax, ay, az, bx, by, bz) {
  const abx = bx - ax, aby = by - ay, abz = bz - az;
  const t = Math.max(0, Math.min(1, ((px - ax) * abx + (py - ay) * aby + (pz - az) * abz) /
    (abx * abx + aby * aby + abz * abz || 1)));
  const cx = ax + abx * t, cy = ay + aby * t, cz = az + abz * t;
  const dx = px - cx, dy = py - cy, dz = pz - cz;
  return { d2: dx * dx + dy * dy + dz * dz, cx, cy, cz };
}

function collideGoalFrame(b, gx) {
  const r = BALL.radius + GOAL.postRadius;
  const hw = GOAL.halfWidth;
  // Postes: cilindros verticales en (gx, ±hw), de y=0 a y=2.44.
  for (const sz of [-1, 1]) {
    const pz = sz * hw;
    const dx = b.x - gx, dz = b.z - pz;
    const d2 = dx * dx + dz * dz;
    if (d2 < r * r && b.y < GOAL.height + BALL.radius) {
      const d = Math.sqrt(d2) || 1e-6;
      const nx = dx / d, nz = dz / d;
      b.x = gx + nx * r; b.z = pz + nz * r;
      const vn = b.vx * nx + b.vz * nz;
      if (vn < 0) {
        // Fase 7: marca el impacto para el sonido de madera (lo lee Ball.jsx).
        if (-vn > 2) b.woodwork = Math.max(b.woodwork || 0, -vn);
        b.vx -= 1.7 * vn * nx;
        b.vz -= 1.7 * vn * nz;
      }
    }
  }
  // Travesaño: segmento horizontal entre postes a y=2.44.
  const s = segDist2(b.x, b.y, b.z, gx, GOAL.height, -hw, gx, GOAL.height, hw);
  if (s.d2 < r * r) {
    const d = Math.sqrt(s.d2) || 1e-6;
    const nx = (b.x - s.cx) / d, ny = (b.y - s.cy) / d, nz = (b.z - s.cz) / d;
    b.x = s.cx + nx * r; b.y = s.cy + ny * r; b.z = s.cz + nz * r;
    const vn = b.vx * nx + b.vy * ny + b.vz * nz;
    if (vn < 0) {
      if (-vn > 2) b.woodwork = Math.max(b.woodwork || 0, -vn);
      b.vx -= 1.7 * vn * nx;
      b.vy -= 1.7 * vn * ny;
      b.vz -= 1.7 * vn * nz;
    }
  }
}

function collideNet(b, gx) {
  // La red frena el balón en seco (amortiguación fuerte, sin rebote).
  const dir = Math.sign(gx); // +1 portería este, -1 oeste
  const backX = gx + dir * (GOAL.depth - 0.15);
  const hw = GOAL.halfWidth + 0.15;
  const insideX = dir > 0 ? (b.x > gx && b.x < backX + 0.5) : (b.x < gx && b.x > backX - 0.5);
  if (!insideX || b.y > GOAL.height + 0.4 || Math.abs(b.z) > hw + 0.4) return;
  // Fondo de la red
  if ((dir > 0 && b.x + BALL.radius > backX) || (dir < 0 && b.x - BALL.radius < backX)) {
    b.x = backX - dir * BALL.radius;
    b.vx *= -0.08;
  }
  // Laterales de la red
  if (Math.abs(b.z) + BALL.radius > hw) {
    b.z = Math.sign(b.z) * (hw - BALL.radius);
    b.vz *= -0.08;
  }
  // Techo de la red
  if (b.y + BALL.radius > GOAL.height + 0.3) {
    b.y = GOAL.height + 0.3 - BALL.radius;
    if (b.vy > 0) b.vy *= -0.08;
  }
  // Amortiguación general dentro de la red
  b.vx *= 1 - 6 * (1 / 60);
  b.vz *= 1 - 6 * (1 / 60);
}

/** Un subpaso de física del balón con dt pequeño. */
export function stepBall(b, dt) {
  if (b.touchCooldown > 0) b.touchCooldown -= dt;

  const airborne = b.y > BALL.radius + 0.02;

  if (airborne || b.vy > 0.01) {
    // Gravedad
    b.vy -= BALL.gravity * dt;
    // Resistencia aerodinámica (lineal, barata y estable)
    const drag = 1 - BALL.airDrag * dt;
    b.vx *= drag; b.vy *= drag; b.vz *= drag;
    // Magnus simplificado: el spin vertical curva la trayectoria
    b.vx += -b.spin * b.vz * BALL.magnus * dt;
    b.vz += b.spin * b.vx * BALL.magnus * dt;
    b.spin *= 1 - 0.6 * dt;
  } else {
    // Rodando: fricción de rodadura
    const sp = Math.hypot(b.vx, b.vz);
    if (sp > 0) {
      const ns = Math.max(0, sp - BALL.rollFriction * dt);
      const k = ns / sp;
      b.vx *= k; b.vz *= k;
      if (ns < BALL.stopSpeed) { b.vx = 0; b.vz = 0; }
    }
    b.vy = 0;
    b.spin *= 1 - 2 * dt;
  }

  // Integración
  b.x += b.vx * dt;
  b.y += b.vy * dt;
  b.z += b.vz * dt;

  // Suelo
  if (b.y < BALL.radius) {
    b.y = BALL.radius;
    if (b.vy < -0.9) {
      // Fase E: marca el impacto para el sonido de bote (lo lee Ball.jsx).
      b.bounced = -b.vy;
      b.vy = -b.vy * BALL.restitution;
    } else {
      b.vy = 0;
    }
    // Al botar se pierde parte del spin
    b.spin *= 0.7;
  }

  // Porterías: postes, travesaño y redes
  collideGoalFrame(b, -FIELD.halfLength);
  collideGoalFrame(b, FIELD.halfLength);
  collideNet(b, -FIELD.halfLength);
  collideNet(b, FIELD.halfLength);

  // Fase D: sin muros invisibles. El balón puede salir del campo; la salida
  // la detecta checkOutOfBounds (src/game/deadball.js) en el paso del motor.
}

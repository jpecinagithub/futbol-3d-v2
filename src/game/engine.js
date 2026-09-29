// Motor del partido — simulación mutable con paso fijo (NO usa React state).
// React solo pinta: los componentes leen este objeto en useFrame y colocan
// los meshes directamente. Así se mantiene 60 FPS sin re-renders.
//
// Modelo:
//  - Jugadores = cápsulas lógicas 2D (posición x,z + radio).
//  - Balón = esfera integrada en src/physics/ballPhysics.js.
//  - Todo el paso es determinista (semilla fija) para futuros replays.

import { FIELD, PLAYER, BALL, BALL_SUBSTEPS, MATCH_TIME_SCALE } from "./constants";
import { assignSpots } from "./formations";
import { stepBall, createBall, resetBall } from "../physics/ballPhysics";
import { aiTick, resetAIState } from "../ai/tick";
import { mulberry32, clamp } from "../utils/math";
// Fase B: módulos de juego (controles, pases, regates, entradas)
import { ballPlayerContact } from "./ballContact";
import { staminaSpeedFactor, updateStamina } from "./stamina";
// Fase D: balón parado y arbitraje
import {
  DB, initDeadBall, resetDeadBall, stepDeadBall, checkOutOfBounds, whistleOffside,
} from "./deadball";
import { checkOffsideInterference } from "./offside";
// Fase E: buffer circular de estados para la repetición automática de goles
import { createReplayBuffer } from "../replay/goalReplay";

const statSpeed = (s) => 5.2 + (s / 99) * 2.6; // 5.2 – 7.8 m/s

function makePlayer(data, idx, teamData, isHome, side, rng) {
  return {
    uid: `${side}-${idx}`,
    side, // 'home' | 'away'
    isHome,
    data,                       // ficha del jugador (nombre, dorsal, stats)
    role: data.position,
    x: 0, z: 0, vx: 0, vz: 0,
    facing: isHome ? 0 : Math.PI, // mira hacia el campo rival
    homeSpot: { x: 0, z: 0 },
    moveTarget: null,
    desiredSpeed: PLAYER.walkSpeed,
    controlled: false,
    aiActive: false,
    maxSpeed: statSpeed(data.speed),
    radius: PLAYER.radius,
    wander: {
      f1: 0.25 + rng() * 0.3, f2: 0.2 + rng() * 0.3,
      p1: rng() * Math.PI * 2, p2: rng() * Math.PI * 2,
      a: 0.8 + rng() * 1.2,
    },
    // Estado de animación procedural (lo lee PlayerModel)
    anim: { action: null, timer: 0 },
    kickCooldown: 0,
    teamColors: teamData.colors,
    // ---- Fase B: estado de juego ----
    stamina: 100,        // 0–100; el sprint la consume
    hasBall: false,      // posesión controlada del balón
    touchTimer: 0,       // temporizador de toques de conducción
    pokeCd: 0,           // cooldown de disputa suave
    passCd: 0,           // cooldown de pase (IA)
    tackleT: 0,          // tiempo restante de barrida
    tackleCd: 0,         // cooldown entre entradas
    tackleDx: 0, tackleDz: 0, // dirección de la barrida
    guardT: 0,           // Fase 4: protección tras el primer toque (sin pokes)
    burstCd: 0,          // cooldown del acelerón con Ctrl
    dribbleMod: false,   // modificador de regate (Ctrl) activo
    lastMoveAng: 0,      // última dirección de movimiento (giros bruscos)
    turnBoost: 1,        // multiplicador de giro (regate)
    // ---- Fase D: disciplina ----
    cards: { yellow: 0, red: false }, // tarjetas del partido
    sentOff: false,      // expulsado: no juega, no se mueve, la IA lo ignora
    // ---- Fase E ----
    substituted: false,  // salió por cambio (no puede volver a entrar)
  };
}

export function createMatch(homeTeam, awayTeam) {
  const rng = mulberry32(20260927); // semilla fija => determinista
  const engine = {
    homeTeam, awayTeam,
    players: [],
    home: [],
    away: [],
    ball: createBall(),
    matchTime: 0,        // segundos de partido
    frozen: false,        // pausa de simulación (gol, pausa UI)
    time: 0,              // tiempo real acumulado (para deriva IA)
    controlledUid: null,
    // ---- Fase B ----
    rng: mulberry32(20260927 + 7), // aleatoriedad de juego (determinista)
    charge: null,        // { uid, t, dx, dz } carga de tiro en curso
    passFx: null,        // indicador visual del último pase { x,z,dx,dz,len,t }
    passTarget: null,    // uid del receptor esperado del pase en curso
    passTargetT: 0,
    camKick: 0,          // "kick" de cámara tras un tiro (s)
    foulFreeze: 0,       // pausa por falta (s)
    fouls: [],           // registro de faltas (la Fase D añadirá tarjetas)
    helperUid: null,     // segundo defensor (tecla E)
    // ---- Fase E ----
    tickCount: 0,        // pasos fijos ejecutados (el replay muestrea cada 2)
    possTime: { home: 0, away: 0 }, // segundos con balón por equipo (estadísticas)
    lastScorerUid: null, // uid del último goleador (celebración)
    subsUsed: { home: new Set(), away: new Set() }, // dorsales ya usados en cambios
    replayBuf: createReplayBuffer(), // buffer circular de estados (repetición)
    replayMeta: null,    // { gx, atk, x, z } del último gol (ángulos de cámara)
    // ---- Fase 5 ----
    difficulty: "normal", // fácil|normal|difícil (la sincroniza Match desde el store)
    training: false,     // Fase 6: sin decisiones de IA (modo entrenamiento)
    assistSwitch: false, // Fase 10: cambio automático al recuperar (lo sincroniza Match)
  };
  initDeadBall(engine); // Fase D: máquina de balón parado + estadísticas

  const build = (teamData, isHome, side) => {
    const starters = teamData.players.slice(0, 11);
    const spots = assignSpots(teamData.formation, starters, isHome);
    const list = starters.map((d, i) => {
      const p = makePlayer(d, i, teamData, isHome, side, rng);
      p.homeSpot = { x: spots[i].x, z: spots[i].z };
      p.x = spots[i].x; p.z = spots[i].z;
      return p;
    });
    return list;
  };

  engine.home = build(homeTeam, true, "home");
  engine.away = build(awayTeam, false, "away");
  engine.players = [...engine.home, ...engine.away];

  // Jugador controlado por defecto: el delantero centro local (o el primer no portero).
  const def = engine.home.find((p) => p.role === "ST") || engine.home.find((p) => p.role !== "GK");
  def.controlled = true;
  engine.controlledUid = def.uid;

  return engine;
}

export function getControlled(engine) {
  return engine.players.find((p) => p.uid === engine.controlledUid);
}

/** Recoloca a todos en su sitio y el balón al centro (saque inicial / tras gol). */
export function kickoff(engine) {
  for (const p of engine.players) {
    p.x = p.homeSpot.x; p.z = p.homeSpot.z;
    p.vx = 0; p.vz = 0;
    p.facing = p.isHome ? 0 : Math.PI;
    p.anim.action = null; p.anim.timer = 0;
    p.hasBall = false; p.touchTimer = 0;
    p.tackleT = 0; p.tackleCd = 0; p.burstCd = 0; p.pokeCd = 0;
  }
  // Los dos delanteros del equipo que saca se acercan al círculo central.
  resetBall(engine.ball);
  engine.charge = null;
  engine.passFx = null;
  engine.passTarget = null;
  engine.passTargetT = 0;
  engine.foulFreeze = 0;
  engine.helperUid = null;
  engine.frozen = false;
  engine.lastScorerUid = null;
  resetDeadBall(engine); // Fase D: cierra cualquier balón parado (las tarjetas persisten)
  resetAIState(engine); // la Fase C limpia fases, presionadores y debug
}

/** Integrar un jugador hacia su velocidad deseada. */
function integratePlayer(p, dt, desVX, desVZ) {
  const accel = p.controlled ? PLAYER.accel : 14;
  p.vx += clamp(desVX - p.vx, -accel * dt, accel * dt);
  p.vz += clamp(desVZ - p.vz, -accel * dt, accel * dt);
  p.x += p.vx * dt;
  p.z += p.vz * dt;
  // Limita al interior del área de juego (muros invisibles también para jugadores)
  const MX = FIELD.halfLength + 3.5, MZ = FIELD.halfWidth + 2.5;
  p.x = clamp(p.x, -MX, MX);
  p.z = clamp(p.z, -MZ, MZ);
  // Orientación hacia la dirección de movimiento
  const sp = Math.hypot(p.vx, p.vz);
  if (sp > 0.4) {
    const target = Math.atan2(p.vz, p.vx);
    let d = target - p.facing;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d <= -Math.PI) d += Math.PI * 2;
    const tr = PLAYER.turnRate * (p.turnBoost || 1); // regate (mando): giro más cerrado
    p.facing += clamp(d, -tr * dt, tr * dt);
  }
}

/** Separación suave entre jugadores (evita que se solapen). */
function separatePlayers(players) {
  for (let i = 0; i < players.length; i++) {
    if (players[i].sentOff) continue; // Fase D: los expulsados no existen físicamente
    for (let j = i + 1; j < players.length; j++) {
      const a = players[i], b = players[j];
      if (b.sentOff) continue;
      const dx = b.x - a.x, dz = b.z - a.z;
      const d = Math.hypot(dx, dz);
      const min = a.radius + b.radius;
      if (d > 0.001 && d < min) {
        const push = ((min - d) / d) * 0.5;
        // El poseedor planta los pies: el que llega rebota y él no se mueve.
        // Sin esto, un contacto desplazaría al portador parado lejos de su
        // propio balón hasta "escapársele" (>1,7 m), perdiéndolo sin que
        // nadie se lo hubiera quitado de verdad.
        if (a.hasBall && !b.hasBall) {
          b.x += dx * push * 2; b.z += dz * push * 2;
        } else if (b.hasBall && !a.hasBall) {
          a.x -= dx * push * 2; a.z -= dz * push * 2;
        } else {
          a.x -= dx * push; a.z -= dz * push;
          b.x += dx * push; b.z += dz * push;
        }
      }
    }
  }
}

// El contacto balón-jugador vive en src/game/ballContact.js (Fase B:
// control con calidad de toque, intercepciones, conducción por toques,
// robos y disputas). Se importa arriba y se llama desde stepEngine.

/** ¿El balón cruzó la línea de gol dentro de los postes? Devuelve 'home'|'away'|null. */
function checkGoal(b) {
  const { halfLength } = FIELD;
  const inMouth = Math.abs(b.z) < 3.66 && b.y < 2.44;
  if (!inMouth) return null;
  if (b.x > halfLength + BALL.radius * 0.5) return "home";  // el local ataca +x
  if (b.x < -halfLength - BALL.radius * 0.5) return "away";
  return null;
}

function scorerName(engine, side) {
  const id = engine.ball.lastTouch;
  const p = engine.players.find((q) => q.uid === id);
  if (p && p.side === side) return p.data.name;
  return side === "home" ? engine.homeTeam.abbreviation : engine.awayTeam.abbreviation;
}

/**
 * Jugador controlado durante la colocación del balón parado (Fase D):
 * camina a su posición; el lanzador se queda quieto apuntando (IJKL =
 * puntería, no movimiento) y el portero que defiende un penalti se mueve
 * por la línea y se estira con D.
 */
function moveControlledDeadBall(engine, p, input, dt) {
  const db = engine.deadBall;
  if (db.state === DB.READY && db.userKicking && p.uid === db.kickerUid) {
    p.vx *= 0.7; p.vz *= 0.7;
    p.x += p.vx * dt; p.z += p.vz * dt;
    return;
  }
  if (db.state === DB.READY && db.userKeeping && p.uid === db.keeperUid) {
    const s = db.spots[p.uid];
    if (s) p.x = s.x;
    if (db.keeperDive && db.keeperDive.t > 0) {
      db.keeperDive.t -= dt;
      const tz = clamp((s ? s.z : 0) + db.keeperDive.dir * 3.1, -3.6, 3.6);
      const dz = tz - p.z;
      integratePlayer(p, dt, 0, clamp(dz * 8, -p.maxSpeed, p.maxSpeed));
    } else {
      integratePlayer(p, dt, 0, input.x * p.maxSpeed * 0.55);
      p.z = clamp(p.z, -3.4, 3.4);
      if (Math.abs(input.x) > 0.2) db.keeperLean = Math.sign(input.x);
    }
    return;
  }
  const s = db.spots[p.uid];
  if (s) {
    const dx = s.x - p.x, dz = s.z - p.z;
    const d = Math.hypot(dx, dz);
    if (d > 0.15) {
      const sp = Math.min(p.maxSpeed * 0.95, (d * 4));
      integratePlayer(p, dt, (dx / (d || 1)) * sp, (dz / (d || 1)) * sp);
    } else {
      p.vx *= 0.8; p.vz *= 0.8;
    }
  }
}

/**
 * Avanza la simulación un paso fijo.
 * @param {object} engine
 * @param {number} dt paso fijo (segundos reales)
 * @param {{x:number,z:number,sprint?:boolean,dribble?:boolean}} input dirección
 *        del jugador controlado (IJKL) + sprint
 * @param {{onGoal:(side:string, scorer:string)=>void}} events
 */
export function stepEngine(engine, dt, input, events) {
  if (engine.frozen) return;
  engine.tickCount += 1;
  // Compat Fase B: el aviso de falta antiguo decae (la Fase D reanuda con
  // la mini-máquina de balón parado en vez de congelar el juego).
  if (engine.foulFreeze > 0) engine.foulFreeze -= dt;
  const db = engine.deadBall;
  // Fase D: durante la colocación el balón está quieto y nadie lo disputa;
  // la IA se posiciona (decideDeadBall) en vez de decidir jugadas.
  const positioning = db.state === DB.SETUP || db.state === DB.READY;
  engine.time += dt;
  engine.matchTime += dt * MATCH_TIME_SCALE;

  // 1. IA colectiva (Fase C): decisiones a ~12 Hz + steering por frame.
  // El ctx lleva el motor, los rivales y el uid controlado para la IA.
  // Fase 6: en entrenamiento no hay decisiones (los jugadores obedecen al
  // guion del drill; el usuario y la física siguen activos).
  const base = {
    ball: engine.ball,
    time: engine.time,
    engine,
    controlledUid: engine.controlledUid,
  };
  if (!engine.training) {
    aiTick(
      { players: engine.home, isHome: true, formation: engine.homeTeam.formation },
      { ...base, opponents: engine.away },
      dt
    );
    aiTick(
      { players: engine.away, isHome: false, formation: engine.awayTeam.formation },
      { ...base, opponents: engine.home },
      dt
    );
  }

  // 1b. Fase B: segundo defensor (tecla E). Solo en juego abierto.
  if (!positioning && engine.helperUid) {
    const h = engine.players.find((p) => p.uid === engine.helperUid);
    if (h && !h.controlled) {
      const oppPoss = engine.players.find((q) => q.hasBall && q.side !== h.side);
      const t = oppPoss || engine.ball;
      h.moveTarget = { x: t.x, z: t.z };
      h.desiredSpeed = h.maxSpeed * 0.92;
    }
  }

  // 2. Movimiento de jugadores (los expulsados no se mueven ni deciden)
  for (const p of engine.players) {
    if (p.kickCooldown > 0) p.kickCooldown -= dt;
    if (p.touchTimer > 0) p.touchTimer -= dt;
    if (p.pokeCd > 0) p.pokeCd -= dt;
    if (p.passCd > 0) p.passCd -= dt;
    if (p.tackleCd > 0) p.tackleCd -= dt;
    if (p.burstCd > 0) p.burstCd -= dt;
    if (p.tackleT > 0) p.tackleT -= dt;
    if (p.guardT > 0) p.guardT -= dt;
    if (p.anim.timer > 0) {
      p.anim.timer -= dt;
      if (p.anim.timer <= 0) p.anim.action = null;
    }
    if (p.sentOff) continue; // expulsado: fuera del partido
    // Stamina (Fase B): el sprint la consume, trotar/parado la recupera
    const spd = Math.hypot(p.vx, p.vz);
    const sprinting = p.controlled
      ? !!(input.sprint && spd > 3)
      : p.desiredSpeed > p.maxSpeed * 0.75;
    updateStamina(p, dt, sprinting, spd > 0.6);

    if (p.controlled) {
      if (positioning) {
        moveControlledDeadBall(engine, p, input, dt);
      } else if (p.tackleT > 0) {
        // Barrida: lunge corto en la dirección de la entrada
        integratePlayer(p, dt, p.tackleDx * 8.5, p.tackleDz * 8.5);
      } else {
        p.dribbleMod = !!input.dribble;
        p.turnBoost = input.dribble ? 1.4 : 1; // regate (mando): giros más cerrados
        // Sprint = velocidad máxima; sin sprint = trote (62 %). La stamina
        // baja reduce la punta; con regate (mando) y balón, algo menos de punta.
        let mul = input.sprint ? 1 : 0.62;
        if (input.dribble && p.hasBall) mul *= 0.85;
        mul *= staminaSpeedFactor(p);
        integratePlayer(p, dt, input.x * p.maxSpeed * mul, input.z * p.maxSpeed * mul);
      }
    } else if (p.moveTarget) {
      const dx = p.moveTarget.x - p.x, dz = p.moveTarget.z - p.z;
      const d = Math.hypot(dx, dz);
      let sp = p.desiredSpeed;
      // Fase 4: la IA fundida no esprinta (gestiona su stamina).
      if (p.stamina < 25) sp = Math.min(sp, p.maxSpeed * 0.7);
      if (d < 1.2) sp *= d / 1.2; // llegada suave
      const k = d > 1e-4 ? sp / d : 0;
      integratePlayer(p, dt, dx * k, dz * k);
    }
  }
  separatePlayers(engine.players);
  if (engine.camKick > 0) engine.camKick -= dt;
  if (engine.passFx && engine.passFx.t > 0) engine.passFx.t -= dt;

  // Balón parado: la mini-máquina avanza (colocación -> ejecución) y el paso
  // termina aquí: el balón está quieto y nadie lo disputa.
  if (positioning) {
    stepDeadBall(engine, dt);
    return;
  }
  // EXECUTED: el juego ya corre con normalidad; solo avanza el temporizador
  // para cerrar a OPEN_PLAY y resetear las fases colectivas (si no, el estado
  // se quedaba en EXECUTED para siempre porque stepDeadBall no se llamaba).
  if (db.state === DB.EXECUTED) stepDeadBall(engine, dt);

  // 3. Balón (subpasos para estabilidad a alta velocidad)
  const sub = BALL_SUBSTEPS;
  for (let i = 0; i < sub; i++) stepBall(engine.ball, dt / sub);

  // 4. Contacto balón-jugadores (Fase B: control, intercepciones, robos)
  ballPlayerContact(engine, dt);

  // 4a. Posesión (Fase E): acumula tiempo con balón por equipo.
  for (const p of engine.players) {
    if (p.hasBall) {
      engine.possTime[p.side] += dt;
      break;
    }
  }

  // 4b. Fuera de juego por interferencia (puede abrir un balón parado).
  if (engine.deadBall.state === DB.OPEN) {
    checkOffsideInterference(engine, whistleOffside);
  }

  // 5. Gol o salida del balón (solo si no se abrió un balón parado en 4–4b).
  // El gol tiene prioridad: se comprueba antes que la salida.
  const st = engine.deadBall.state;
  if (st === DB.OPEN || st === DB.EXECUTED) {
    const goal = checkGoal(engine.ball);
    if (goal && events?.onGoal) {
      engine.frozen = true; // la UI celebra y luego llama a kickoff()
      engine.lastScorerUid = engine.ball.lastTouch;
      events.onGoal(goal, scorerName(engine, goal));
    } else if (!engine.frozen) {
      checkOutOfBounds(engine);
    }
  }
}

/** Centroide de la acción (para la cámara broadcast). */
export function actionCenter(engine) {
  const b = engine.ball;
  let sx = 0, sz = 0, n = 0;
  for (const p of engine.players) {
    const d = Math.hypot(p.x - b.x, p.z - b.z);
    if (d < 18) { sx += p.x; sz += p.z; n++; }
  }
  if (n === 0) return { x: b.x, z: b.z };
  return { x: sx / n, z: sz / n };
}

// ---------------------------------------------------------------------------
// Sustituciones (Fase E): cambio simple pero funcional.
// El suplente hereda la posición táctica del titular (mismo uid de motor,
// nueva ficha: nombre, dorsal, rol y velocidad). El titular sale del partido.
// Máx. 5 por equipo; un jugador sustituido no puede volver a entrar.

/** Titulares disponibles para salir (no expulsados ni ya sustituidos). */
export function substitutionCandidates(engine, side) {
  const list = side === "home" ? engine.home : engine.away;
  return list.filter((p) => !p.sentOff && !p.substituted);
}

/** Suplentes disponibles para entrar (los 7 menos los ya usados). */
export function availableSubs(engine, side) {
  const team = side === "home" ? engine.homeTeam : engine.awayTeam;
  const used = engine.subsUsed[side];
  return team.players.slice(11).filter((d) => !used.has(d.id));
}

/**
 * Hace un cambio. Devuelve { ok, out, in, error }.
 * @param {string} titularUid uid del motor del jugador que sale
 * @param {string} subDataId id de la ficha del suplente que entra
 */
export function substitutePlayer(engine, side, titularUid, subDataId) {
  const list = side === "home" ? engine.home : engine.away;
  const team = side === "home" ? engine.homeTeam : engine.awayTeam;
  const p = list.find((q) => q.uid === titularUid);
  const sub = team.players.slice(11).find((d) => d.id === subDataId);
  if (!p || p.sentOff || p.substituted) return { ok: false, error: "titular no válido" };
  if (!sub || engine.subsUsed[side].has(sub.id)) return { ok: false, error: "suplente no válido" };
  if (engine.subsUsed[side].size >= 5) return { ok: false, error: "límite de 5 cambios" };
  const outName = p.data.name;
  p.data = sub;
  p.role = sub.position;
  p.substituted = true;
  p.maxSpeed = statSpeed(sub.speed);
  p.teamColors = team.colors;
  engine.subsUsed[side].add(sub.id);
  return { ok: true, out: outName, in: sub.name };
}

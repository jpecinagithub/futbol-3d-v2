// Drills del modo entrenamiento (Fase 6).
// Cada drill: setup (coloca jugadores y balón), check (condición de éxito y
// texto de progreso), script opcional por frame y marcador de objetivo.
// Se juegan en la escena real con la IA congelada (engine.training): sin
// rivales listos, solo el ejercicio. Sin trampas: física y controles reales.

import { enterDeadBall, DB } from "../game/deadball.js";

function controlledOf(engine) {
  return engine.players.find((p) => p.controlled);
}

function clearAll(engine) {
  for (const p of engine.players) p.hasBall = false;
  const b = engine.ball;
  b.vx = 0; b.vy = 0; b.vz = 0; b.spin = 0;
  engine.charge = null;
  engine.passCharge = null;
  engine.passTarget = null;
}

function giveToControlled(engine, x = null, z = null) {
  clearAll(engine);
  const c = controlledOf(engine);
  if (x !== null) { c.x = x; c.z = z; c.vx = 0; c.vz = 0; }
  c.hasBall = true;
  const b = engine.ball;
  b.x = c.x; b.y = 0.22; b.z = c.z;
  b.vx = 0; b.vy = 0; b.vz = 0;
  b.lastTouch = null; b.touchCooldown = 0;
}

export const DRILLS = [
  {
    id: "move",
    title: "1 · Movimiento",
    hint: "Llega al círculo amarillo con IJKL, WASD o flechas.",
    marker: { x: 10, z: 0, r: 3 },
    setup(engine) {
      const c = controlledOf(engine);
      c.x = -20; c.z = 0; c.vx = 0; c.vz = 0;
      clearAll(engine);
      const b = engine.ball;
      b.x = -40; b.z = 25; b.y = 0.22;
    },
    check(engine) {
      const c = controlledOf(engine);
      const d = Math.hypot(c.x - 10, c.z - 0);
      return { done: d < 3, text: d < 3 ? "¡Dentro del círculo!" : `Distancia: ${d.toFixed(0)} m` };
    },
  },
  {
    id: "sprint",
    title: "2 · Sprint y stamina",
    hint: "Esprinta (Shift) hasta el círculo: la barra debe bajar de 92.",
    marker: { x: 30, z: 0, r: 4 },
    setup(engine) {
      const c = controlledOf(engine);
      c.x = -30; c.z = 0; c.vx = 0; c.vz = 0;
      c.stamina = 100;
      clearAll(engine);
      const b = engine.ball;
      b.x = -40; b.z = 25; b.y = 0.22;
    },
    check(engine) {
      const c = controlledOf(engine);
      const d = Math.hypot(c.x - 30, c.z - 0);
      const spent = c.stamina < 92;
      return {
        done: d < 4 && spent,
        text: d >= 4 ? `Distancia: ${d.toFixed(0)} m` : `Stamina: ${c.stamina.toFixed(0)} (corre con Shift)`,
      };
    },
  },
  {
    id: "pass",
    title: "3 · Pase",
    hint: "Completa 2 pases a compañeros (mira el anillo cian del receptor).",
    marker: null,
    setup(engine) {
      giveToControlled(engine, -10, 0);
    },
    check(engine, aux) {
      return {
        done: (aux.passes || 0) >= 2,
        text: `Pases completados: ${Math.min(aux.passes || 0, 2)} / 2`,
      };
    },
  },
  {
    id: "shoot",
    title: "4 · Tiro",
    hint: "Marca gol: carga el tiro (mantén) y suelta. El portero no se mueve.",
    marker: null,
    setupOnResume: true, // tras la celebración se recoloca para seguir tirando
    setup(engine) {
      giveToControlled(engine, -22, 6);
    },
    check(engine, aux, store) {
      const goals = (store.events || []).filter((e) => e.type === "goal").length;
      return { done: goals > 0, text: goals > 0 ? "¡GOL!" : "Prueba colocado, potente o vaselina" };
    },
  },
  {
    id: "tackle",
    title: "5 · Defensa y entradas",
    hint: "Quítale el balón al rival: entra (A/F) cuando lo lleve largo o intercepta.",
    marker: null,
    setup(engine) {
      clearAll(engine);
      const c = controlledOf(engine);
      c.x = 4; c.z = 0; c.vx = 0; c.vz = 0;
      const r = engine.players.find((p) => p.side === "away" && p.role === "ST" && !p.sentOff)
        || engine.players.find((p) => p.side === "away" && !p.sentOff);
      r.x = 12; r.z = 0; r.vx = 0; r.vz = 0;
      r.hasBall = true;
      engine.drillRunnerUid = r.uid;
      const b = engine.ball;
      b.x = r.x; b.y = 0.22; b.z = r.z;
      b.vx = 0; b.vy = 0; b.vz = 0;
      b.lastTouch = r.uid; b.touchCooldown = 0;
    },
    script(engine, dt) {
      // El rival conduce con toques LARGOS (balón 1,2 m por delante, como la
      // conducción real): se le puede entrar limpio o interceptar. En cuanto
      // la pierde, el guion se detiene.
      const r = engine.players.find((p) => p.uid === engine.drillRunnerUid);
      if (!r || !r.hasBall) return;
      r.x -= 2.2 * dt;
      r.vx = -2.2; r.vz = 0;
      r.facing = Math.PI;
      const b = engine.ball;
      b.x = r.x - 1.2; b.z = r.z; b.y = 0.22;
      b.vx = -2.2; b.vz = 0; b.vy = 0;
      b.lastTouch = r.uid;
    },
    check(engine) {
      const c = controlledOf(engine);
      return { done: !!c.hasBall, text: c.hasBall ? "¡Balón recuperado!" : "Entra cuando lleve el balón largo" };
    },
  },
  {
    id: "switch",
    title: "6 · Cambio de jugador",
    hint: "Pulsa Q para cambiar al siguiente jugador.",
    marker: null,
    setup(engine) {
      clearAll(engine);
      const b = engine.ball;
      b.x = 20; b.z = 10; b.y = 0.22;
    },
    check(engine, aux) {
      return { done: !!aux.switched, text: aux.switched ? "¡Cambiado!" : "Pulsa Q" };
    },
  },
  {
    id: "deadball",
    title: "7 · Balón parado",
    hint: "Ejecuta la falta: apunta con el movimiento y saca (A/E).",
    marker: null,
    setup(engine) {
      enterDeadBall(engine, "free-kick", {
        takerSide: "home",
        spot: { x: 28, z: 8 },
        notice: "Falta a favor — ejecuta tú",
      });
    },
    check(engine, aux) {
      const st = !engine.deadBall ? DB.OPEN : engine.deadBall.state;
      const open = st === DB.OPEN || st === DB.EXECUTED;
      // Saque ejecutado = se abrió el juego y el balón ya no está en el punto.
      const spot = aux.spot || (aux.spot = { x: engine.ball.x, z: engine.ball.z });
      const moved = Math.hypot(engine.ball.x - spot.x, engine.ball.z - spot.z) > 1;
      return {
        done: (aux.sawReady && open) || (aux.armed && open && moved) || aux.executed,
        text: open && !aux.sawReady && !aux.armed ? "Colocando…" : "Ejecuta el saque",
      };
    },
  },
];

export function getDrill(id) {
  return DRILLS.find((d) => d.id === id) || null;
}

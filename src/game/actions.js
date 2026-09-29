// Fase B: traduce la entrada del frame (teclado/gamepad) en acciones de juego.
// Se ejecuta una vez por frame (no por subpaso fijo): los eventos son de
// flanco y se consumen aquí. El movimiento continuo lo consume stepEngine.

import { getControlled } from "./engine";
import { possessorOf } from "./possession";
import { doGroundPass, doThroughBall, doCross, doLobbedPass } from "./passing";
import { startShotCharge, updateCharge, releaseShot } from "./shooting";
import { startTackle } from "./tackling";
import { switchPlayer } from "./playerSwitch";
import { tryBurst } from "./dribbling";
import { computeMove } from "./input";
// Fase D: la entrada durante el balón parado la gestiona la mini-máquina
import { DB, processDeadBallActions } from "./deadball";

/** Compañero de campo más cercano al poseedor rival (para la tecla E). */
function nearestHelper(engine, ctrl) {
  const poss = possessorOf(engine);
  const tx = poss ? poss.x : engine.ball.x;
  const tz = poss ? poss.z : engine.ball.z;
  let best = null, bd = Infinity;
  for (const p of engine.players) {
    if (p.side !== ctrl.side || p === ctrl || p.role === "GK") continue;
    const d = Math.hypot(p.x - tx, p.z - tz);
    if (d < bd) { bd = d; best = p; }
  }
  return best ? best.uid : null;
}

export function processActions(engine, fin, dt) {
  if (engine.frozen) return;
  // Fase D: con el balón parado la entrada la gestiona la mini-máquina
  // (SETUP: colocación automática; READY: apuntar y ejecutar el saque).
  const dbState = engine.deadBall ? engine.deadBall.state : DB.OPEN;
  if (dbState === DB.SETUP) return;
  if (dbState === DB.READY) {
    processDeadBallActions(engine, fin, dt);
    return;
  }
  const ctrl = getControlled(engine);
  if (!ctrl) return;
  const hasBall = possessorOf(engine) === ctrl;

  // Carga de tiro en curso: actualizar, apuntar o cancelar
  if (engine.charge) {
    const charger = engine.players.find((p) => p.uid === engine.charge.uid);
    if (!charger || charger !== ctrl || possessorOf(engine) !== charger) {
      engine.charge = null; // perdió el balón o cambió de jugador
    } else {
      updateCharge(engine, dt, fin.shootHeld, fin.move, fin.sprint);
    }
  }

  // Fase 4: carga del pase (WASD, tecla de pase mantenida): 0–0,8 s => 1x–1,6x.
  // La suelta ("passUp") ejecuta el pase; perder el balón la anula.
  if (engine.passCharge) {
    const passer = engine.players.find((p) => p.uid === engine.passCharge.uid);
    if (!passer || passer !== ctrl || possessorOf(engine) !== passer) {
      engine.passCharge = null;
    } else if (fin.passHeld) {
      engine.passCharge.t = Math.min(0.8, engine.passCharge.t + dt);
    }
  }

  // Tecla de acción/tiro mantenida (A en IJKL, Espacio en WASD): >0,35 s
  // empieza la carga de tiro (en WASD el tiro también arranca al pulsar).
  const aHeld = !!fin.actionHeld;
  if (hasBall && aHeld && !engine.charge) {
    engine.actionHoldT = (engine.actionHoldT || 0) + dt;
    if (engine.actionHoldT > 0.35) {
      startShotCharge(engine, ctrl, fin.move);
      engine.actionHoldT = 0;
    }
  } else if (!aHeld) {
    engine.actionHoldT = 0;
  }

  for (const ev of fin.events) {
    switch (ev) {
      case "pass":
        // Fase 3: si se estaba cargando un tiro, el pase lo CANCELA
        // (no sale ni pase ni tiro).
        if (engine.charge) {
          engine.charge = null;
          break;
        }
        if (!hasBall) break;
        if (!fin.bindings.action && fin.passHeld) {
          // WASD: el pase sale al soltar (permite cargar potencia).
          if (!engine.passCharge) engine.passCharge = { uid: ctrl.uid, t: 0 };
        } else {
          // Toque directo (IJKL contextual, mando o reasignado): pase tenso
          // si se corre (Fase 4).
          doGroundPass(engine, ctrl, fin.move, null, { driven: fin.sprint });
        }
        break;
      case "passUp": {
        // WASD: suelta de E => pase con la potencia cargada (1x–1,6x).
        const pc = engine.passCharge;
        engine.passCharge = null;
        if (pc && hasBall && pc.uid === ctrl.uid) {
          doGroundPass(engine, ctrl, fin.move, null, {
            powerMult: 1 + pc.t * 0.75,
            driven: fin.sprint,
          });
        }
        break;
      }
      case "lob":
        // Fase 4: C/Y durante una carga de tiro = vaselina.
        if (engine.charge) {
          engine.charge.chip = true;
          break;
        }
        if (hasBall) doLobbedPass(engine, ctrl, fin.move);
        break;
      case "through":
        // Fase 4: C/Y durante una carga de tiro = vaselina.
        if (engine.charge) {
          engine.charge.chip = true;
          break;
        }
        if (hasBall) doThroughBall(engine, ctrl);
        break;
      case "cross":
        if (hasBall) doCross(engine, ctrl);
        break;
      case "shootDown":
        if (hasBall) startShotCharge(engine, ctrl, fin.move);
        else startTackle(engine, ctrl, fin.move);
        break;
      case "shootUp":
        // Fase 4: sprint al soltar = tiro potente.
        if (engine.charge) {
          engine.charge.driven = engine.charge.driven || fin.sprint;
          releaseShot(engine);
        }
        break;
      case "tackleDown":
        // Fase 3: entrada dedicada (F en WASD). Con balón no hace nada.
        if (!hasBall) startTackle(engine, ctrl, fin.move);
        break;
      case "actionDown":
        // A pulsada: recordar si tenía el balón. El pase al SOLTAR solo se
        // ejecuta si la pulsación EMPEZÓ con balón: evita el "pase fantasma"
        // cuando se pulsa A para entrar, se gana el balón a mitad de
        // pulsación y se suelta (el usuario pidió una entrada, no un pase).
        engine.actionDownHadBall = hasBall;
        if (!hasBall) startTackle(engine, ctrl, fin.move);
        break;
      case "actionUp":
        // A soltada con balón: si se estaba cargando el tiro, disparar;
        // si fue un toque que empezó con balón, pase raso al compañero.
        if (hasBall) {
          if (engine.charge) {
            engine.charge.driven = engine.charge.driven || fin.sprint;
            releaseShot(engine);
          } else if (engine.actionDownHadBall) {
            doGroundPass(engine, ctrl, fin.move, null, { driven: fin.sprint });
          }
        }
        engine.actionDownHadBall = false;
        break;
      case "switch":
        // Fase 4: el stick derecho propone dirección propia.
        switchPlayer(engine, fin.switchMove || fin.move);
        break;
      default:
        break;
    }
  }

  // Cambio de ritmo: amago de sprint con Ctrl mantenido y balón
  if (fin.sprintPressed && fin.dribbleMod && hasBall) {
    tryBurst(engine, ctrl, fin.move);
  }

  // Segundo defensor (E mantenido): el compañero más cercano presiona también
  engine.helperUid = fin.helper ? nearestHelper(engine, ctrl) : null;

  // Mientras se carga el tiro, la tecla de tiro no mueve (se apunta con el
  // movimiento/IJKL/flechas del esquema activo)
  if (engine.charge) {
    fin.move = computeMove(fin.downCodes, fin.bindings, fin.shootCodes);
  }
}

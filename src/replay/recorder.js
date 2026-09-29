// GANCHO para la Fase futura de repeticiones.
// Como el motor es determinista (paso fijo + semilla fija), una repetición
// solo necesita: semilla inicial + secuencia de inputs por tick.
// Este módulo define la interfaz; la UI de replay la implementará otra fase.

export function createRecorder() {
  return {
    seed: 20260927,
    inputs: [],       // [{ tick, x, z }] inputs del jugador controlado
    startTick: 0,
  };
}

/** Guarda el input de un tick (lo llama el bucle del partido). */
export function recordInput(rec, tick, input) {
  const last = rec.inputs[rec.inputs.length - 1];
  if (!last || last.x !== input.x || last.z !== input.z) {
    rec.inputs.push({ tick, x: input.x, z: input.z });
  }
}

/** Recupera el input vigente en un tick para reproducir la repetición. */
export function inputAtTick(rec, tick) {
  let cur = { x: 0, z: 0 };
  for (const e of rec.inputs) {
    if (e.tick <= tick) cur = e;
    else break;
  }
  return cur;
}

// TODO (fase de replays): UI de timeline, cámara libre y exportar a vídeo.

// Gestor de entrada unificado (Fase 3): dos esquemas de teclado + gamepad.
// Produce por frame:
//   { move:{x,z}, downCodes, sprint, sprintPressed, dribbleMod, helper,
//     shootHeld, actionHeld, shootCodes, source, events[] }
//
// Esquemas (se elige en pausa/controles, se guarda en f3d.scheme):
// - IJKL (clásico): IJKL/flechas mueven; S o Shift corren; A es contextual
//   (toque = pase, mantener = tiro, sin balón = entrada); Q cambia.
// - WASD (alternativo): WASD/flechas mueven; Shift corre (S mueve: se acabó
//   el conflicto S correr/bajar); E = pase, Espacio = tiro (mantener carga),
//   F = entrada, Q cambia.
// Las teclas se pueden reasignar por acción (f3d.bindings).
// Gamepad estándar sin cambios; con deadzone y sensibilidad configurables.

export const SCHEMES = ["ijkl", "wasd"];
export const SCHEME_LABEL = { ijkl: "IJKL (clásico)", wasd: "WASD" };

// Acciones reasignables. sprint admite varias teclas.
export const BIND_ACTIONS = [
  "up", "down", "left", "right", "sprint",
  "pass", "shoot", "tackle", "switch", "lob", "through",
];
export const ACTION_LABEL = {
  up: "Arriba", down: "Abajo", left: "Izquierda", right: "Derecha",
  sprint: "Correr", pass: "Pase raso", shoot: "Tiro", tackle: "Entrada",
  switch: "Cambiar jugador", lob: "Pase alto / bombeado", through: "Pase al hueco",
};

const DEFAULTS = {
  ijkl: {
    up: "KeyI", down: "KeyK", left: "KeyJ", right: "KeyL",
    sprint: ["ShiftLeft", "ShiftRight", "KeyS"],
    pass: "KeyA", shoot: "KeyA", tackle: "KeyA", switch: "KeyQ",
    lob: "KeyX", through: "KeyC",
    action: "KeyA", // tecla contextual (pase/tiro/entrada/saque)
  },
  wasd: {
    up: "KeyW", down: "KeyS", left: "KeyA", right: "KeyD",
    sprint: ["ShiftLeft", "ShiftRight"],
    pass: "KeyE", shoot: "Space", tackle: "KeyF", switch: "KeyQ",
    lob: "KeyX", through: "KeyC",
    action: null, // sin tecla contextual: pase/tiro/entrada van separados
  },
};

const ARROWS = { up: "ArrowUp", down: "ArrowDown", left: "ArrowLeft", right: "ArrowRight" };

/** Resuelve los bindings activos: defaults del esquema + overrides del usuario. */export function resolveBindings(scheme, overrides) {
  const d = DEFAULTS[scheme] || DEFAULTS.ijkl;
  const o = (overrides && overrides[scheme]) || {};
  const out = {};
  for (const a of [...BIND_ACTIONS, "action"]) {
    out[a] = o[a] !== undefined ? o[a] : d[a];
  }
  return out;
}

/** Valor por defecto de una acción en un esquema (para el swap sin conflictos). */
export function defaultBinding(scheme, action) {
  const d = DEFAULTS[scheme] || DEFAULTS.ijkl;
  return d[action];
}

/** Todos los códigos que el juego debe capturar (para preventDefault). */
export function gameKeyCodes(scheme, overrides) {
  const b = resolveBindings(scheme, overrides);
  const set = new Set(Object.values(ARROWS));
  for (const a of BIND_ACTIONS) {
    const v = b[a];
    if (Array.isArray(v)) for (const c of v) set.add(c);
    else if (v) set.add(v);
  }
  if (b.action) set.add(b.action);
  return [...set];
}

const PRETTY = {
  Space: "Espacio", ShiftLeft: "Mayús", ShiftRight: "Mayús",
  ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→",
  Escape: "Esc", Enter: "Enter", Tab: "Tab",
};
/** Etiqueta legible de un código de tecla (ES). */
export function keyLabel(code) {
  if (!code) return "—";
  if (PRETTY[code]) return PRETTY[code];
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  return code;
}

export function createInputState() {
  return {
    keys: {},      // code -> true mientras pulsada
    queue: [],     // pulsaciones desde el último poll ("^CODE" = soltado)
    padPrev: [],   // botones del gamepad en el frame anterior
    padSeen: -999, // último frame con actividad de gamepad
    keySeen: -999, // último frame con actividad de teclado
    rsArmed: true, // stick derecho listo (se desarma al disparar el flick)
    rsT: -999,     // último frame con flick de stick derecho
    frame: 0,
  };
}

export function attachKeyboard(st, codeList) {
  const down = (e) => {
    if (codeList && codeList.includes(e.code)) e.preventDefault();
    if (e.repeat) return;
    if (!st.keys[e.code]) st.queue.push(e.code);
    st.keys[e.code] = true;
  };
  const up = (e) => {
    st.keys[e.code] = false;
    // Fase 11: la suelta SIEMPRE se encola (la lista de captura es del
    // montaje y una tecla reasignada después quedaría sin "suelta": cargas
    // eternas). El preventDefault sí sigue limitado a teclas del juego.
    st.queue.push("^" + e.code);
  };
  const blur = () => { st.keys = {}; };
  window.addEventListener("keydown", down);
  window.addEventListener("keyup", up);
  window.addEventListener("blur", blur);
  st._detach = () => {
    window.removeEventListener("keydown", down);
    window.removeEventListener("keyup", up);
    window.removeEventListener("blur", blur);
  };
  st._codes = codeList;
}

export function detachKeyboard(st) {
  if (st._detach) st._detach();
}

/** Movimiento 2D desde el mapa de teclas (arriba = -Z, hacia la cámara TV). */
export function computeMove(keys, bindings, exclude = []) {
  const ex = new Set(exclude);
  const has = (c) => c && keys[c] && !ex.has(c);
  const b = bindings || {};
  let x = 0, z = 0;
  if (has(b.left) || has(ARROWS.left)) x -= 1;
  if (has(b.right) || has(ARROWS.right)) x += 1;
  if (has(b.up) || has(ARROWS.up)) z -= 1;
  if (has(b.down) || has(ARROWS.down)) z += 1;
  const l = Math.hypot(x, z);
  if (l > 1) { x /= l; z /= l; }
  return { x, z };
}

const asArray = (v) => (Array.isArray(v) ? v : v ? [v] : []);

/** Sondea el gamepad una vez por frame. Sin gamepad devuelve valores neutros. */
function pollGamepad(st, deadzone, sensitivity) {
  const out = {
    move: null, sprint: false, sprintPressed: false, dribbleMod: false,
    helper: false, shootHeld: false, events: [], active: false,
  };
  let pads = null;
  try {
    pads = typeof navigator !== "undefined" && navigator.getGamepads
      ? navigator.getGamepads()
      : null;
  } catch {
    return out;
  }
  if (!pads) return out;
  let gp = null;
  for (const p of pads) {
    if (p && p.connected) { gp = p; break; }
  }
  if (!gp) return out;

  const dz = deadzone ?? 0.22;
  const sens = sensitivity ?? 1;
  const b = gp.buttons.map((x) => x.pressed || x.value > 0.35);
  const prev = st.padPrev;
  const edge = (i) => b[i] && !prev[i];

  const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
  const mag = Math.hypot(ax, ay);
  if (mag > dz || b.some(Boolean)) {
    st.padSeen = st.frame;
    out.active = true;
  }
  if (mag > dz) {
    const k = Math.min(1, ((mag - dz) / 0.6) * sens);
    out.move = { x: (ax / mag) * k, z: (ay / mag) * k };
  }
  out.sprint = !!b[7];            // RT
  out.sprintPressed = edge(7);
  out.dribbleMod = !!b[6];        // LT = regate
  out.helper = !!b[5];            // RB = segundo defensor
  out.shootHeld = !!b[1];         // B = tiro
  if (edge(0)) out.events.push("pass");       // A = pase raso
  if (edge(3)) out.events.push("through");    // Y = pase al hueco
  if (edge(2)) out.events.push("cross");      // X = centro/alto
  if (edge(1)) out.events.push("shootDown");  // B pulsado
  if (prev[1] && !b[1]) out.events.push("shootUp"); // B soltado
  if (edge(4)) out.events.push("switch");     // LB = cambio de jugador
  // Stick derecho (Fase 4): golpe seco = cambiar al compañero en esa
  // dirección. Con REARME por posición: hay que volver al centro (<0,35)
  // antes del siguiente flick; si no, un stick con drift cambiaría de
  // jugador solo cada pocos frames. El cooldown evita el doble-flick.
  const rx = gp.axes[2] || 0, ry = gp.axes[3] || 0;
  const rmag = Math.hypot(rx, ry);
  if (rmag < 0.35) st.rsArmed = true;
  if (rmag > 0.7 && st.rsArmed !== false && st.frame - (st.rsT || -999) > 24) {
    st.rsArmed = false;
    st.rsT = st.frame;
    out.events.push("switch");
    out.switchMove = { x: rx / rmag, z: ry / rmag };
  }
  st.padPrev = b;
  return out;
}

/** Construye la entrada del frame: movimiento + estados + eventos de flanco. */
export function pollFrameInput(st, opts = {}) {
  st.frame++;
  const k = st.keys;
  const q = st.queue;
  st.queue = [];
  const scheme = opts.scheme || "ijkl";
  const bindings = opts.bindings || resolveBindings(scheme, opts.overrides);

  const pad = pollGamepad(st, opts.padDeadzone, opts.padSensitivity);
  const usePadMove = pad.move && st.frame - st.padSeen < 30;

  const sprintKeys = asArray(bindings.sprint);
  const shootKey = bindings.shoot;
  const actionKey = bindings.action;
  const passKey = bindings.pass;
  const tackleKey = bindings.tackle;
  const switchKey = bindings.switch;
  const lobKey = bindings.lob;
  const throughKey = bindings.through;

  const keyActive = q.length > 0 || Object.keys(k).some((c) => k[c]);
  if (keyActive) st.keySeen = st.frame;
  // Origen del input: el más reciente entre teclado y mando.
  const source = st.padSeen >= st.keySeen && pad.active ? "pad"
    : st.keySeen >= 0 ? "keys" : (st.padSeen >= 0 ? "pad" : "keys");

  const shootHeldKey = shootKey ? !!k[shootKey] : false;
  const fin = {
    move: usePadMove ? pad.move : computeMove(k, bindings),
    switchMove: pad.switchMove || null, // stick derecho: dirección del cambio
    downCodes: k,
    bindings,
    scheme,
    source,
    sprint: sprintKeys.some((c) => k[c]) || pad.sprint,
    sprintPressed:
      sprintKeys.some((c) => q.includes(c)) || pad.sprintPressed,
    dribbleMod: pad.dribbleMod,
    helper: pad.helper,
    shootHeld: shootHeldKey || pad.shootHeld,
    // La tecla de acción (A en IJKL) o la de tiro (Espacio en WASD) mantenida.
    actionHeld: (actionKey ? !!k[actionKey] : false) || shootHeldKey,
    // Pase mantenido (E en WASD): carga la potencia, se ejecuta al soltar.
    passHeld: passKey ? !!k[passKey] : false,
    shootCodes: shootKey ? [shootKey] : [],
    events: [...pad.events],
  };
  for (const code of q) {
    const up = code.startsWith("^");
    const base = up ? code.slice(1) : code;
    if (actionKey && base === actionKey) {
      // Esquema clásico: tecla contextual (pase/tiro/entrada/saque).
      fin.events.push(up ? "actionUp" : "actionDown");
    } else if (base === passKey) {
      // En WASD el pase sale al SOLTAR (permite cargar potencia).
      fin.events.push(up ? "passUp" : "pass");
    } else if (base === shootKey) {
      fin.events.push(up ? "shootUp" : "shootDown");
    } else if (base === tackleKey) {
      if (!up) fin.events.push("tackleDown");
    } else if (base === switchKey) {
      if (!up) fin.events.push("switch");
    } else if (base === lobKey) {
      if (!up) fin.events.push("lob");
    } else if (base === throughKey) {
      if (!up) fin.events.push("through");
    }
  }
  return fin;
}

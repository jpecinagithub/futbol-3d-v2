// Motor de audio procedural (Web Audio, sin samples externos).
// FASE A: ambiente de grada (ruido filtrado en bucle) + pitido.
// La Fase E lo completará (cánticos, narración, efectos de golpeo, etc.).

let ctx = null;
let crowdNodes = null;

// Fase 7: buses de volumen por categoría (0..1). Todo efecto conecta a su
// bus; la UI (pausa → Sonido) los ajusta y se persisten (f3d.vol*).
const vols = { crowd: 0.8, fx: 0.9, ui: 0.9 };
let buses = null;

function ensureCtx() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

/** Niveles 0..1 por categoría (los llama el partido al arrancar y al cambiar). */
export function setVolumes(v) {
  if (v.crowd !== undefined) vols.crowd = Math.max(0, Math.min(1, v.crowd));
  if (v.fx !== undefined) vols.fx = Math.max(0, Math.min(1, v.fx));
  if (v.ui !== undefined) vols.ui = Math.max(0, Math.min(1, v.ui));
  if (ctx && buses) {
    buses.crowd.gain.value = vols.crowd;
    buses.fx.gain.value = vols.fx;
    buses.ui.gain.value = vols.ui;
  }
}
export function getVolumes() {
  return { ...vols };
}

function ensureBuses(ac) {
  if (buses) return buses;
  const mk = () => {
    const g = ac.createGain();
    g.connect(ac.destination);
    return g;
  };
  buses = { crowd: mk(), fx: mk(), ui: mk() };
  buses.crowd.gain.value = vols.crowd;
  buses.fx.gain.value = vols.fx;
  buses.ui.gain.value = vols.ui;
  return buses;
}

/** Ruido blanco en bucle pasado por un pasa-bajos: murmullo de grada. */
export function startCrowd(volume = 0.05) {
  const ac = ensureCtx();
  if (crowdNodes) return;
  const len = ac.sampleRate * 2;
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    // Ruido "marrón" aproximado: más grave, más parecido a una multitud
    const white = Math.random() * 2 - 1;
    last = (last + 0.02 * white) / 1.02;
    d[i] = last * 3.2;
  }
  const src = ac.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  const filter = ac.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 900;
  const gain = ac.createGain();
  gain.gain.value = volume;
  src.connect(filter).connect(gain).connect(ensureBuses(ac).crowd);
  src.start();
  crowdNodes = { src, gain, filter };
}

export function stopCrowd() {
  if (!crowdNodes) return;
  try { crowdNodes.src.stop(); } catch { /* ya parado */ }
  crowdNodes = null;
}

/** Sube/baja el murmullo (p. ej. en los goles). */
export function setCrowdLevel(volume, rampSec = 0.4) {
  if (!crowdNodes) return;
  crowdNodes.gain.gain.linearRampToValueAtTime(volume, ctx.currentTime + rampSec);
}

/** Pitido de árbitro: onda cuadrada ~2.2 kHz con envolvente. */
export function whistle(duration = 0.9) {
  const ac = ensureCtx();
  const osc = ac.createOscillator();
  osc.type = "square";
  osc.frequency.value = 2200;
  const gain = ac.createGain();
  const t = ac.currentTime;
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(0.12, t + 0.02);
  gain.gain.setValueAtTime(0.12, t + duration - 0.08);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  osc.connect(gain).connect(ensureBuses(ac).fx);
  osc.start(t);
  osc.stop(t + duration + 0.05);
}

/**
 * Pitido por tipo de evento (Fase E + Fase 7).
 * 'falta' | 'tarjeta' | 'offside': corto; 'gol': medio; 'penalti': largo;
 * 'final': tres pitidos (largo-corto-largo); 'inicio': dos cortos (saque
 * inicial); 'siga': un corto (reanudación).
 */
export function playWhistle(tipo = "falta") {
  try {
    const ac = ensureCtx();
    const t0 = ac.currentTime;
    const blast = (start, dur) => {
      const osc = ac.createOscillator();
      osc.type = "square";
      // Ligero trémolo de silbato real: 2200 Hz con vibrato rápido
      osc.frequency.setValueAtTime(2150, start);
      const lfo = ac.createOscillator();
      lfo.frequency.value = 28;
      const lfoG = ac.createGain();
      lfoG.gain.value = 90;
      lfo.connect(lfoG).connect(osc.frequency);
      const g = ac.createGain();
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(0.14, start + 0.02);
      g.gain.setValueAtTime(0.14, start + Math.max(0.02, dur - 0.07));
      g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
      osc.connect(g).connect(ensureBuses(ac).fx);
      osc.start(start); lfo.start(start);
      osc.stop(start + dur + 0.05); lfo.stop(start + dur + 0.05);
    };
    if (tipo === "final") {
      blast(t0, 0.5); blast(t0 + 0.65, 0.5); blast(t0 + 1.3, 1.1);
    } else if (tipo === "penalti") blast(t0, 0.9);
    else if (tipo === "gol") blast(t0, 0.55);
    else if (tipo === "inicio") { blast(t0, 0.3); blast(t0 + 0.4, 0.3); }
    else if (tipo === "siga") blast(t0, 0.35);
    else blast(t0, 0.6); // falta, tarjeta, offside
  } catch { /* sin audio disponible */ }
}

/** Celebración de gol: subidón de la grada durante unos segundos. */
export function goalCheer() {
  setCrowdLevel(0.22, 0.15);
  setTimeout(() => setCrowdLevel(0.05, 2.5), 2600);
}

/** Golpeo al balón (Fase B): grave corto + chasquido. power 0..1. */
export function thump(power = 0.5) {
  playKick(power); // Fase E: thump pasa a ser alias del golpeo procedural
}

// GANCHO FASE E: aquí irán cánticos por equipo, efecto de golpeo al balón,
// silbidos del público, narración sintética, etc.

// ===========================================================================
// FASE E — efectos procedurales (todo Web Audio, sin samples externos)
// ===========================================================================

let sharedNoise = null;
/** Buffer de ruido blanco compartido (2 s en bucle). */
function getNoise(ac) {
  if (sharedNoise) return sharedNoise;
  const len = ac.sampleRate * 2;
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  sharedNoise = buf;
  return buf;
}

/**
 * Golpeo al balón: grave corto con chasquido filtrado.
 * El tono y el volumen crecen con la potencia (0..1).
 */
export function playKick(potencia = 0.5) {
  try {
    const ac = ensureCtx();
    const t = ac.currentTime;
    const p = Math.min(1, Math.max(0, potencia));
    // Cuerpo grave: sine que cae de 150+40p a 55 Hz
    const osc = ac.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(130 + 60 * p, t);
    osc.frequency.exponentialRampToValueAtTime(52, t + 0.09);
    const g = ac.createGain();
    const v = 0.07 + p * 0.16;
    g.gain.setValueAtTime(v, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
    osc.connect(g).connect(ensureBuses(ac).fx);
    osc.start(t); osc.stop(t + 0.15);
    // Chasquido: ruido corto pasa-altos (contacto bota-balón)
    const n = ac.createBufferSource();
    n.buffer = getNoise(ac);
    const hp = ac.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 1800 + p * 1200;
    const ng = ac.createGain();
    ng.gain.setValueAtTime(0.05 + p * 0.08, t);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    n.connect(hp).connect(ng).connect(ensureBuses(ac).fx);
    n.start(t, Math.random() * 1.5);
    n.stop(t + 0.07);
  } catch { /* sin audio disponible */ }
}

/** Bote del balón: golpe sordo; volumen según la velocidad de impacto. */
export function playBounce(impacto = 2) {
  try {
    const ac = ensureCtx();
    const t = ac.currentTime;
    const v = Math.min(0.16, 0.03 + impacto * 0.02);
    const osc = ac.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(120, t);
    osc.frequency.exponentialRampToValueAtTime(65, t + 0.07);
    const g = ac.createGain();
    g.gain.setValueAtTime(v, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    osc.connect(g).connect(ensureBuses(ac).fx);
    osc.start(t); osc.stop(t + 0.11);
  } catch { /* sin audio disponible */ }
}

/** Swish de la red al marcar: ruido filtrado con caída rápida. */
export function playNet() {
  try {
    const ac = ensureCtx();
    const t = ac.currentTime;
    const n = ac.createBufferSource();
    n.buffer = getNoise(ac);
    n.loop = true;
    const bp = ac.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.setValueAtTime(2600, t);
    bp.frequency.exponentialRampToValueAtTime(900, t + 0.28);
    bp.Q.value = 0.8;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.22, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    n.connect(bp).connect(g).connect(ensureBuses(ac).fx);
    n.start(t); n.stop(t + 0.35);
  } catch { /* sin audio disponible */ }
}

/**
 * "¡Goool!" de la grada (sin voces reales): subida de ruido + coro de tonos
 * desafinados con envolvente ascendente, como un rugido colectivo.
 * Fase 7: la afición LOCAL ruge a pleno pulmón; con gol visitante suena más
 * contenido con una capa de abucheos. La remontada alarga la celebración.
 */
export function playCrowdGoal(side = "home", comeback = false) {
  try {
    const ac = ensureCtx();
    const t = ac.currentTime;
    const home = side !== "away";
    const peak = home ? 0.34 : 0.2;
    const dur = comeback ? 4.6 : 3.4;
    // 1) Rugido: ruido pasa-bajos que sube
    const n = ac.createBufferSource();
    n.buffer = getNoise(ac);
    n.loop = true;
    const lp = ac.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(700, t);
    lp.frequency.exponentialRampToValueAtTime(2400, t + 0.6);
    lp.frequency.exponentialRampToValueAtTime(900, t + dur);
    const ng = ac.createGain();
    ng.gain.setValueAtTime(0.06, t);
    ng.gain.exponentialRampToValueAtTime(peak, t + 0.35);
    ng.gain.setValueAtTime(peak, t + dur - 1.8);
    ng.gain.exponentialRampToValueAtTime(0.05, t + dur);
    n.connect(lp).connect(ng).connect(ensureBuses(ac).crowd);
    n.start(t); n.stop(t + dur + 0.2);
    // 2) Coro sintético: 5 voces (triángulo) con pitch ascendente y vibrato
    for (let i = 0; i < 5; i++) {
      const o = ac.createOscillator();
      o.type = "triangle";
      const f0 = 190 + i * 38 + Math.random() * 12;
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(f0 * 1.5, t + 0.5);
      o.frequency.exponentialRampToValueAtTime(f0 * 1.12, t + 2.8);
      const vib = ac.createOscillator();
      vib.frequency.value = 5.5 + Math.random() * 1.5;
      const vg = ac.createGain();
      vg.gain.value = 7;
      vib.connect(vg).connect(o.frequency);
      const bp = ac.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 900;
      bp.Q.value = 1.2;
      const g = ac.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(home ? 0.055 : 0.035, t + 0.4);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 3.0);
      o.connect(bp).connect(g).connect(ensureBuses(ac).crowd);
      o.start(t); vib.start(t);
      o.stop(t + 3.2); vib.stop(t + 3.2);
    }
    // 3) Gol visitante: la grada local protesta un poco.
    if (!home) crowdBoo();
    // Y el murmullo base acompaña el subidón
    setCrowdLevel(0.1, 0.3);
    setTimeout(() => setCrowdLevel(0.05, 2.5), 3000);
  } catch { /* sin audio disponible */ }
}

/** "¡Uuuy!" colectivo en las ocasiones: subida contenida 0.8 s. */
export function crowdOoh() {
  try {
    const ac = ensureCtx();
    const t = ac.currentTime;
    const n = ac.createBufferSource();
    n.buffer = getNoise(ac);
    n.loop = true;
    const bp = ac.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.setValueAtTime(500, t);
    bp.frequency.exponentialRampToValueAtTime(1400, t + 0.45);
    bp.Q.value = 2.2;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16, t + 0.35);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.85);
    n.connect(bp).connect(g).connect(ensureBuses(ac).crowd);
    n.start(t); n.stop(t + 1.0);
  } catch { /* sin audio disponible */ }
}

/** Abucheos tenues en las faltas duras: ruido grave 1.2 s a bajo volumen. */
export function crowdBoo() {
  try {
    const ac = ensureCtx();
    const t = ac.currentTime;
    const n = ac.createBufferSource();
    n.buffer = getNoise(ac);
    n.loop = true;
    const lp = ac.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 420;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.1, t + 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.3);
    n.connect(lp).connect(g).connect(ensureBuses(ac).crowd);
    n.start(t); n.stop(t + 1.5);
  } catch { /* sin audio disponible */ }
}

/**
 * Nivel de emoción del ambiente (0..1): abre el filtro del murmullo y lo
 * sube ligeramente (ocasiones, tramo final). Se suma al nivel base.
 */
export function setCrowdExcitement(x) {
  if (!crowdNodes) return;
  const e = Math.min(1, Math.max(0, x));
  try {
    setCrowdLevel(0.05 + e * 0.05, 1.2);
    if (crowdNodes.filter) {
      crowdNodes.filter.frequency.linearRampToValueAtTime(
        900 + e * 900, ctx.currentTime + 1.2
      );
    }
  } catch { /* sin audio disponible */ }
}

// ===========================================================================
// FASE 7 — sonidos diferenciados por evento (todo procedural)
// ===========================================================================

/** Pase: toque seco y corto, más suave que el tiro. */
export function playPass(power = 0.4) {
  try {
    const ac = ensureCtx();
    const t = ac.currentTime;
    const p = Math.min(1, Math.max(0, power));
    const osc = ac.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(170 + 40 * p, t);
    osc.frequency.exponentialRampToValueAtTime(80, t + 0.06);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.05 + p * 0.07, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
    osc.connect(g).connect(ensureBuses(ac).fx);
    osc.start(t); osc.stop(t + 0.1);
  } catch { /* sin audio disponible */ }
}

/** Entrada: golpe sordo grave + roce (barrida). */
export function playTackle() {
  try {
    const ac = ensureCtx();
    const t = ac.currentTime;
    const osc = ac.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(95, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.14, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    osc.connect(g).connect(ensureBuses(ac).fx);
    osc.start(t); osc.stop(t + 0.18);
    const n = ac.createBufferSource();
    n.buffer = getNoise(ac);
    const lp = ac.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 700;
    const ng = ac.createGain();
    ng.gain.setValueAtTime(0.06, t);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    n.connect(lp).connect(ng).connect(ensureBuses(ac).fx);
    n.start(t, Math.random() * 1.5);
    n.stop(t + 0.14);
  } catch { /* sin audio disponible */ }
}

/** Madera (poste/travesaño): ping metálico con armónicos. intensity 0..1. */
export function playWoodwork(intensity = 0.7) {
  try {
    const ac = ensureCtx();
    const t = ac.currentTime;
    const v = 0.08 + Math.min(1, intensity) * 0.14;
    for (const [f, a] of [[820, 1], [1640, 0.45], [2460, 0.2]]) {
      const o = ac.createOscillator();
      o.type = "sine";
      o.frequency.value = f;
      const g = ac.createGain();
      g.gain.setValueAtTime(v * a, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      o.connect(g).connect(ensureBuses(ac).fx);
      o.start(t); o.stop(t + 0.55);
    }
    try { crowdOoh(); } catch { /* nada */ }
  } catch { /* sin audio disponible */ }
}

/** Clic de interfaz: blip corto y discreto. */
export function uiClick() {
  try {
    const ac = ensureCtx();
    const t = ac.currentTime;
    const o = ac.createOscillator();
    o.type = "triangle";
    o.frequency.setValueAtTime(660, t);
    o.frequency.exponentialRampToValueAtTime(880, t + 0.05);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.06, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
    o.connect(g).connect(ensureBuses(ac).ui);
    o.start(t); o.stop(t + 0.09);
  } catch { /* sin audio disponible */ }
}

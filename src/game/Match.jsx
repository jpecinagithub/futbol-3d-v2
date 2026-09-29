// Escena del partido: monta el motor determinista y lo avanza con paso fijo.
// - Entrada unificada (teclado + gamepad) vía src/game/input.js.
// - Las acciones (pases, tiros, entradas, cambios) se procesan una vez por
//   frame en processActions; el movimiento continuo va a stepEngine.
// - Sincroniza el reloj con el store (limitado, sin re-renders por frame).
// - Detecta goles y fin del partido.
// React solo PINTA: las posiciones se escriben directamente en los meshes.

import { useMemo, useRef, useEffect } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useMatchStore, GFX_DPR } from "../stores/useMatchStore";
import { createMatch, stepEngine, kickoff, getControlled, substitutePlayer } from "./engine";
import { createInputState, attachKeyboard, detachKeyboard, pollFrameInput, gameKeyCodes } from "./input";
import { processActions } from "./actions";import { FIXED_DT, FIELD, BALL } from "./constants";
import { predictPassTarget } from "./passing";
import { predictSwitchTarget } from "./playerSwitch";
import { Field } from "../stadium/Field";
import { Stadium } from "../stadium/Stadium";
import { Ball } from "../ball/Ball";
import { PlayerModel } from "../players/PlayerModel";
import { BroadcastCamera } from "../camera/BroadcastCamera";
import { ReplayPlayer } from "../replay/ReplayPlayer";
import { TrainingScript, TrainingMarker } from "../training/Training";
import { recordTick } from "../replay/goalReplay";
import { startCrowd, stopCrowd, playWhistle, playCrowdGoal, playNet, setCrowdExcitement, setVolumes, crowdOoh } from "../audio/audioEngine";

// ---------- Bucle de simulación ----------
function Simulation({ engine }) {
  const inputRef = useRef(null);
  if (!inputRef.current) inputRef.current = createInputState();
  const acc = useRef(0);
  const lastClockSync = useRef(0);
  const heatRef = useRef(0.22); // emoción del ambiente (Fase E)
  const fpsRef = useRef({ acc: 0, n: 0, ema: 0 }); // Fase 11: medidor de FPS
  const phase = useMatchStore((s) => s.phase);

  useEffect(() => {
    // Fase 3: captura las teclas de AMBOS esquemas (+ flechas/espacio) para
    // que cambiar de esquema o reasignar en mitad del partido funcione sin
    // reenganchar el teclado (solo afecta a preventDefault).
    const st0 = useMatchStore.getState();
    const codes = [
      ...gameKeyCodes("ijkl", st0.bindings),
      ...gameKeyCodes("wasd", st0.bindings),
    ];
    attachKeyboard(inputRef.current, codes);
    // Fase 2: permite vaciar la entrada al salir de la repetición para que
    // ninguna tecla del salto dispare una acción en el saque de centro.
    engine.flushInput = () => {
      inputRef.current.keys = {};
      inputRef.current.queue.length = 0;
    };
    return () => detachKeyboard(inputRef.current);
  }, [engine]);

  useFrame((_, rawDt) => {
    // Fase 11: FPS (media exponencial por segundo, en window.__fps).
    const f = fpsRef.current;
    if (rawDt > 0) {
      const inst = 1 / rawDt;
      f.ema = f.ema === 0 ? inst : f.ema + (inst - f.ema) * 0.05;
      f.acc += rawDt;
      if (f.acc >= 1) {
        f.acc = 0;
        try {
          window.__fps = +f.ema.toFixed(1);
        } catch { /* nada */ }
      }
    }
    const st = useMatchStore.getState();
    if (st.phase !== "playing") return;

    const dt = Math.min(rawDt, 0.1);
    // Entrada del frame (movimiento + eventos de flanco) y acciones de juego
    const fin = pollFrameInput(inputRef.current, {
      scheme: st.controlScheme,
      overrides: st.bindings,
      padDeadzone: st.padDeadzone,
      padSensitivity: st.padSensitivity,
    });
    // Fase 1: la entrada del usuario queda expuesta para las vistas previas
    // (receptor del pase, siguiente jugador) y el aviso de stamina.
    engine.userMove = fin.move;
    engine.userSprint = fin.sprint;
    engine.inputSource = fin.source;
    // Fase 5: la dificultad vive y se puede cambiar en mitad del partido.
    engine.difficulty = st.difficulty || "normal";
    processActions(engine, fin, dt);

    acc.current += dt;
    const simInput = {
      x: fin.move.x,
      z: fin.move.z,
      sprint: fin.sprint,
      dribble: fin.dribbleMod,
    };
    let tick = 0;
    while (acc.current >= FIXED_DT && tick < 5) {
      stepEngine(engine, FIXED_DT, simInput, {
        onGoal: (side, scorer) => {
          // Meta para los ángulos de la repetición (portería atacada)
          const atk = side === "home" ? 1 : -1;
          engine.replayMeta = {
            gx: atk * FIELD.halfLength,
            atk,
            x: engine.ball.x,
            z: engine.ball.z,
          };
          // Limpieza del hook de test provokeGoal (restaura al portero)
          if (engine._gkAway) {
            engine._gkAway.sentOff = false;
            engine._gkAway = null;
          }
          // Fase 7: la grada distingue local/visitante y ruge más en remontadas.
          const before = st.score[side] - st.score[side === "home" ? "away" : "home"];
          st.goal(side, scorer);
          playCrowdGoal(side, before < 0);
          playNet();
          playWhistle("gol");
          heatRef.current = 1; // el ambiente se viene arriba con el gol
        },
      });
      acc.current -= FIXED_DT;
      tick++;
    }
    // Fase E: la repetición graba estados a 30 Hz durante el juego
    recordTick(engine);

    // Fase 7: ocasión en el área (entrada con peligro) — la grada contiene
    // la respiración. Con cooldown para no spamear.
    if (engine.crowdCd > 0) engine.crowdCd -= dt;
    else {
      const b = engine.ball;
      const ballSp = Math.hypot(b.vx, b.vz);
      if (Math.abs(b.x) > 30 && Math.abs(b.z) < 20 && (ballSp > 6 || b.y > 1)) {
        engine.crowdCd = 10;
        engine.crowdOohT = engine.time;
        try { crowdOoh(); } catch { /* sin audio */ }
        heatRef.current = Math.min(1, heatRef.current + 0.25);
      }
    }

    // Reloj -> store (como mucho ~2 veces por segundo real)
    if (engine.matchTime - lastClockSync.current > 1.2) {
      lastClockSync.current = engine.matchTime;
      useMatchStore.setState({ clock: engine.matchTime });
      // Fase 7: re-sincroniza volúmenes (por si cambiaron en la pausa).
      try {
        const s = useMatchStore.getState();
        setVolumes({ crowd: s.volCrowd, fx: s.volFx, ui: s.volUi });
      } catch { /* sin audio */ }
      useMatchStore.setState({ clock: engine.matchTime });
      // Fase E: sincroniza la posesión acumulada por el motor
      useMatchStore.getState().setPossession(
        engine.possTime.home,
        engine.possTime.away
      );
      // Fase E: el ambiente respira con el partido — pico en los goles,
      // decae despacio y crece en el tramo final.
      const baseHeat = 0.22 + 0.3 * (engine.matchTime / (st.durationMin * 60));
      heatRef.current = Math.max(baseHeat, heatRef.current - 0.12);
      setCrowdExcitement(heatRef.current);
    }

    // Fin del partido
    if (engine.matchTime >= st.durationMin * 60) {
      useMatchStore.setState({ clock: st.durationMin * 60 });
      engine.frozen = true;
      playWhistle("final");
      st.finish();
    }
  });

  // La tecla Esc pausa / reanuda
  useEffect(() => {
    const onKey = (e) => {
      if (e.code !== "Escape") return;
      const s = useMatchStore.getState();
      if (s.phase === "playing") s.pause();
      else if (s.phase === "paused") s.resume();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Tras el gol: 1.6 s de celebración y entra la repetición automática
  // (al terminar la repetición se hace kickoff y se vuelve a "playing").
  useEffect(() => {
    if (phase !== "goal") return;
    const t = setTimeout(() => {
      useMatchStore.getState().startReplay();
    }, 1600);
    return () => clearTimeout(t);
  }, [phase, engine]);

  return null;
}

// ---------- Anillo + tarjeta del jugador controlado ----------
// El anillo es un mesh 3D sobre el jugador; el nombre vive en una tarjeta
// fija abajo a la derecha (nombre + dorsal, stamina y potencia de tiro).
function ControlledMarker({ engine }) {
  const group = useRef();
  useFrame(() => {
    if (!group.current) return;
    const c = getControlled(engine);
    group.current.position.set(c.x, 0.03, c.z);
  });
  return (
    <group ref={group}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.5, 0.68, 32]} />
        <meshBasicMaterial color="#ffd21f" transparent opacity={0.9} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

function ControlledLabel({ engine }) {
  const elRef = useRef(null);
  const lastUid = useRef(null);
  const lastName = useRef(null);

  useEffect(() => {
    const el = document.createElement("div");
    el.className = "player-label";
    el.innerHTML =
      '<span class="pl-name"></span>' +
      '<div class="pl-bars">' +
      '<div class="pl-stam"><div class="pl-stam-fill"></div></div>' +
      '<div class="pl-power"><div class="pl-power-fill"></div></div>' +
      "</div>" +
      '<div class="pl-warn"></div>';
    document.getElementById("label-layer")?.appendChild(el);
    elRef.current = {
      el,
      name: el.querySelector(".pl-name"),
      stam: el.querySelector(".pl-stam-fill"),
      power: el.querySelector(".pl-power-fill"),
      powerWrap: el.querySelector(".pl-power"),
      warn: el.querySelector(".pl-warn"),
    };
    return () => el.remove();
  }, []);

  useFrame(() => {
    const r = elRef.current;
    if (!r) return;
    const c = getControlled(engine);
    if (!c) return;
    if (c.uid !== lastUid.current || c.data.name !== lastName.current) {
      lastUid.current = c.uid;
      lastName.current = c.data.name;
      r.name.textContent = `${c.data.name} · ${c.data.number}`;
    }
    // Barra de stamina (roja si está fundido)
    const st = Math.max(0, Math.min(100, c.stamina));
    r.stam.style.width = `${st.toFixed(0)}%`;
    r.stam.style.background = st < 25 ? "#ff5d5d" : "#9fe870";
    // Fase 1: aviso contextual de stamina (solo cuando importa: fundido).
    const gassed = st < 25;
    r.el.classList.toggle("gassed", gassed);
    if (gassed) {
      r.warn.textContent = engine.userSprint
        ? "¡FUNDIDO! suelta S para recuperar"
        : "¡FUNDIDO! rinde menos";
    }
    // Barra de potencia del tiro mientras se carga (A)
    if (engine.charge && engine.charge.uid === c.uid) {
      r.powerWrap.style.display = "block";
      r.power.style.width = `${(engine.charge.t * 100).toFixed(0)}%`;
      r.power.style.background = "linear-gradient(90deg, #ffd21f, #ff7a1f)";
    } else if (engine.passCharge && engine.passCharge.uid === c.uid) {
      // Fase 4: carga del pase (WASD): misma barra, en cian.
      r.powerWrap.style.display = "block";
      r.power.style.width = `${(engine.passCharge.t / 0.8 * 100).toFixed(0)}%`;
      r.power.style.background = "linear-gradient(90deg, #35e0ff, #2f6df6)";
    } else {
      r.powerWrap.style.display = "none";
    }
  });
  return null;
}

import { GoalCelebration, GoalConfetti } from "./matchFx";

// ---------- Etiquetas de debug de la IA (Fase C / útil en Fase F) ----------
// Se activa con window.__AI_DEBUG = true (apagado por defecto). Pinta sobre
// cada jugador de la IA su estado actual y la fase colectiva de su equipo.
function AiDebugLabels({ engine }) {
  const { camera, size } = useThree();
  const els = useRef(new Map());
  const v = useMemo(() => new THREE.Vector3(), []);

  // Cleanup al desmontar: retirar los nodos creados.
  useEffect(() => {
    const map = els.current;
    return () => {
      for (const rec of map.values()) rec.remove();
      map.clear();
    };
  }, []);

  useFrame(() => {
    const on = typeof window !== "undefined" && !!window.__AI_DEBUG;
    for (const p of engine.players) {
      if (p.controlled) continue;
      let rec = els.current.get(p.uid);
      if (!on) {
        if (rec) rec.style.display = "none";
        continue;
      }
      if (!rec) {
        rec = document.createElement("div");
        rec.className = "ai-debug-label";
        document.getElementById("label-layer")?.appendChild(rec);
        els.current.set(p.uid, rec);
      }
      const dbg = engine.aiDebug?.[p.uid];
      rec.textContent = dbg ? `${dbg.ph.split("_")[0]}·${dbg.s.replace("GK_", "")}` : "?";
      v.set(p.x, 2.3, p.z).project(camera);
      if (v.z > 1 || v.z < -1) {
        rec.style.display = "none";
        continue;
      }
      rec.style.display = "block";
      const x = (v.x * 0.5 + 0.5) * size.width;
      const y = (-v.y * 0.5 + 0.5) * size.height;
      rec.style.transform = `translate(-50%,-100%) translate(${x.toFixed(1)}px,${y.toFixed(1)}px)`;
    }
  });
  return null;
}

// ---------- Indicador visual del pase: línea en el suelo (0.4 s) ----------
function PassIndicator({ engine }) {
  const g = useRef();
  useFrame(() => {
    if (!g.current) return;
    const fx = engine.passFx;
    if (!fx || fx.t <= 0) {
      g.current.visible = false;
      return;
    }
    g.current.visible = true;
    g.current.position.set(fx.x + fx.dx * fx.len / 2, 0.05, fx.z + fx.dz * fx.len / 2);
    g.current.rotation.y = Math.atan2(fx.dx, fx.dz);
    g.current.scale.set(1, 1, Math.max(0.5, fx.len));
    const mat = g.current.children[0].material;
    mat.opacity = Math.max(0, Math.min(0.85, (fx.t / 0.4) * 0.9));
  });
  return (
    <group ref={g} visible={false}>
      <mesh>
        <boxGeometry args={[0.4, 0.03, 1]} />
        <meshBasicMaterial color="#8fd4ff" transparent opacity={0.8} depthWrite={false} />
      </mesh>
    </group>
  );
}

// ---------- Vista previa del receptor del pase (Fase 1) ----------
// Anillo cian sobre el compañero que recibiría el pase raso si se pulsa A
// ahora (misma selección que el pase real). Solo con balón en los pies.
function PassTargetPreview({ engine }) {
  const g = useRef();
  useFrame(() => {
    if (!g.current) return;
    const c = getControlled(engine);
    let t = null;
    if (c && c.hasBall && !c.sentOff) {
      try {
        t = predictPassTarget(engine, c, engine.userMove || { x: 0, z: 0 });
      } catch { t = null; }
      if (t === c) t = null;
    }
    g.current.visible = !!t;
    if (t) g.current.position.set(t.x, 0.04, t.z);
  });
  return (
    <group ref={g} visible={false}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.55, 0.72, 28]} />
        <meshBasicMaterial color="#35e0ff" transparent opacity={0.9} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
    </group>
  );
}

// ---------- Vista previa del siguiente jugador seleccionable (Fase 1) ----------
// Anillo blanco tenue sobre quien tomaría Q ahora. Solo sin balón (en
// defensa), para no tapar la vista previa del receptor en ataque.
function SwitchPreview({ engine }) {
  const g = useRef();
  useFrame(() => {
    if (!g.current) return;
    const c = getControlled(engine);
    let t = null;
    if (c && !c.hasBall && !c.sentOff) {
      try {
        t = predictSwitchTarget(engine, engine.userMove || { x: 0, z: 0 }, false);
      } catch { t = null; }
      if (!t || t === c) t = null;
    }
    g.current.visible = !!t;
    if (t) g.current.position.set(t.x, 0.035, t.z);
  });
  return (
    <group ref={g} visible={false}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.5, 0.62, 28]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.45} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
    </group>
  );
}
// ---------- Indicador de alcance defensivo (Fase 4) ----------
// Anillo blanco sobre el controlado cuando defiende: marca el alcance de la
// entrada (~1,15 m). Solo sin balón para no tapar otras vistas previas.
function TackleRange({ engine }) {
  const g = useRef();
  useFrame(() => {
    if (!g.current) return;
    const c = getControlled(engine);
    const show = !!(c && !c.hasBall && !c.sentOff);
    g.current.visible = show;
    if (show) g.current.position.set(c.x, 0.03, c.z);
  });
  return (
    <group ref={g} visible={false}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1.05, 1.18, 40]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.28} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
    </group>
  );
}

// ---------- Puntería en balón parado (Fase D) ----------
// Flecha amarilla desde el balón en la dirección de la puntería del
// usuario (IJKL) mientras prepara un saque (DEAD_BALL_READY).
function DeadBallAim({ engine }) {
  const g = useRef();
  useFrame(() => {
    if (!g.current) return;
    const db = engine.deadBall;
    const show = db && db.state === "DEAD_BALL_READY" && db.userKicking;
    g.current.visible = !!show;
    if (!show) return;
    const b = engine.ball;
    g.current.position.set(b.x + db.aim.x * 3.2, 0.06, b.z + db.aim.z * 3.2);
    g.current.rotation.y = Math.atan2(db.aim.x, db.aim.z);
  });
  return (
    <group ref={g} visible={false}>
      <mesh>
        <boxGeometry args={[0.5, 0.04, 6]} />
        <meshBasicMaterial color="#ffd166" transparent opacity={0.75} depthWrite={false} />
      </mesh>
      <mesh position={[0, 0, 3.5]} rotation={[Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.55, 1.3, 12]} />
        <meshBasicMaterial color="#ffd166" transparent opacity={0.85} depthWrite={false} />
      </mesh>
    </group>
  );
}

// ---------- Limitador de FPS (Fase 9): con frameloop="never" avanza la
// escena a intervalos fijos (30 Hz) en vez de a cada refresco.
function FrameLimiter({ fps }) {
  const advance = useThree((s) => s.advance);
  useEffect(() => {
    const id = setInterval(() => {
      try {
        advance(performance.now());
      } catch { /* nada */ }
    }, 1000 / fps);
    return () => clearInterval(id);
  }, [advance, fps]);
  return null;
}

// ---------- Escena completa ----------
export function Match() {
  const homeTeam = useMatchStore((s) => s.getHomeTeam());
  const awayTeam = useMatchStore((s) => s.getAwayTeam());
  const phase = useMatchStore((s) => s.phase);
  const gfxQuality = useMatchStore((s) => s.gfxQuality);
  const shadowsOn = useMatchStore((s) => s.shadowsOn);
  const fpsLimit = useMatchStore((s) => s.fpsLimit);

  const engine = useMemo(
    () => createMatch(homeTeam, awayTeam),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [homeTeam.id, awayTeam.id]
  );

  useEffect(() => {
    // Fase 7: volúmenes por categoría desde los ajustes.
    const st0 = useMatchStore.getState();
    try {
      setVolumes({ crowd: st0.volCrowd, fx: st0.volFx, ui: st0.volUi });
    } catch { /* sin audio */ }
    startCrowd(0.05);
    return () => stopCrowd();
  }, []);

  // Saque inicial al montar el partido (Fase F: antes solo se hacía kickoff
  // tras la repetición; el partido empezaba sin colocación de saque).
  // Fase 5/6: dificultad y modo entrenamiento desde el store.
  useEffect(() => {
    const st = useMatchStore.getState();
    engine.difficulty = st.difficulty || "normal";
    engine.training = !!st.drillId;
    kickoff(engine);
    // Fase 7: pitido de inicio (no en drills de balón parado, que ya pitan).
    if (!st.drillId) {
      try { playWhistle("inicio"); } catch { /* sin audio */ }
    }
  }, [engine]);

  // Gancho para tests automatizados (headless): expone el motor y el paso.
  useEffect(() => {
    window.__store = useMatchStore; // el store tal cual lo usa la app (misma instancia)
    window.__match = {
      engine, stepEngine, processActions, getControlled,
      get stats() { return engine.stats; }, // Fase D: faltas, tarjetas, córners, fueras de juego, penaltis
      get phase() { return useMatchStore.getState().phase; },
      /** Provoca un gol determinista (solo tests): coloca el balón a 4 m de
       *  la portería rival a 26 m/s y aparta al portero (lo restaura al marcar). */
      provokeGoal: (side = "home") => {
        const atk = side === "home" ? 1 : -1;
        const gx = atk * FIELD.halfLength;
        const gk = engine.players.find(
          (p) => p.role === "GK" && p.side !== side && !p.sentOff
        );
        if (gk) {
          gk.sentOff = true; // temporal: lo ignora el contacto y la IA
          engine._gkAway = gk;
        }
        const b = engine.ball;
        b.x = gx - atk * 4.2;
        b.z = 0;
        b.y = BALL.radius;
        b.vx = atk * 26;
        b.vy = 0;
        b.vz = 0;
        b.spin = 0;
        b.touchCooldown = 0;
        const att =
          engine.players.find((p) => p.side === side && p.role === "ST" && !p.sentOff) ||
          engine.players.find((p) => p.side === side && !p.sentOff);
        b.lastTouch = att ? att.uid : null;
        return true;
      },
      /** Sustitución desde la UI de pausa (también usable en tests). */
      doSubstitution: (side, titularUid, subDataId) => {
        const r = substitutePlayer(engine, side, titularUid, subDataId);
        if (r.ok) {
          const st = useMatchStore.getState();
          st.bumpSub(side);
          st.setNotice(`Cambio: sale ${r.out}, entra ${r.in}`);
          // Fase 9: acta para el historial de eventos.
          engine.subLog = engine.subLog || [];
          engine.subLog.push({
            minute: Math.floor(engine.matchTime / 60) + 1,
            side, out: r.out, in: r.in,
          });
        }
        return r;
      },
    };
    return () => { delete window.__match; delete window.__store; };
  }, [engine]);

  return (
    <Canvas
      // Fase 9: la calidad se aplica remontando SOLO el Canvas (el motor
      // mutable sobrevive: no se pierde ni el partido ni la repetición).
      key={`gfx-${gfxQuality}-${shadowsOn ? "sh" : "nosh"}-${fpsLimit}`}
      shadows={shadowsOn}
      dpr={GFX_DPR[gfxQuality] || GFX_DPR.alta}
      frameloop={fpsLimit === 30 ? "never" : "always"}
      camera={{ fov: 50, near: 0.5, far: 600, position: [0, 31, 47] }}
      gl={{ antialias: true }}
      onCreated={({ scene, camera }) => { window.__scene3d = scene; window.__camera3d = camera; }}
    >
      <color attach="background" args={["#0a0f1e"]} />
      <fog attach="fog" args={["#0a0f1e", 160, 420]} />
      <Stadium />
      <Field />
      <Ball engine={engine} />
      {engine.players.map((p) => (
        <PlayerModel key={p.uid} player={p} teamId={p.side === "home" ? homeTeam.id : awayTeam.id} />
      ))}
      <ControlledMarker engine={engine} />
      <ControlledLabel engine={engine} />
      <AiDebugLabels engine={engine} />
      <PassIndicator engine={engine} />
      <PassTargetPreview engine={engine} />
      <SwitchPreview engine={engine} />
      <TackleRange engine={engine} />
      <DeadBallAim engine={engine} />
      <GoalCelebration engine={engine} />
      <GoalConfetti engine={engine} />
      {phase === "replay" && <ReplayPlayer engine={engine} />}
      {fpsLimit === 30 && <FrameLimiter fps={30} />}
      <TrainingScript engine={engine} />
      <TrainingMarker />
      <BroadcastCamera engine={engine} />
      <Simulation engine={engine} />
    </Canvas>
  );
}

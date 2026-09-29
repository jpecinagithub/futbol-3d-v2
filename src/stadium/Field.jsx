// Campo reglamentario 105x68 m (eje X = largo, porterías en x=±52.5).
// Césped con franjas de siega, líneas, áreas, porterías con REDES procedurales,
// banderines de córner, banquillos, túnel y vallas con marcas ficticias.

import { useMemo } from "react";
import * as THREE from "three";
import { FIELD, GOAL } from "../game/constants";

const LINE_W = 0.12;
const LINE_Y = 0.02;

// ---------- Césped con franjas de siega (canvas) ----------
function grassTexture() {
  const c = document.createElement("canvas");
  c.width = 1024; c.height = 512;
  const g = c.getContext("2d");
  const stripeM = 5;                       // franja cada 5 m
  const planeX = 124;                      // ancho del plano de césped
  const stripePx = (stripeM / planeX) * c.width;
  for (let x = 0, i = 0; x < c.width; x += stripePx, i++) {
    g.fillStyle = i % 2 ? "#3f9140" : "#489a48";
    g.fillRect(x, 0, stripePx + 1, c.height);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

// ---------- Línea recta como caja fina ----------
function Strip({ x1, z1, x2, z2, w = LINE_W, color = "#f5f5f5" }) {
  const dx = x2 - x1, dz = z2 - z1;
  const len = Math.hypot(dx, dz);
  return (
    <mesh position={[(x1 + x2) / 2, LINE_Y, (z1 + z2) / 2]} rotation={[0, -Math.atan2(dz, dx), 0]}>
      <boxGeometry args={[len, 0.02, w]} />
      <meshStandardMaterial color={color} roughness={0.9} />
    </mesh>
  );
}

// ---------- Arco (círculo central, semicírculo de penalti, córners) ----------
function Arc({ cx, cz, r, a0, a1, w = LINE_W }) {
  const segs = 40;
  const strips = [];
  for (let i = 0; i < segs; i++) {
    const t0 = a0 + ((a1 - a0) * i) / segs;
    const t1 = a0 + ((a1 - a0) * (i + 1)) / segs;
    const x1 = cx + Math.cos(t0) * r, z1 = cz + Math.sin(t0) * r;
    const x2 = cx + Math.cos(t1) * r, z2 = cz + Math.sin(t1) * r;
    strips.push(<Strip key={i} x1={x1} z1={z1} x2={x2} z2={z2} w={w} />);
  }
  return <group>{strips}</group>;
}

// ---------- Red procedural con segmentos de línea ----------
function Net({ gx }) {
  const geometry = useMemo(() => {
    const dir = Math.sign(gx);
    const x0 = gx, x1 = gx + dir * GOAL.depth;
    const hw = GOAL.halfWidth, h = GOAL.height;
    const step = 0.3;
    // Generamos la malla como rejilla en cada cara: fondo, laterales y techo.
    const faces = [];
    // Fondo (plano x=x1)
    faces.push({ u: [-hw, hw, step], v: [0, h, step], fixed: [x1, null, null], axis: "x" });
    // Laterales (z=±hw)
    for (const s of [-1, 1])
      faces.push({ u: [0, GOAL.depth, step], v: [0, h, step], fixed: [null, null, s * hw], axis: "z", origin: x0 });
    // Techo (y=h): de x0 a x1, con pendiente hasta h*0.85 al fondo
    faces.push({ u: [0, GOAL.depth, step], v: [-hw, hw, step], fixed: [null, h, null], axis: "y", origin: x0 });

    const positions = [];
    const line = (a, b) => positions.push(...a, ...b);
    for (const f of faces) {
      const [u0, u1, us] = f.u, [v0, v1, vs] = f.v;
      const P = (u, v) => {
        if (f.axis === "x") return [f.fixed[0], v, u];
        if (f.axis === "z") return [f.origin + dir * u, v, f.fixed[2]];
        return [f.origin + dir * u, f.fixed[1] - (u / GOAL.depth) * h * 0.15, v];
      };
      for (let u = u0; u <= u1 + 1e-6; u += us)
        line(P(u, v0), P(u, v1));
      for (let v = v0; v <= v1 + 1e-6; v += vs)
        line(P(u0, v), P(u1, v));
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    return geo;
  }, [gx]);

  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial color="#e8e8e8" transparent opacity={0.55} />
    </lineSegments>
  );
}

function Goal({ gx }) {
  const dir = Math.sign(gx);
  const hw = GOAL.halfWidth, h = GOAL.height;
  const postMat = <meshStandardMaterial color="#f8f8f8" roughness={0.4} />;
  return (
    <group>
      {/* Postes */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[gx, h / 2, s * hw]} castShadow>
          <cylinderGeometry args={[GOAL.postRadius, GOAL.postRadius, h, 10]} />
          {postMat}
        </mesh>
      ))}
      {/* Travesaño */}
      <mesh position={[gx, h, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[GOAL.postRadius, GOAL.postRadius, hw * 2 + 0.12, 10]} />
        {postMat}
      </mesh>
      {/* Estructura trasera de la red */}
      {[-1, 1].map((s) => (
        <mesh key={"b" + s} position={[gx + dir * GOAL.depth, h * 0.42, s * hw]}>
          <cylinderGeometry args={[0.03, 0.03, h * 0.85, 6]} />
          <meshStandardMaterial color="#cccccc" />
        </mesh>
      ))}
      <Net gx={gx} />
    </group>
  );
}

// ---------- Marcas ficticias para vallas ----------
const BRANDS = [
  { name: "NOVA Cola", bg: "#c0272d", fg: "#ffffff" },
  { name: "DeporteX", bg: "#0d5aa7", fg: "#ffffff" },
  { name: "GOLAZO TV", bg: "#111111", fg: "#ffd21f" },
  { name: "PodoSport", bg: "#0a7a3d", fg: "#ffffff" },
  { name: "VuelaAir", bg: "#5b2a86", fg: "#ffffff" },
  { name: "Banco Prisma", bg: "#e8e8e8", fg: "#0d2a7a" },
];

function brandTexture(b) {
  const c = document.createElement("canvas");
  c.width = 512; c.height = 96;
  const g = c.getContext("2d");
  g.fillStyle = b.bg;
  g.fillRect(0, 0, 512, 96);
  g.fillStyle = b.fg;
  g.font = "900 52px Arial";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(b.name, 256, 52);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function AdBoards() {
  const texs = useMemo(() => BRANDS.map(brandTexture), []);
  const boards = [];
  let bi = 0;
  const put = (x, z, rotY) => {
    const t = texs[bi++ % texs.length];
    boards.push(
      <mesh key={bi} position={[x, 0.5, z]} rotation={[0, rotY, 0]}>
        <boxGeometry args={[7.6, 1, 0.25]} />
        <meshStandardMaterial map={t} emissive="#ffffff" emissiveMap={t} emissiveIntensity={0.35} />
      </mesh>
    );
  };
  // Laterales largos
  for (let x = -49; x <= 49; x += 8) {
    put(x, FIELD.halfWidth + 4.5, 0);
    put(x, -FIELD.halfWidth - 4.5, Math.PI);
  }
  // Fondos
  for (let z = -36; z <= 36; z += 8) {
    put(FIELD.halfLength + 5.5, z, -Math.PI / 2);
    put(-FIELD.halfLength - 5.5, z, Math.PI / 2);
  }
  return <group>{boards}</group>;
}

function CornerFlags() {
  return (
    <group>
      {[
        [FIELD.halfLength, FIELD.halfWidth], [FIELD.halfLength, -FIELD.halfWidth],
        [-FIELD.halfLength, FIELD.halfWidth], [-FIELD.halfLength, -FIELD.halfWidth],
      ].map(([x, z], i) => (
        <group key={i} position={[x, 0, z]}>
          <mesh position={[0, 0.75, 0]}>
            <cylinderGeometry args={[0.02, 0.02, 1.5, 6]} />
            <meshStandardMaterial color="#ffd21f" />
          </mesh>
          <mesh position={[0.14, 1.32, 0]}>
            <boxGeometry args={[0.28, 0.2, 0.02]} />
            <meshStandardMaterial color="#c0272d" side={THREE.DoubleSide} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

export function Field() {
  const grass = useMemo(() => grassTexture(), []);
  const { halfLength: HL, halfWidth: HW } = FIELD;
  const spots = useMemo(() => {
    const arr = [];
    for (const s of [-1, 1]) {
      const gx = s * HL;
      // Área grande: 16.5 m de profundidad x 40.32 de ancho
      const bx = gx - s * FIELD.boxDepth;
      arr.push(
        <group key={"box" + s}>
          <Strip x1={bx} z1={-FIELD.boxWidth / 2} x2={bx} z2={FIELD.boxWidth / 2} />
          <Strip x1={bx} z1={-FIELD.boxWidth / 2} x2={gx} z2={-FIELD.boxWidth / 2} />
          <Strip x1={bx} z1={FIELD.boxWidth / 2} x2={gx} z2={FIELD.boxWidth / 2} />
        </group>
      );
      // Área pequeña: 5.5 x 18.32
      const sx = gx - s * FIELD.sixYardDepth;
      arr.push(
        <group key={"six" + s}>
          <Strip x1={sx} z1={-FIELD.sixYardWidth / 2} x2={sx} z2={FIELD.sixYardWidth / 2} />
          <Strip x1={sx} z1={-FIELD.sixYardWidth / 2} x2={gx} z2={-FIELD.sixYardWidth / 2} />
          <Strip x1={sx} z1={FIELD.sixYardWidth / 2} x2={gx} z2={FIELD.sixYardWidth / 2} />
        </group>
      );
      // Punto de penalti (11 m)
      const px = gx - s * FIELD.penaltySpot;
      arr.push(
        <mesh key={"spot" + s} position={[px, LINE_Y, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.18, 12]} />
          <meshStandardMaterial color="#f5f5f5" />
        </mesh>
      );
      // Semicírculo del área (radio 9.15, solo fuera del área grande)
      const edge = gx - s * FIELD.boxDepth;
      const cosLim = (edge - px) / FIELD.penaltyArcR; // = ∓0.6
      const lim = Math.acos(Math.max(-1, Math.min(1, cosLim)));
      // Ángulos medidos desde +X hacia +Z; el arco mira al campo (lejos de la portería)
      const a0 = s > 0 ? Math.PI - lim : -lim;
      const a1 = s > 0 ? Math.PI + lim : lim;
      arr.push(<Arc key={"arc" + s} cx={px} cz={0} r={FIELD.penaltyArcR} a0={a0} a1={a1} />);
    }
    return arr;
  }, [HL]);

  return (
    <group>
      {/* Base exterior */}
      <mesh position={[0, -0.06, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[150, 110]} />
        <meshStandardMaterial color="#2c6e2e" roughness={1} />
      </mesh>
      {/* Césped con franjas */}
      <mesh position={[0, 0, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[124, 84]} />
        <meshStandardMaterial map={grass} roughness={0.95} />
      </mesh>

      {/* Líneas de banda y fondo */}
      <Strip x1={-HL} z1={-HW} x2={HL} z2={-HW} />
      <Strip x1={-HL} z1={HW} x2={HL} z2={HW} />
      <Strip x1={-HL} z1={-HW} x2={-HL} z2={HW} />
      <Strip x1={HL} z1={-HW} x2={HL} z2={HW} />
      {/* Línea media */}
      <Strip x1={0} z1={-HW} x2={0} z2={HW} />
      {/* Círculo central + punto */}
      <Arc cx={0} cz={0} r={FIELD.centerCircleR} a0={0} a1={Math.PI * 2} />
      <mesh position={[0, LINE_Y, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.18, 12]} />
        <meshStandardMaterial color="#f5f5f5" />
      </mesh>
      {/* Esquinas (arcos de 1 m) */}
      <Arc cx={HL} cz={HW} r={1} a0={Math.PI / 2} a1={Math.PI} />
      <Arc cx={HL} cz={-HW} r={1} a0={Math.PI} a1={Math.PI * 1.5} />
      <Arc cx={-HL} cz={HW} r={1} a0={0} a1={Math.PI / 2} />
      <Arc cx={-HL} cz={-HW} r={1} a0={-Math.PI / 2} a1={0} />

      {spots}

      <Goal gx={HL} />
      <Goal gx={-HL} />
      <CornerFlags />
      <AdBoards />

      {/* Banquillos (lateral -Z) */}
      {[-1, 1].map((s) => (
        <group key={"bench" + s} position={[s * 14, 0, -HW - 8]}>
          <mesh position={[0, 0.5, 0]} castShadow>
            <boxGeometry args={[8, 1, 1.6]} />
            <meshStandardMaterial color="#1c2c6e" roughness={0.7} />
          </mesh>
          <mesh position={[0, 2.2, 0]}>
            <boxGeometry args={[8.6, 0.15, 2.4]} />
            <meshStandardMaterial color="#dfe4ee" roughness={0.6} />
          </mesh>
          {[-3.5, -1.2, 1.2, 3.5].map((x) => (
            <mesh key={x} position={[x, 1.3, -0.9]}>
              <cylinderGeometry args={[0.06, 0.06, 2.2, 6]} />
              <meshStandardMaterial color="#9aa2b5" />
            </mesh>
          ))}
        </group>
      ))}
      {/* Túnel de vestuarios (fondo -Z, decorativo) */}
      <group position={[0, 0, -HW - 14]}>
        <mesh position={[0, 2, 0]} castShadow>
          <boxGeometry args={[10, 4, 6]} />
          <meshStandardMaterial color="#232838" roughness={0.9} />
        </mesh>
        <mesh position={[0, 1.5, 3.05]}>
          <boxGeometry args={[4, 3, 0.2]} />
          <meshStandardMaterial color="#0a0c12" />
        </mesh>
      </group>
    </group>
  );
}

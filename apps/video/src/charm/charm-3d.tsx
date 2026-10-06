import { ThreeCanvas } from "@remotion/three";
import { useEffect, useMemo, useState } from "react";
import { cancelRender, continueRender, delayRender } from "remotion";
import * as THREE from "three";
import backUrl from "opencharm-stl/view_back.stl";
import frontUrl from "opencharm-stl/view_front.stl";
import keyUrl from "opencharm-stl/view_key.stl";
import { type Colour, type GlyphState, drawGlyphs } from "./engine";

type Parts = {
  front: THREE.BufferGeometry;
  back: THREE.BufferGeometry;
  key: THREE.BufferGeometry;
};

// The camera: 26° vertical field of view, as on the prototype page, at a distance where the
// charm's 41.7 mm window is 400 px tall on a 1080 px frame.
export const CAMERA_FOV = 26;
const WINDOW_MM = 41.7;
const WINDOW_PX = 400;
export const PX_PER_MM = WINDOW_PX / WINDOW_MM;
export const CAMERA_DISTANCE =
  1080 / PX_PER_MM / (2 * Math.tan(((CAMERA_FOV / 2) * Math.PI) / 180));

// Binary STL with normals smoothed across edges under 35°, like hardware/prototype.
function parseStl(buffer: ArrayBuffer): THREE.BufferGeometry {
  const view = new DataView(buffer);
  const n = view.getUint32(80, true);
  const pos = new Float32Array(n * 9);
  let o = 84;
  for (let i = 0; i < n; i++) {
    o += 12;
    for (let j = 0; j < 9; j++) {
      pos[i * 9 + j] = view.getFloat32(o, true);
      o += 4;
    }
    o += 2;
  }
  const fn = new Float32Array(n * 3);
  const ids = new Map<string, number>();
  const vid = new Int32Array(n * 3);
  const groups: number[][] = [];
  for (let t = 0; t < n; t++) {
    const a = t * 9;
    const ux = pos[a + 3]! - pos[a]!,
      uy = pos[a + 4]! - pos[a + 1]!,
      uz = pos[a + 5]! - pos[a + 2]!;
    const vx = pos[a + 6]! - pos[a]!,
      vy = pos[a + 7]! - pos[a + 1]!,
      vz = pos[a + 8]! - pos[a + 2]!;
    const nx = uy * vz - uz * vy,
      ny = uz * vx - ux * vz,
      nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    fn[t * 3] = nx / l;
    fn[t * 3 + 1] = ny / l;
    fn[t * 3 + 2] = nz / l;
    for (let c = 0; c < 3; c++) {
      const p = a + c * 3;
      const k = `${Math.round(pos[p]! * 1000)},${Math.round(pos[p + 1]! * 1000)},${Math.round(pos[p + 2]! * 1000)}`;
      let id = ids.get(k);
      if (id == null) {
        id = groups.length;
        ids.set(k, id);
        groups.push([]);
      }
      vid[t * 3 + c] = id;
      groups[id]!.push(t);
    }
  }
  const nor = new Float32Array(n * 9);
  const cos = Math.cos((35 * Math.PI) / 180);
  for (let t = 0; t < n; t++)
    for (let c = 0; c < 3; c++) {
      let sx = 0,
        sy = 0,
        sz = 0;
      for (const f of groups[vid[t * 3 + c]!]!) {
        const d =
          fn[f * 3]! * fn[t * 3]! +
          fn[f * 3 + 1]! * fn[t * 3 + 1]! +
          fn[f * 3 + 2]! * fn[t * 3 + 2]!;
        if (d > cos) {
          sx += fn[f * 3]!;
          sy += fn[f * 3 + 1]!;
          sz += fn[f * 3 + 2]!;
        }
      }
      const l = Math.hypot(sx, sy, sz) || 1;
      const b = t * 9 + c * 3;
      nor[b] = sx / l;
      nor[b + 1] = sy / l;
      nor[b + 2] = sz / l;
    }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  return geo;
}

function useParts(): Parts | null {
  const [parts, setParts] = useState<Parts | null>(null);
  const [handle] = useState(() => delayRender("Loading the STL files"));
  useEffect(() => {
    const load = (url: string) =>
      fetch(url)
        .then((r) => r.arrayBuffer())
        .then(parseStl);
    Promise.all([load(frontUrl), load(backUrl), load(keyUrl)])
      .then(([front, back, key]) => {
        setParts({ front, back, key });
        continueRender(handle);
      })
      .catch((error: unknown) => cancelRender(error));
  }, [handle]);
  return parts;
}

function roundedSquare(size: number, r: number): THREE.Shape {
  const h = size / 2;
  const s = new THREE.Shape();
  s.moveTo(-h + r, -h);
  s.lineTo(h - r, -h);
  s.absarc(h - r, -h + r, r, -Math.PI / 2, 0, false);
  s.lineTo(h, h - r);
  s.absarc(h - r, h - r, r, 0, Math.PI / 2, false);
  s.lineTo(-h + r, h);
  s.absarc(-h + r, h - r, r, Math.PI / 2, Math.PI, false);
  s.lineTo(-h, -h + r);
  s.absarc(-h + r, -h + r, r, Math.PI, Math.PI * 1.5, false);
  return s;
}

function screenGeometry(): THREE.ShapeGeometry {
  const geo = new THREE.ShapeGeometry(roundedSquare(38.99, 2.2), 12);
  geo.computeBoundingBox();
  const box = geo.boundingBox!;
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  const p = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++)
    uv.setXY(
      i,
      (p.getX(i) - box.min.x) / (box.max.x - box.min.x),
      (p.getY(i) - box.min.y) / (box.max.y - box.min.y)
    );
  return geo;
}

export type CharmPose = {
  rotY: number;
  rotX: number;
  y: number;
  scale: number;
  colour: Colour;
  glyphs: GlyphState;
};

function Charm({ parts, pose }: { parts: Parts; pose: CharmPose }) {
  const canvas = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 1024;
    return c;
  }, []);
  const texture = useMemo(() => {
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  }, [canvas]);
  const glass = useMemo(
    () =>
      new THREE.ExtrudeGeometry(roundedSquare(43.3, 4.7), {
        depth: 1.4,
        bevelEnabled: false,
        curveSegments: 16,
      }),
    []
  );
  const screen = useMemo(screenGeometry, []);

  const ctx = canvas.getContext("2d");
  if (ctx) drawGlyphs(ctx, 1024, 1024, pose.glyphs);
  texture.needsUpdate = true;

  return (
    <group
      position={[0, pose.y, 0]}
      rotation={[pose.rotX, pose.rotY, 0]}
      scale={pose.scale}
    >
      <group scale={[1, 1, -1]}>
        <mesh geometry={glass} position={[0, 0, 0.6]}>
          <meshStandardMaterial
            color="#050506"
            roughness={0.15}
            metalness={0.1}
          />
        </mesh>
        <mesh geometry={screen} position={[0, 0, 0.58]}>
          <meshBasicMaterial
            map={texture}
            side={THREE.DoubleSide}
            toneMapped={false}
          />
        </mesh>
        <mesh geometry={parts.front}>
          <meshStandardMaterial
            color={pose.colour.c}
            roughness={0.62}
            metalness={0}
          />
        </mesh>
        <mesh geometry={parts.back}>
          <meshStandardMaterial
            color={pose.colour.c}
            roughness={0.62}
            metalness={0}
          />
        </mesh>
        <mesh
          geometry={parts.key}
          position={[24.2, 0, 9.6]}
          rotation={[0, -Math.PI / 2, 0]}
        >
          <meshStandardMaterial
            color={pose.colour.key}
            roughness={0.5}
            metalness={0}
          />
        </mesh>
      </group>
    </group>
  );
}

// The printed charm on the paper, lit like the prototype page.
export function Charm3D({ pose }: { pose: CharmPose }) {
  const parts = useParts();
  return (
    <ThreeCanvas
      width={1920}
      height={1080}
      linear={false}
      camera={{
        fov: CAMERA_FOV,
        position: [0, 0, CAMERA_DISTANCE],
        near: 1,
        far: 3000,
      }}
      style={{ position: "absolute", inset: 0 }}
    >
      <hemisphereLight args={[0xffffff, 0xc8c8c4, 1.9]} />
      <directionalLight position={[-120, 160, 200]} intensity={3.1} />
      <directionalLight position={[160, 60, -160]} intensity={1.4} />
      <directionalLight position={[100, -60, 120]} intensity={0.7} />
      {parts && <Charm parts={parts} pose={pose} />}
    </ThreeCanvas>
  );
}

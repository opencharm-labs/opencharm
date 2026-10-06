import { ThreeCanvas } from "@remotion/three";
import { useEffect, useMemo, useState } from "react";
import { cancelRender, continueRender, delayRender } from "remotion";
import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { toCreasedNormals } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import backUrl from "opencharm-stl/view_back.stl";
import frontUrl from "opencharm-stl/view_front.stl";
import keyUrl from "opencharm-stl/view_key.stl";
import { type Colour, type GlyphState, drawGlyphs } from "./engine";

export type CharmPose = {
  rotY: number;
  rotX: number;
  y: number;
  scale: number;
  colour: Colour;
  glyphs: GlyphState;
};

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

// Parsed once per tab and shared: every mount of the scene uses the same geometry.
let loading: Promise<Parts> | null = null;

// Binary STL, normals smoothed across edges under 35°, like hardware/prototype.
async function loadStl(url: string): Promise<THREE.BufferGeometry> {
  const response = await fetch(url);
  if (!response.ok)
    throw new Error(`Can't load ${url}: HTTP ${response.status}`);
  const geometry = new STLLoader().parse(await response.arrayBuffer());
  return toCreasedNormals(geometry, (35 * Math.PI) / 180);
}

function loadParts(): Promise<Parts> {
  loading ??= Promise.all([
    loadStl(frontUrl),
    loadStl(backUrl),
    loadStl(keyUrl),
  ]).then(([front, back, key]) => ({ front, back, key }));
  return loading;
}

function useParts(): Parts | null {
  const [parts, setParts] = useState<Parts | null>(null);
  const [handle] = useState(() => delayRender("Loading the STL files"));
  useEffect(() => {
    loadParts()
      .then((loaded) => {
        setParts(loaded);
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
        <mesh geometry={parts.front} dispose={null}>
          <meshStandardMaterial
            color={pose.colour.c}
            roughness={0.62}
            metalness={0}
          />
        </mesh>
        <mesh geometry={parts.back} dispose={null}>
          <meshStandardMaterial
            color={pose.colour.c}
            roughness={0.62}
            metalness={0}
          />
        </mesh>
        <mesh
          dispose={null}
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

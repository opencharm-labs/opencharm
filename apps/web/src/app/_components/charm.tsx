"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

import { cn } from "@/lib/utils";

import {
  loadCharmFace,
  type CharmDevice,
  type CharmFaceInstance,
  type DeviceOptions,
  type FaceSetOptions,
} from "../_lib/charm-face";
import { useLanding } from "./landing-state";

type CharmProps = {
  options?: Omit<DeviceOptions, "colour" | "shape">;
  show?: FaceSetOptions;
  className?: string;
};

type ScreenProps = {
  face: string;
  idle?: boolean;
  className?: string;
};

// Charms are built when they come within this distance of the screen: a page of some fifty faces
// would otherwise spend its first seconds drawing ones nobody sees yet.
const NEAR = "400px 0px";

function useNearScreen(ref: RefObject<HTMLElement | null>): boolean {
  const [near, setNear] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || near) return;
    const watch = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        setNear(true);
        watch.disconnect();
      },
      { rootMargin: NEAR }
    );
    watch.observe(el);
    return () => watch.disconnect();
  }, [ref, near]);
  return near;
}

// Mounts a charm from the real face engine once, when it nears the screen; the page-wide shell colour follows the swatches.
// Options are read on mount only; interactive charms drive the returned device.
function useCharmDevice(
  options: Omit<DeviceOptions, "colour" | "shape"> = {},
  show?: FaceSetOptions
) {
  const host = useRef<HTMLDivElement>(null);
  const initial = useRef({ options, show });
  const { colour } = useLanding();
  const colourRef = useRef(colour);
  const [device, setDevice] = useState<CharmDevice | null>(null);
  const near = useNearScreen(host);

  useEffect(() => {
    if (!near) return;
    let dead = false;
    let made: CharmDevice | undefined;
    void loadCharmFace().then((api) => {
      const el = host.current;
      if (dead || !el) return;
      const { options: o, show: s } = initial.current;
      made = api.device(el, { ...o, colour: colourRef.current, shape: "icon" });
      if (s) made.face.set({ instant: true, ...s });
      setDevice(made);
    });
    return () => {
      dead = true;
      made?.el.remove();
    };
  }, [near]);

  useEffect(() => {
    colourRef.current = colour;
    device?.setColour(colour);
  }, [colour, device]);

  return { host, device };
}

// The host keeps the charm's square, so nothing moves when it's built.
function Charm({ options, show, className }: CharmProps) {
  const { host } = useCharmDevice(options, show);
  return (
    <div className={className}>
      <div ref={host} className="aspect-square" />
    </div>
  );
}

// A bare screen (no shell), masked to the app-icon squircle: the face library and the states list.
function CharmScreen({ face, idle, className }: ScreenProps) {
  const host = useRef<HTMLDivElement>(null);
  const initial = useRef({ face, idle });
  const { colour } = useLanding();
  const colourRef = useRef(colour);
  const [screen, setScreen] = useState<CharmFaceInstance | null>(null);
  const near = useNearScreen(host);

  useEffect(() => {
    if (!near) return;
    let dead = false;
    let made: CharmFaceInstance | undefined;
    void loadCharmFace().then((api) => {
      const el = host.current;
      if (dead || !el) return;
      made = new api.Face(el, {
        ...initial.current,
        colour: colourRef.current,
      });
      made.el.classList.add("cf-sq");
      setScreen(made);
    });
    return () => {
      dead = true;
      made?.el.remove();
    };
  }, [near]);

  useEffect(() => {
    colourRef.current = colour;
    screen?.setColour(colour);
  }, [colour, screen]);

  return <div ref={host} className={cn("aspect-square", className)} />;
}

export { Charm, CharmScreen, useCharmDevice };

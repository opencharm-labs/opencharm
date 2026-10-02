"use client";

import { facesData } from "@opencharm-labs/design/faces";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import type { FaceSetOptions } from "../_lib/charm-face";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { useCharmDevice } from "./charm";
import { useLanding } from "./landing-state";

type Moment = {
  k: string;
  t: string;
  key?: string;
  v: FaceSetOptions & { face: string };
};

const STEP_MS = 4200;
const REDUCE = "(prefers-reduced-motion: reduce)";
const TYPE_MS = 34;
const TAP_MS = 1500;

// A day together, played on both bodies at once: the desktop charm by the Mac's notch and the charm on the desk.
const DAY: Moment[] = [
  {
    k: "08:11 · KEY HELD",
    t: "“Tell Sara I’ll be ten minutes late.”",
    key: "var(--color-sun)",
    v: { face: "listening", say: "listening…", dim: true },
  },
  {
    k: "08:11 · TURN STARTED",
    t: "The mouth turns into a text cursor while your agent works.",
    v: { face: "thinking" },
  },
  {
    k: "08:12 · APPROVAL",
    t: "A message is about to go out. Orange means it’s your call.",
    key: "var(--color-signal)",
    v: {
      face: "ask",
      say: "Send it to Sara?",
      hint: "HOLD · SEND    PRESS · NO",
    },
  },
  {
    k: "08:12 · TURN DONE",
    t: "One line, then back to the face.",
    v: { face: "joy", say: "Sent." },
  },
  {
    k: "11:40 · 3 ERRORS",
    t: "A long task keeps failing. You can tell from across the room.",
    v: { face: "strain", say: "Third try on the build…" },
  },
  {
    k: "12:05 · SKILL CREATED",
    t: "Your agent wrote itself a new skill, and it’s proud of it.",
    v: { face: "learned", say: "New trick: I can wrap up your day." },
  },
  {
    k: "23:10 · FACE-DOWN",
    t: "Face-down, it dozes. Your agent keeps running.",
    v: { face: "sleepy" },
  },
];

const TAP: Moment = {
  k: "NOW · TAP",
  t: "You tap its face. It giggles. It won’t get tired of it.",
  v: { face: "cute" },
};

function onMotionChange(notify: () => void): () => void {
  const query = window.matchMedia(REDUCE);
  query.addEventListener("change", notify);
  return () => query.removeEventListener("change", notify);
}

// The panel types its line in, like the app shows a reply; reduced motion shows it at once.
function useTyped(text: string, still: boolean): string {
  const [shown, setShown] = useState({ text, count: still ? text.length : 0 });
  if (shown.text !== text) setShown({ text, count: still ? text.length : 0 });
  useEffect(() => {
    if (still || shown.count >= text.length) return;
    const id = setTimeout(
      () => setShown((s) => ({ ...s, count: s.count + 2 })),
      TYPE_MS
    );
    return () => clearTimeout(id);
  }, [still, shown.count, text.length]);
  return text.slice(0, shown.count);
}

function faceOf(id: string) {
  return facesData.faces.find((f) => f.id === id);
}

function story(face: string, name: string): Moment[] {
  const pickUp: Moment = {
    k: "08:10 · PICK-UP",
    t: `You pick ${name} up. It’s pleased to see you, and says the one thing that matters.`,
    v: { face, say: "Morning! Standup moved to 10:30." },
  };
  return [pickUp, ...DAY];
}

// The hero: one companion, two bodies, playing the same moment like a live demo. It plays by itself
// (a pause button keeps it accessible), tapping the charm makes it react, and a new face or name
// picked in "Make it yours" starts the day again so the pick shows at once.
// The notch app's eyes, alive as in the app: at rest they glance and blink, thinking they wander up,
// listening they swell, asleep they sink and rise (animations in globals.css).
const EYE = cn(
  "grid place-items-center font-mono text-[length:calc(var(--pt)*26)]/none font-extrabold text-[color:var(--glyph,var(--color-glyph))] motion-safe:animate-mac-idle motion-safe:group-data-[face=listening]/app:animate-mac-swell motion-safe:group-data-[face=sleepy]/app:animate-mac-doze motion-safe:group-data-[face=thinking]/app:animate-mac-ponder"
);
const EYE_RIGHT = cn(
  "grid place-items-center font-mono text-[length:calc(var(--pt)*26)]/none font-extrabold text-[color:var(--glyph,var(--color-glyph))] motion-safe:animate-mac-idle-right motion-safe:group-data-[face=listening]/app:animate-mac-swell motion-safe:group-data-[face=sleepy]/app:animate-mac-doze motion-safe:group-data-[face=thinking]/app:animate-mac-ponder"
);
const PANEL_TEXT = cn(
  "font-mono font-semibold text-[color:var(--glyph,var(--color-on-night))]"
);
const CALLOUT = cn(
  "pointer-events-none absolute flex flex-col items-end gap-[3px] text-right font-mono text-2xs tracking-label text-mute max-sm:hidden"
);

function HeroStage() {
  const scene = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState(0);
  const [tapped, setTapped] = useState(false);
  // Reduced motion: the demo waits for the play button instead of moving on by itself.
  const reduce = useSyncExternalStore(
    onMotionChange,
    () => window.matchMedia(REDUCE).matches,
    () => false
  );
  // It plays by default, reduced motion included (that only stills the animations); pause stops it.
  const [paused, setPaused] = useState(false);
  // Only while the scene is on screen: off screen it waits, back on screen it carries on.
  const [onScreen, setOnScreen] = useState(true);
  const { colour, face: picked, shownName } = useLanding();
  const { host, device } = useCharmDevice({
    face: picked,
    cord: false,
    tappable: true,
  });
  const days = story(picked, shownName);

  const pick = `${picked}|${shownName}`;
  const [shownPick, setShownPick] = useState(pick);
  if (pick !== shownPick) {
    setShownPick(pick);
    setStep(0);
    setTapped(false);
  }

  const moment = tapped ? TAP : (days[step] ?? TAP);
  const face = faceOf(moment.v.face);

  useEffect(() => {
    if (!device) return;
    device.face.set(moment.v);
    device.setKey(moment.key ?? "");
  }, [device, moment]);

  useEffect(() => {
    const el = scene.current;
    if (!device || !el) return;
    device.face.followIn(el);
    const hit = device.hit;
    if (!hit) return;
    let boop: ReturnType<typeof setTimeout> | undefined;
    const onTap = () => {
      clearTimeout(boop);
      setTapped(true);
      boop = setTimeout(() => setTapped(false), TAP_MS);
    };
    hit.addEventListener("click", onTap);
    return () => {
      hit.removeEventListener("click", onTap);
      clearTimeout(boop);
    };
  }, [device]);

  useEffect(() => {
    const el = scene.current;
    if (!el) return;
    const watch = new IntersectionObserver(([entry]) =>
      setOnScreen(Boolean(entry?.isIntersecting))
    );
    watch.observe(el);
    return () => watch.disconnect();
  }, []);

  // A fresh timer for every moment, so the day always moves on while it's playing and seen.
  useEffect(() => {
    if (tapped || paused || !onScreen) return;
    const id = setTimeout(() => setStep((s) => (s + 1) % days.length), STEP_MS);
    return () => clearTimeout(id);
  }, [tapped, paused, onScreen, step, days.length]);

  const typed = useTyped(moment.v.say ?? "", reduce);
  const ask = moment.v.face === "ask";
  const open = Boolean(moment.v.say);
  return (
    // The figure is the container, so the scene can size itself from its width (an element can't
    // measure itself).
    <figure className="@container min-w-0" aria-labelledby="scene-cap">
      {/* A close-up of the top of a 14-inch MacBook Pro and the charm in front of it, both at the same
          scale (1 pt = 0.2 mm, so the 46.8 mm charm is 234 pt): big, and true to life. The crop shows
          760 pt of screen width (420 on phones), and --spacing is one point, so every spacing utility
          inside (w-307, top-18…) measures in points. */}
      <div
        className="relative h-452 [--crop:760] [--pt:calc(100cqw/var(--crop))] [--spacing:var(--pt)] max-sm:[--crop:420]"
        ref={scene}
      >
        {/* The close-up sits in a rounded frame, a window onto the Mac; the charm stands over its edge. */}
        <div
          className="relative h-330 overflow-hidden rounded-[28px] border-[1.5px] border-ink bg-card"
          aria-hidden="true"
        >
          <div className="relative">
            <div className="h-18 bg-black" />
            <div className="relative h-312 bg-card">
              <div className="flex h-32 items-center justify-between overflow-hidden border-b border-rule px-18 font-sans text-[length:calc(var(--pt)*13)] whitespace-nowrap text-ink-2">
                <span className="[word-spacing:calc(var(--pt)*14)] max-sm:hidden">
                  <b className="font-semibold text-ink">Finder</b> File Edit
                  View Go Window Help
                </span>
                <span className="ml-auto">
                  <span className="max-sm:hidden">Thu 2 Oct </span>9:41
                </span>
              </div>
            </div>
          </div>
          {/* The desktop charm: 307 pt across (two 64 pt ears around the 179 pt notch), 32 pt tall. */}
          <div
            className="group/app absolute top-18 left-[calc(50%-var(--pt)*153.5)] z-1 w-307"
            data-face={moment.v.face}
            data-open={open || undefined}
            data-ask={ask || undefined}
            style={{ "--glyph": colour.g } as React.CSSProperties}
            aria-hidden="true"
          >
            <div className="grid h-32 grid-cols-[64fr_179fr_64fr] rounded-b-[calc(var(--pt)*10)] bg-black group-data-open/app:rounded-none">
              <b className={EYE}>{face?.L ?? "o"}</b>
              <span className="grid place-items-center">
                <i className="size-7 rounded-full bg-[#1c1d22]" />
              </span>
              <b className={EYE_RIGHT}>{face?.R ?? "o"}</b>
            </div>
            {open ? (
              // Sized by what it says, like a notification: the line, and the hint on a question.
              <div className="flex flex-col gap-8 rounded-b-[calc(var(--pt)*26)] bg-black px-22 pt-12 pb-18 text-on-night group-data-ask/app:shadow-[inset_0_0_0_calc(var(--pt)*2)_var(--color-signal)]">
                <span className="font-mono text-[length:calc(var(--pt)*9)] tracking-[0.16em] text-on-night-2">
                  {shownName.toUpperCase()}
                </span>
                <p
                  className={cn(
                    PANEL_TEXT,
                    "text-[length:calc(var(--pt)*15)]/[1.4]",
                    moment.v.dim && "text-on-night-2"
                  )}
                >
                  {typed}
                  <span
                    className="ml-[2px] inline-block h-[1.05em] w-[0.55em] bg-current align-text-bottom motion-safe:animate-caret"
                    aria-hidden="true"
                  />
                </p>
                {moment.v.hint ? (
                  <p
                    className={cn(
                      PANEL_TEXT,
                      "mt-4 flex flex-wrap gap-x-18 gap-y-4 text-[length:calc(var(--pt)*9.5)]/[1.4] tracking-label group-data-ask/app:text-signal"
                    )}
                  >
                    {moment.v.hint.split(/\s{2,}/).map((part) => (
                      <span key={part}>{part}</span>
                    ))}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
        {/* The charm, 234 pt wide, standing on the desk in front of the screen's right side; on phones
            under the panel's left side, so it isn't cut off. */}
        <div className="absolute top-202 left-[calc(50%+var(--pt)*132)] z-2 w-234 max-sm:top-206 max-sm:left-[calc(50%-var(--pt)*196)]">
          <div ref={host} className="aspect-square" />
        </div>
        {/* In points, like the drawing: from the label to the app's left ear, open or closed. The labels
            move out on phones, where the crop is too narrow for them. */}
        <svg
          className="pointer-events-none absolute inset-0 z-2 size-full max-sm:hidden"
          viewBox="0 0 760 452"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <polyline
            className="fill-none stroke-ink"
            points="196,120 214,120 238,34"
            vectorEffect="non-scaling-stroke"
          />
          <circle
            className="fill-card stroke-ink"
            cx="238"
            cy="34"
            r="2"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        <span
          className={cn(
            CALLOUT,
            "top-[calc(var(--pt)*120-7px)] right-[calc(50%+var(--pt)*190)]"
          )}
          aria-hidden="true"
        >
          <b className="font-semibold text-ink">THE DESKTOP CHARM</b>
          <span>MACOS · WINDOWS</span>
        </span>
        <span
          className={cn(
            CALLOUT,
            // A leader from the label to the part it names.
            "top-372 right-[calc(50%-var(--pt)*132+44px)] after:absolute after:top-[7px] after:left-[calc(100%+8px)] after:w-[34px] after:border-t after:border-ink"
          )}
          aria-hidden="true"
        >
          <b className="font-semibold text-ink">THE CHARM</b>
          <span>46.8 MM · ON YOUR DESK</span>
        </span>
        <span
          className="absolute top-342 left-0 font-mono text-3xs tracking-label text-mute max-sm:hidden"
          aria-hidden="true"
        >
          DRAWN TO SCALE · A 14″ MACBOOK PRO AND THE CHARM · 1 PT = 0.2 MM
        </span>
      </div>
      <figcaption
        className="mx-auto mt-6.5 flex w-full max-w-[760px] flex-col gap-2.5 text-center"
        id="scene-cap"
      >
        <div className="flex items-center justify-between gap-3 font-mono text-[12px] font-semibold tracking-label">
          <span>{moment.k}</span>
          <Button
            type="button"
            variant="outline"
            size="chip"
            onClick={() => setPaused((p) => !p)}
            aria-pressed={paused}
          >
            {paused ? "▶ PLAY" : "❚❚ PAUSE"}
          </Button>
        </div>
        {/* Two lines kept, so the frame doesn't jump as the moments change. */}
        <p
          className="min-h-[2.9em] text-[17px]/[1.45]"
          aria-live={paused ? "polite" : "off"}
        >
          {moment.t}
        </p>
        {/* The progress, drawn as a graduated line: one mark per moment, filling while it plays. A
            finger gets a taller target than the thin line it taps. */}
        <ol
          className="grid auto-cols-[minmax(0,1fr)] grid-flow-col gap-1.5"
          aria-label="Moments of the day"
        >
          {days.map((s, i) => (
            <li
              key={s.k}
              className={cn(
                "relative h-6 pointer-coarse:h-11",
                "before:absolute before:bottom-[9px] before:left-0 before:h-0.5 before:w-full before:bg-rule",
                "after:absolute after:bottom-[9px] after:left-0 after:h-0.5 after:w-0 after:bg-ink",
                i < step && "after:w-full",
                i === step &&
                  !tapped &&
                  "after:animate-scene-fill after:[animation-play-state:var(--play,running)] motion-reduce:after:w-full motion-reduce:after:animate-none"
              )}
              style={
                i === step && !tapped
                  ? ({
                      "--step-ms": `${STEP_MS}ms`,
                      "--play": paused || !onScreen ? "paused" : "running",
                    } as React.CSSProperties)
                  : undefined
              }
            >
              <button
                type="button"
                className="absolute inset-0 w-full"
                aria-label={`Moment ${i + 1}: ${s.k}`}
                aria-current={i === step ? "step" : undefined}
                onClick={() => {
                  setTapped(false);
                  setStep(i);
                }}
              />
            </li>
          ))}
        </ol>
      </figcaption>
    </figure>
  );
}

export { HeroStage };

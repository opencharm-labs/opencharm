"use client";

import { facesData } from "@opencharm-labs/design/faces";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

import type { FaceSetOptions } from "../_lib/charm-face";
import { useLanding } from "./landing-state";
import { NotchPreview } from "./notch-preview";

type Body = "charm" | "desktop";

type Moment = FaceSetOptions & { face: string };

const BODIES: { b: Body; label: string }[] = [
  { b: "charm", label: "CHARM" },
  { b: "desktop", label: "DESKTOP" },
];

// Which body shows a section's moments: the board or the desktop charm.
function BodySwitch({
  body,
  onChange,
}: {
  body: Body;
  onChange: (body: Body) => void;
}) {
  return (
    <ToggleGroup
      type="single"
      variant="segment"
      value={body}
      // A click on the chosen half would clear it; one body is always shown.
      onValueChange={(v) => v && onChange(v as Body)}
      aria-label="Show it on"
      className="max-sm:flex max-sm:w-full"
    >
      {BODIES.map((b) => (
        <ToggleGroupItem key={b.b} value={b.b} className="max-sm:flex-1">
          {b.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

// The same moment on the desktop charm: the face's eyes on the notch, the line in the panel below.
function DesktopMoment({ v, className }: { v: Moment; className?: string }) {
  const { colour, shownName } = useLanding();
  const eyes = facesData.faces.find((f) => f.id === v.face) ?? {
    L: "o",
    R: "o",
  };
  return (
    <div className={className}>
      <NotchPreview
        size="mini"
        eyes={eyes}
        glyph={colour.g}
        kicker={shownName.toUpperCase()}
        text={v.say}
        hint={v.hint}
        ask={v.face === "ask"}
      />
    </div>
  );
}

export { BodySwitch, DesktopMoment, type Body };

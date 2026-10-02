"use client";

import { facesData } from "@opencharm-labs/design/faces";
import { useEffect } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";

import { Box } from "./box";
import { useCharmDevice } from "./charm";
import { NAME_MAX, useLanding } from "./landing-state";
import { NotchPreview } from "./notch-preview";
import { Kicker, Note } from "./text";

const FALLBACK_EYES = { L: "o", R: "o" };

// A picker is a radio group of cards under a label; one is always chosen.
const PICKER = cn("flex min-w-0 flex-col gap-2.5");
const CHOICES = cn("grid w-full items-stretch gap-2");

function ColourPicker() {
  const { colour, setColour } = useLanding();
  return (
    <div className={PICKER}>
      <Kicker id="mk-colour">COLOUR · SHELL AND GLYPHS</Kicker>
      <RadioGroup
        value={colour.id}
        onValueChange={(id) => {
          const picked = facesData.colours.find((c) => c.id === id);
          if (picked) setColour(picked);
        }}
        aria-labelledby="mk-colour"
        className={cn(CHOICES, "grid-cols-3 sm:grid-cols-6")}
      >
        {facesData.colours.map((c) => (
          <RadioGroupItem key={c.id} value={c.id} variant="card" size="swatch">
            <span
              className="size-7 rounded-[30%] border-[1.5px] border-black/20"
              style={{ background: c.c }}
            />
            <span className="font-mono">{c.name.toUpperCase()}</span>
          </RadioGroupItem>
        ))}
      </RadioGroup>
    </div>
  );
}

function NameField() {
  const { name, setName } = useLanding();
  return (
    <div className={PICKER}>
      <Kicker asChild>
        <Label htmlFor="mk-name">NAME</Label>
      </Kicker>
      <Input
        id="mk-name"
        className="max-w-[320px] font-mono text-[20px] font-semibold tracking-[0.04em]"
        type="text"
        value={name}
        maxLength={NAME_MAX}
        autoComplete="off"
        spellCheck={false}
        aria-describedby="mk-name-note"
        onChange={(e) => setName(e.target.value)}
      />
      <Note asChild>
        <span id="mk-name-note">
          LETTERS, DIGITS AND SPACES · UP TO {NAME_MAX}
        </span>
      </Note>
    </div>
  );
}

function FacePicker() {
  const { face, setFace, colour } = useLanding();
  const style = { "--glyph": colour.g } as React.CSSProperties;
  return (
    <div className={PICKER}>
      <Kicker id="mk-face">FACE · {facesData.faces.length} MOODS</Kicker>
      <RadioGroup
        value={face}
        onValueChange={setFace}
        aria-labelledby="mk-face"
        className={cn(
          CHOICES,
          "grid-cols-[repeat(auto-fill,minmax(72px,1fr))] sm:grid-cols-[repeat(auto-fill,minmax(84px,1fr))]"
        )}
        style={style}
      >
        {facesData.faces.map((f) => (
          <RadioGroupItem key={f.id} value={f.id} variant="card" size="face">
            <span
              className="block w-full rounded-[7px] bg-black py-2 font-mono text-[15px]/[1.2] font-extrabold tracking-normal whitespace-pre text-[color:var(--glyph,var(--color-glyph))]"
              aria-hidden="true"
            >
              {f.text}
            </span>
            <span className="font-mono">{f.t.toUpperCase()}</span>
          </RadioGroupItem>
        ))}
      </RadioGroup>
    </div>
  );
}

// Both bodies at once: the charm and the desktop charm, saying hello with the picked name.
function Preview() {
  const { colour, face, shownName } = useLanding();
  const { host, device } = useCharmDevice({ face });
  const mood = facesData.faces.find((f) => f.id === face);
  const hello = `Hi! I’m ${shownName}.`;

  useEffect(() => {
    // The face alone on the small charm: a line would crowd it; the greeting goes in the notch panel.
    device?.face.set({ face });
  }, [device, face]);

  return (
    <Box className="flex flex-col gap-5 p-7 lg:sticky lg:top-4">
      <div className="mx-auto aspect-square w-[min(62%,240px)]" ref={host} />
      <NotchPreview
        size="compact"
        eyes={mood ?? FALLBACK_EYES}
        glyph={colour.g}
        kicker={shownName.toUpperCase()}
        text={hello}
      />
      <p
        className="text-center font-mono text-[12px] tracking-label text-ink-2"
        aria-live="polite"
      >
        {shownName.toUpperCase()} · {colour.name.toUpperCase()} ·{" "}
        {(mood?.t ?? face).toUpperCase()}
      </p>
    </Box>
  );
}

export { ColourPicker, FacePicker, NameField, Preview };

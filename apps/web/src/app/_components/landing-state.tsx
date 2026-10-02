"use client";

import { facesData } from "@opencharm-labs/design/faces";
import type { Colour } from "@opencharm-labs/design/types";
import { createContext, useContext, useState } from "react";

type LandingState = {
  colour: Colour;
  setColour: (colour: Colour) => void;
  /** What the visitor typed, already cleaned; may be empty. */
  name: string;
  setName: (name: string) => void;
  /** The name to show: what they typed, or the example agent's. */
  shownName: string;
  /** The resting face they picked (a facesData face id). */
  face: string;
  setFace: (face: string) => void;
};

const DEFAULT_NAME = "Momo";
const DEFAULT_FACE = "happy";
const NAME_MAX = 12;

function firstColour(): Colour {
  const colour = facesData.colours[0];
  if (!colour) throw new Error("faces.json has no colours");
  return colour;
}

// Letters, digits and spaces only, so the name always fits the charm's screen and its font.
function cleanName(raw: string): string {
  return raw.replace(/[^\p{L}\p{N} ]/gu, "").slice(0, NAME_MAX);
}

const LandingContext = createContext<LandingState | null>(null);

// One charm for the whole page: the colour, name and face picked anywhere repaint every charm.
function LandingProvider({ children }: { children: React.ReactNode }) {
  const [colour, setColour] = useState<Colour>(firstColour);
  const [name, setRawName] = useState(DEFAULT_NAME);
  const [face, setFace] = useState(DEFAULT_FACE);
  // The React Compiler memoises this, so consumers re-render only when a choice changes.
  const value = {
    colour,
    setColour,
    name,
    setName: (next: string) => setRawName(cleanName(next)),
    shownName: name.trim() || DEFAULT_NAME,
    face,
    setFace,
  };
  return <LandingContext value={value}>{children}</LandingContext>;
}

function useLanding(): LandingState {
  const state = useContext(LandingContext);
  if (!state) throw new Error("useLanding needs a LandingProvider");
  return state;
}

export { LandingProvider, NAME_MAX, useLanding };

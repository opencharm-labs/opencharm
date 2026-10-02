"use client";

import { useState } from "react";

import { BodySwitch, DesktopMoment, type Body } from "./body-switch";
import { Box } from "./box";
import { Charm } from "./charm";
import { BodyText, Kicker } from "./text";

const LAYOUTS = [
  {
    n: "A",
    t: "Face",
    d: "Most of the time, just the face. It blinks, glances around and reacts. On the desktop, the eyes sit by the notch and the panel stays shut.",
    w: "RESTING · LISTENING · WORKING",
    solid: false,
    v: { face: "neutral" },
  },
  {
    n: "B",
    t: "Speech",
    d: "When it answers, the words type out under the eyes, or in a panel below the notch. Long answers scroll like captions; nothing runs off the screen.",
    w: "ANSWERS · CONFIRMATIONS",
    solid: false,
    v: { face: "happy", say: "Lunch with Sara moved to 1:30." },
  },
  {
    n: "C",
    t: "Decision",
    d: "When your agent needs you, an orange ring appears, around the screen or the panel, and the key says what it will do.",
    w: "APPROVALS · QUESTIONS",
    solid: true,
    v: {
      face: "ask",
      say: "Send it to Sara?",
      hint: "HOLD · SEND    PRESS · NO",
    },
  },
];

// The three layouts, on the charm or the desktop charm: the only part of the section that changes.
function LayoutCards() {
  const [body, setBody] = useState<Body>("charm");
  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-end gap-x-6 gap-y-3 max-sm:items-stretch">
        <BodySwitch body={body} onChange={setBody} />
      </div>
      {/* Three layouts side by side on a desktop; stacked, and kept narrow, below. */}
      <div className="grid max-w-[440px] grid-cols-1 gap-6 lg:max-w-none lg:grid-cols-3">
        {LAYOUTS.map((l) => (
          <Box
            key={l.n}
            tone={l.solid ? "solid" : "paper"}
            className="flex flex-col"
          >
            <div className="flex justify-center px-7 pt-7 *:w-full *:max-w-[240px]">
              {body === "charm" ? (
                <Charm options={{ face: l.v.face }} show={l.v} />
              ) : (
                <DesktopMoment v={l.v} />
              )}
            </div>
            <div className="flex flex-col gap-2.5 px-7 pt-5.5 pb-7">
              <h3 className="flex items-baseline gap-3 text-[30px] font-semibold tracking-[-0.03em]">
                <span className="font-mono text-[12px] font-normal tracking-label opacity-60">
                  {l.n}
                </span>
                {l.t}
              </h3>
              <BodyText>{l.d}</BodyText>
              <Kicker>{l.w}</Kicker>
            </div>
          </Box>
        ))}
      </div>
    </>
  );
}

export { LayoutCards };

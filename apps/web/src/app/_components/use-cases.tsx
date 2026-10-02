"use client";

import { useState } from "react";

import type { FaceSetOptions } from "../_lib/charm-face";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

import { BodySwitch, DesktopMoment, type Body } from "./body-switch";
import { Charm } from "./charm";
import { BodyText } from "./text";

type Filter = "all" | "desk" | "home";

type UseCase = {
  n: string;
  f: Exclude<Filter, "all">;
  t: string;
  d: string;
  via: string;
  v: FaceSetOptions & { face: string };
};

const FILTERS: { f: Filter; label: string }[] = [
  { f: "all", label: "ALL 10" },
  { f: "desk", label: "AT YOUR DESK" },
  { f: "home", label: "AT HOME" },
];

const USES: UseCase[] = [
  {
    n: "01",
    f: "desk",
    t: "Talk to your agent",
    d: "Hold the key, ask anything, hear one clear answer.",
    via: "ANY AGENT",
    v: { face: "joy", say: "Your 3pm moved to 4." },
  },
  {
    n: "02",
    f: "desk",
    t: "It needs you",
    d: "Your agent asks before it acts. Hold for yes, press for no.",
    via: "AGENT APPROVALS",
    v: { face: "ask", say: "Run the migration?", hint: "HOLD · YES" },
  },
  {
    n: "03",
    f: "desk",
    t: "Know when it’s done",
    d: "Start a long task and walk away. The face tells you when it’s finished.",
    via: "CLAUDE CODE, CODEX…",
    v: { face: "happy", say: "Tests pass. 3 files changed." },
  },
  {
    n: "04",
    f: "desk",
    t: "Remember this",
    d: "Say it once. Your agent keeps it, and you can read the list.",
    via: "AGENT MEMORY",
    v: { face: "wink", say: "Noted: Sara’s birthday, 14 March." },
  },
  {
    n: "05",
    f: "desk",
    t: "Learn something",
    d: "Five-minute quizzes that adapt to you. It reacts to every answer.",
    via: "ANY MODEL",
    v: { face: "curious", say: "Italian: “to remember”?" },
  },
  {
    n: "06",
    f: "home",
    t: "Morning brief",
    d: "Pick it up and hear the one thing that matters today.",
    via: "CALENDAR + WEATHER TOOLS",
    v: { face: "happy", say: "3 meetings. Umbrella." },
  },
  {
    n: "07",
    f: "home",
    t: "Cook hands-free",
    d: "One step at a time, timers included, readable with flour on your hands.",
    via: "ANY RECIPE URL",
    v: { face: "focused", say: "Step 3: 8 min left." },
  },
  {
    n: "08",
    f: "home",
    t: "Your home",
    d: "Lights, heating, the door. Say it on your way out.",
    via: "HOME ASSISTANT MCP",
    v: { face: "happy", say: "Lights off. Heating to 18°." },
  },
  {
    n: "09",
    f: "home",
    t: "Travel days",
    d: "Gate changes, walking time, the right platform.",
    via: "EMAIL + FLIGHT STATUS",
    v: { face: "surprised", say: "Gate changed: B12, 14 min." },
  },
  {
    n: "10",
    f: "home",
    t: "Wind down",
    d: "It gets sleepy when you should. Tomorrow sorted.",
    via: "YOUR CALENDAR",
    v: { face: "sleepy", say: "Bedtime in 20 min." },
  },
];

function UseCases() {
  const [filter, setFilter] = useState<Filter>("all");
  const [body, setBody] = useState<Body>("charm");
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 max-sm:items-stretch">
        {/* On phones the three filters share the row evenly. */}
        <ToggleGroup
          type="single"
          value={filter}
          onValueChange={(v) => v && setFilter(v as Filter)}
          aria-label="Filter use cases"
          className="max-sm:grid max-sm:w-full max-sm:grid-cols-3"
        >
          {FILTERS.map((b) => (
            <ToggleGroupItem
              key={b.f}
              value={b.f}
              className="max-sm:px-1.5 max-sm:py-2 max-sm:text-2xs max-sm:tracking-[0.06em]"
            >
              {b.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <BodySwitch body={body} onChange={setBody} />
      </div>
      <div className="grid grid-cols-2 gap-x-5 gap-y-9 md:grid-cols-3 xl:grid-cols-5">
        {USES.map((u) => (
          <div
            className="flex min-w-0 flex-col gap-2.5"
            key={u.n}
            hidden={filter !== "all" && filter !== u.f}
          >
            {body === "charm" ? (
              <Charm
                className="px-[6%]"
                options={{ face: u.v.face, idle: true }}
                show={u.v}
              />
            ) : (
              <DesktopMoment v={u.v} className="px-[6%]" />
            )}
            <h3 className="flex items-baseline gap-2 text-[19px] font-semibold tracking-[-0.01em]">
              <span className="font-mono text-2xs font-normal tracking-caption text-mute">
                {u.n}
              </span>
              {u.t}
            </h3>
            <BodyText className="text-[14px]/[1.55]">{u.d}</BodyText>
            <span className="font-mono text-3xs tracking-widest text-mute">
              {u.via}
            </span>
          </div>
        ))}
      </div>
    </>
  );
}

export { UseCases };

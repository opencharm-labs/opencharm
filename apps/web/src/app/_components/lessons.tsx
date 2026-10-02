import { cn } from "@/lib/utils";

import { Section, SectionHead, SectionIntro } from "./section";
import { Note } from "./text";

const VS = [
  [
    "PRICE",
    "$699 + $24 a month",
    "$199",
    "Not announced yet",
    "About $32 of hardware. No subscription.",
  ],
  [
    "SPEED",
    "Seconds per answer, often longer",
    "Slow cloud round-trips",
    "A real-time voice model, says Meta. Not out yet.",
    "Aims to react in under 100 ms (target). It says when a task is slow.",
  ],
  [
    "THE BASICS",
    "Couldn’t reliably set a timer or an alarm",
    "Big demos, few everyday tasks that worked",
    "Talks with Meta’s own AI, as a cartoon character",
    "Everyday jobs, done by the agent you already trust and its tools.",
  ],
  [
    "LEARNING CURVE",
    "Gestures, a laser screen, a palm to aim",
    "Scroll wheel, menus, a “large action model”",
    "Press and talk to a character on a 2-inch screen",
    "One key, three moves. Hold, press, tap.",
  ],
  [
    "THE PROMISE",
    "Replace your phone",
    "Replace your apps",
    "A companion everywhere, over 5G",
    "Replace nothing. A body for the agent you already run.",
  ],
  [
    "CAMERA",
    "Yes",
    "Yes, one that rotates",
    "Two",
    "None. The microphone is on only while you hold the key.",
  ],
  [
    "IF THE COMPANY DIES",
    "Bricked in Feb 2025",
    "Depends on their cloud",
    "Meta’s agent, Meta’s cloud",
    "Nothing happens. Your agent and charmd run on your machine; the code is yours.",
  ],
] as const;

// Table cells on wider screens; on phones the borders go to the row's card.
const CELL = cn(
  "border-r-[1.5px] border-b-[1.5px] border-ink px-5 py-4.5 text-left align-top max-sm:border-0"
);
const HEAD = cn(CELL, "font-mono text-[12px] font-semibold tracking-label");
const VALUE = cn(
  CELL,
  "text-[15px]/[1.45] text-ink-2 max-sm:grid max-sm:w-auto max-sm:grid-cols-[9.5em_1fr] max-sm:gap-2.5 max-sm:border-t max-sm:border-t-ink/12 max-sm:px-3.5 max-sm:py-2 max-sm:before:pt-0.75 max-sm:before:font-mono max-sm:before:text-3xs max-sm:before:tracking-caption max-sm:before:text-mute max-sm:before:content-[attr(data-label)]"
);
const US = cn("bg-ink font-medium text-white");

function Lessons() {
  return (
    <Section id="lessons">
      <SectionHead ix="11" label="WHY IT WORKS" />
      <SectionIntro title="Why this won’t be another AI Pin.">
        Two gadgets promised to replace your phone. Both were slow, missed the
        basics and asked you to learn a new way of doing things. Meta has since
        announced its own charm, built around its own agent. OpenCharm is the
        open-source alternative: the agent you already run, on hardware you
        build.
      </SectionIntro>
      {/* Phones: each topic becomes a card listing every product by name, so OpenCharm is never off-screen. */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse border-t-[1.5px] border-l-[1.5px] border-ink bg-card max-sm:block max-sm:min-w-0 max-sm:border-0 max-sm:bg-transparent">
          <thead className="max-sm:hidden">
            <tr>
              <th scope="col" className={HEAD}>
                <span className="sr-only">Topic</span>
              </th>
              <th scope="col" className={HEAD}>
                HUMANE AI PIN
              </th>
              <th scope="col" className={HEAD}>
                RABBIT R1
              </th>
              <th scope="col" className={HEAD}>
                META MUSE CHARM{" "}
                {/* A product that isn't out yet says so under its name. */}
                <small className="mt-1.5 block text-3xs tracking-caption text-mute">
                  ANNOUNCED SEPT 2026
                </small>
              </th>
              <th scope="col" className={cn(HEAD, US)}>
                OPENCHARM
              </th>
            </tr>
          </thead>
          <tbody className="max-sm:block">
            {VS.map(([topic, pin, r1, meta, us]) => (
              <tr
                key={topic}
                className="max-sm:mb-3 max-sm:block max-sm:border-[1.5px] max-sm:border-ink max-sm:bg-card"
              >
                <th
                  scope="row"
                  className={cn(
                    CELL,
                    "w-[190px] font-mono text-2xs font-normal tracking-label text-mute max-sm:block max-sm:w-auto max-sm:px-3.5 max-sm:pt-3 max-sm:pb-1.5"
                  )}
                >
                  {topic}
                </th>
                <td data-label="HUMANE AI PIN" className={VALUE}>
                  {pin}
                </td>
                <td data-label="RABBIT R1" className={VALUE}>
                  {r1}
                </td>
                <td data-label="META MUSE CHARM" className={VALUE}>
                  {meta}
                </td>
                <td
                  data-label="OPENCHARM"
                  className={cn(VALUE, US, "max-sm:before:text-on-night")}
                >
                  {us}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Note>
        SOURCES: THE VERGE, ENGADGET, WIRED AND WASHINGTON POST REVIEWS (APR–MAY
        2024) · HP ACQUISITION AND SHUTDOWN (FEB 2025) · RABBIT ACTIVE-USER
        FIGURES AS REPORTED SEPT 2024 · META: ITS MUSE CHARM PAGE AND LAUNCH
        COVERAGE (CNBC, 23 SEPT 2026; DEZEEN, 25 SEPT 2026), AS OF 2 OCT 2026 ·
        NOT AFFILIATED WITH META
      </Note>
    </Section>
  );
}

export { Lessons };

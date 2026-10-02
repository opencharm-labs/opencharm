import { facesData } from "@opencharm-labs/design/faces";

import { CharmScreen } from "./charm";
import { PanelTitle } from "./panel-grid";
import { Section, SectionHead, SectionIntro } from "./section";
import { BodyText, Kicker } from "./text";

const ALIVE = [
  {
    k: "BREATHES",
    d: "All the time; slower and deeper when it’s asleep.",
  },
  { k: "BLINKS", d: "Quick, double or slow." },
  {
    k: "GLANCES",
    d: "Looks around, and wanders up while it thinks.",
  },
  {
    k: "LOOKS AT YOU",
    d: "Follows your finger on the screen, and squashes when the key goes down.",
  },
  {
    k: "LISTENS",
    d: "Its eyes swell with your voice while you hold the key.",
  },
  {
    k: "GREETS",
    d: "Says hi after you unlock it, and is pleased after it helps.",
  },
  {
    k: "DOZES",
    d: "Falls asleep after about four minutes alone, with z’s.",
  },
  {
    k: "REACTS",
    d: "A poke gets a different reaction each time. Three quick pokes make it dizzy.",
  },
];

function FaceLibrary() {
  return (
    <Section id="face">
      <SectionHead ix="01" label="THE FACE" />
      <SectionIntro title="A face you can type.">
        Two characters for eyes and one for a mouth. Readable from across the
        room, cheap to draw, and anyone can write a new one and share it as
        text.
      </SectionIntro>
      <div className="grid grid-cols-4 gap-x-2.5 gap-y-4 sm:grid-cols-6 lg:grid-cols-11">
        {facesData.faces.map((f) => (
          <figure
            key={f.id}
            className="flex min-w-0 flex-col items-center gap-1.5"
          >
            <CharmScreen className="w-full" face={f.id} />
            <figcaption className="text-center font-mono text-4xs tracking-widest text-ink-2">
              {f.t.toUpperCase()}
            </figcaption>
          </figure>
        ))}
      </div>
      <div className="grid grid-cols-1 border-[1.5px] border-ink bg-card lg:grid-cols-[260px_minmax(0,1fr)]">
        <div className="flex flex-col gap-2.5 border-b-[1.5px] border-ink p-6.5 lg:border-r-[1.5px] lg:border-b-0">
          <Kicker>IT FEELS ALIVE</Kicker>
          <PanelTitle>Small moves, all the time.</PanelTitle>
        </div>
        {/* Every block the same height, whatever its text; the last row closes on the box's own border. */}
        <ul className="grid grid-cols-1 sm:auto-rows-fr sm:grid-cols-2">
          {ALIVE.map((a) => (
            <li
              key={a.k}
              className="flex flex-col gap-1 border-b border-dashed border-dash px-5.5 py-4 max-sm:last:border-b-0 sm:odd:border-r sm:nth-last-[-n+2]:border-b-0"
            >
              <span className="font-mono text-[12px] font-semibold tracking-label">
                {a.k}
              </span>
              <BodyText asChild>
                <span>{a.d}</span>
              </BodyText>
            </li>
          ))}
        </ul>
      </div>
    </Section>
  );
}

function AgentStates() {
  return (
    <Section id="states">
      <SectionHead ix="03" label="AT A GLANCE" />
      <SectionIntro title="See what your agent is doing without asking.">
        The charm listens to your agent’s events and turns each one into a face.
        Thinking, working, stuck, done, learned something new.
      </SectionIntro>
      {/* A row per state; on phones the face leads and the text stacks beside it. */}
      <div className="border-t-[1.5px] border-ink">
        {facesData.states.map((s, i) => (
          <div
            className="grid grid-cols-[52px_minmax(0,1fr)] items-center gap-4 border-b border-dashed border-rule py-2.5 md:grid-cols-[28px_52px_150px_minmax(0,1fr)_minmax(0,1fr)]"
            key={s.id}
          >
            <span className="hidden font-mono text-3xs text-mute md:block">
              {String(i + 1).padStart(2, "0")}
            </span>
            <CharmScreen face={s.face} idle={false} />
            <div>
              <b className="text-[17px]">{s.name}</b>
              <span className="block font-mono text-[12px] whitespace-pre text-mute">
                {facesData.faces.find((f) => f.id === s.face)?.text}
              </span>
            </div>
            <BodyText className="max-md:col-start-2">{s.when}</BodyText>
            <span className="font-mono text-2xs/[1.6] tracking-[0.06em] text-mute max-md:col-start-2">
              {s.trigger.toUpperCase()}
            </span>
          </div>
        ))}
      </div>
    </Section>
  );
}

export { AgentStates, FaceLibrary };

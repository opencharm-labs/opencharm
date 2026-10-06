import {
  Caret,
  CodeBlock,
  CodeLines,
  D,
  G,
  W,
  Y,
  type Line,
} from "./code-lines";
import { Section, SectionHead, SectionIntro } from "./section";
import { BodyText, Kicker } from "./text";
import { cn } from "@/lib/utils";

const TERMINAL: Line[] = [
  ["# the desktop charm does this for you", D],
  ["# by hand, next to your agent:", D],
  ["$ opencharm init momo", W],
  ["  ✓ workspace cloned from opencharm-starter", G],
  ["$ cd momo && opencharm serve", W],
  ["  ✓ charmd listening on this machine", G],
  ["  ✓ agent: Claude Code, over ACP", G],
  ["  ✓ voice: on this Mac (say + whisper)", G],
  ["$ opencharm pair 482913", W],
  ["  ✓ paired momo · you choose its PIN", G],
  [" ", W],
  ["# hold the key and say:", D],
  [<>&quot;momo, what’s on today?&quot;</>, Y],
];

const PIECES = [
  {
    name: "OpenCharm OS",
    where: "firmware/core, C++",
    what: "Glyph faces, the key, the PIN pad, questions on the charm. Runs in the desktop charm today; the board port is next.",
    status: "DESKTOP",
  },
  {
    name: "Desktop charm",
    where: "apps/desktop, Tauri 2",
    what: "The same OS at the top of your screen, with its own charmd. macOS and Windows, built by CI.",
    status: "MACOS · WINDOWS",
  },
  {
    name: "charmd",
    where: "the charm daemon",
    what: "Pairing and PIN, speech on your machine or with your OpenAI key, questions, the charm’s own tools for your agent.",
    status: "BUILT",
  },
  {
    name: "Your agent",
    where: "ACP or an OpenAI-style API",
    what: "Claude Code, Codex, Gemini CLI, goose, Hermes Agent, OpenClaw. Claude Code is tested end to end.",
    status: "CLAUDE CODE",
  },
  {
    name: "Starter workspace",
    where: "opencharm-starter",
    what: "The folder your agent works in: who the charm is, its skills, what it may do, what it remembers.",
    status: "BUILT",
  },
];

const NODE = cn("relative flex flex-col items-center gap-3 text-center");
const ICON = cn(
  "grid size-30 place-items-center rounded-[30%] border-[1.5px] border-ink bg-card"
);
const NODE_TITLE = cn("text-[22px] font-semibold");
// The wire runs from one icon's edge to the next one's, with its label centred above it; it only
// shows when the three steps sit in a row.
const WIRE = cn(
  "absolute top-15 left-[calc(50%+60px)] hidden w-[calc(100%+48px-120px)] -translate-y-full border-b-[1.5px] border-dashed border-ink pb-2 text-center font-mono text-2xs/none tracking-widest text-ink-2 lg:block"
);

function HowItWorks() {
  return (
    <Section id="how">
      <SectionHead ix="08" label="HOW IT WORKS" />
      <SectionIntro title="A small body for the brain you already have.">
        The charm holds no API keys and runs no model. charmd, a small daemon on
        your machine, carries its voice to your agent and brings back speech,
        faces and questions.
      </SectionIntro>
      <div className="relative grid grid-cols-1 gap-8 border-[1.5px] border-dashed border-dash bg-white/50 p-7 lg:grid-cols-3 lg:gap-12 lg:p-10">
        <div className={NODE}>
          <div className="grid size-30 place-items-center rounded-icon ring-1 ring-black/14">
            {/* eslint-disable-next-line @next/next/no-img-element -- the app icon as SVG; next/image adds nothing here */}
            <img
              className="block size-full rounded-icon"
              src="/icon.svg"
              alt=""
              width={120}
              height={120}
            />
          </div>
          <span className={WIRE} aria-hidden="true">
            VOICE · FACES
          </span>
          <Kicker>1 · THE CHARM</Kicker>
          <h3 className={NODE_TITLE}>Face, voice, one key</h3>
          <BodyText className="max-w-[34ch]">
            One OS for every body: the desktop charm on your Mac or Windows PC
            today, the board you build next. Hold the key to talk; the mic is
            open only while you hold it.
          </BodyText>
        </div>
        <div className={NODE}>
          <div className={ICON}>
            <span className="font-mono text-[18px] font-semibold">charmd</span>
          </div>
          <span className={WIRE} aria-hidden="true">
            ACP · API
          </span>
          <Kicker>2 · CHARMD</Kicker>
          <h3 className={NODE_TITLE}>Runs next to your agent</h3>
          <BodyText className="max-w-[34ch]">
            Pairing and the PIN, speech on your machine or with your own key,
            and the charm’s tools for your agent. On your laptop, a Mac mini or
            a server; the desktop charm brings its own.
          </BodyText>
        </div>
        <div className={NODE}>
          <div className={ICON}>
            <svg
              width="48"
              height="48"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#0A0A0A"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="9" />
              <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
            </svg>
          </div>
          <Kicker>3 · YOUR AGENT</Kicker>
          <h3 className={NODE_TITLE}>The one you already use</h3>
          <BodyText className="max-w-[34ch]">
            Claude Code, Codex, Hermes Agent, OpenClaw and more, one at a time.
            It keeps its memory, skills and model; the charm is its body, and
            asks you before it acts.
          </BodyText>
        </div>
      </div>
      <div className="grid grid-cols-1 items-start gap-10 lg:grid-cols-2">
        <div className="overflow-hidden rounded-[14px] border-[1.5px] border-ink">
          <div className="flex justify-between gap-3 bg-night px-5.5 pt-4 font-mono text-2xs tracking-caption text-on-night-2">
            <span>TERMINAL</span>
            <span>ON NPM · NODE 24</span>
          </div>
          <CodeBlock>
            <CodeLines lines={TERMINAL} />
            {"\n"}
            <Caret />
          </CodeBlock>
        </div>
        <div>
          <div className="grid grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)_90px] items-baseline gap-3 border-t-[1.5px] border-b border-t-ink border-b-rule py-3.25 font-mono text-2xs tracking-caption text-mute max-sm:hidden">
            <span>PIECE</span>
            <span>WHAT IT DOES</span>
            <span>STATUS</span>
          </div>
          {/* On phones each piece reads as a card: name and status on top, what it does below. */}
          {PIECES.map((p) => (
            <div
              className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 gap-y-1.5 border-b border-dashed border-rule py-3.25 sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)_90px] sm:gap-3"
              key={p.name}
            >
              <div className="max-sm:col-start-1 max-sm:row-start-1">
                <b className="block text-[16px] font-semibold max-sm:inline">
                  {p.name}
                </b>
                <span className="font-mono text-2xs text-mute max-sm:ml-2">
                  {p.where}
                </span>
              </div>
              <BodyText asChild>
                <span className="max-sm:col-span-2 max-sm:row-start-2">
                  {p.what}
                </span>
              </BodyText>
              <span className="font-mono text-2xs tracking-widest max-sm:col-start-2 max-sm:row-start-1">
                {p.status}
              </span>
            </div>
          ))}
        </div>
      </div>
    </Section>
  );
}

export { HowItWorks };

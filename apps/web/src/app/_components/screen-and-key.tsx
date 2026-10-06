import { LayoutCards } from "./layout-cards";
import { Panel, PanelGrid } from "./panel-grid";
import { Section, SectionHead, SectionIntro } from "./section";
import { BodyText, Note } from "./text";

const MOVES = [
  {
    k: "HOLD THE KEY",
    d: "Talk to it, like a walkie-talkie. The mic is on only while you hold it. When the ring is orange, holding means yes.",
    icon: "M 14 8 L 26 8 L 26 32 L 14 32 Z",
    cx: 20,
    cy: 20,
  },
  {
    k: "PRESS THE KEY",
    d: "Everything else: wake it, stop it talking, dismiss, or say no.",
    icon: "M 14 12 L 26 12 L 26 30 L 14 30 Z M 20 4 L 20 8",
    cx: 20,
    cy: 21,
  },
  {
    k: "TAP ITS FACE",
    d: "It reacts. That’s all. You never need a swipe.",
    icon: "M 20 34 L 20 22",
    cx: 20,
    cy: 16,
  },
];

function ScreenAndKey() {
  return (
    <Section id="ui">
      <SectionHead ix="07" label="SCREEN AND KEY" />
      <SectionIntro title="One thing on screen. One key in your hand.">
        The face never leaves. When it talks, the eyes move up and the words
        scroll under them like captions. When it needs a decision, an orange
        ring appears.
      </SectionIntro>
      <LayoutCards />
      <PanelGrid className="sm:grid-cols-1 lg:grid-cols-3">
        {MOVES.map((m) => (
          <Panel key={m.k} className="flex-row items-start gap-4.5 p-5.5">
            <span className="grid size-16 shrink-0 place-items-center rounded-[30%] bg-black">
              <svg
                width="40"
                height="40"
                viewBox="0 0 40 40"
                aria-hidden="true"
              >
                <path
                  d={m.icon}
                  className="fill-none stroke-on-night-2"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <circle className="fill-glyph" cx={m.cx} cy={m.cy} r="5" />
              </svg>
            </span>
            <div className="flex flex-col gap-2">
              <span className="font-mono text-[12px] font-semibold tracking-label">
                {m.k}
              </span>
              <BodyText>{m.d}</BodyText>
            </div>
          </Panel>
        ))}
      </PanelGrid>
      <BodyText className="mt-6">
        On the desktop charm the key is <b>⌥ Option + Space</b> (
        <b>Ctrl + Alt + Space</b> on Windows), in any app: hold it to talk,
        press it for everything else. You can change it in Settings.
      </BodyText>
      <Note>
        THE MIC IS ON ONLY WHILE THE KEY IS HELD: IN THE DESKTOP CHARM AND ON
        THE BOARD · IF SOMEONE CAN’T USE IT TEN SECONDS AFTER PICKING IT UP,
        WE’VE FAILED · ONE THING PER SCREEN · GLYPHS ON TRUE BLACK · ORANGE ONLY
        WHEN IT NEEDS YOU · TARGET: A REACTION IN UNDER 100 MS
      </Note>
    </Section>
  );
}

export { ScreenAndKey };

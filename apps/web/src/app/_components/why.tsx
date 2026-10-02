import { DEPLOY_GUIDE } from "../_lib/links";
import { Box } from "./box";
import { Panel, PanelGrid, PanelTitle } from "./panel-grid";
import { Section, SectionHead, SectionIntro } from "./section";
import { BodyText, Kicker, Note } from "./text";

const REASONS = [
  {
    kick: "IN VIEW",
    title: "Visible without asking.",
    body: "Your phone lies face-down and locked. The charm sits by your keyboard, and a glance tells you whether your agent is busy, stuck or done.",
  },
  {
    kick: "FOCUS",
    title: "It won’t pull you into your phone.",
    body: "Checking on your agent shouldn’t end in your inbox. The charm does one job, then goes quiet.",
  },
  {
    kick: "ATTACHMENT",
    title: "You can get attached to it.",
    body: "Nobody bonds with an app icon. People do with a small thing that looks back and nods when the job is done.",
  },
  {
    kick: "YOURS",
    title: "Make it yours.",
    body: "Print its shell in your colour, name it, write its faces, flash its firmware. It’s open down to the case files.",
  },
];

// Where the work happens: wherever the agent runs, never on the charm.
const PLACES = [
  {
    kick: "ON YOUR COMPUTER",
    flow: ["CHARM", "CHARMD", "YOUR AGENT", "FILES · TERMINAL · APPS"],
    title: "It works on your machine.",
    body: "Your agent runs next to you, so it can read your files, run your tests, edit code and use the apps you let it. The board and the desktop charm both talk to it here.",
  },
  {
    kick: "ON YOUR SERVER",
    flow: ["CHARM", "WSS://", "YOUR SERVER", "TOOLS THAT NEVER SLEEP"],
    title: "Or on a server that never sleeps.",
    body: "Run Hermes, OpenClaw or anything OpenAI-compatible on a server you own, and it keeps working with your laptop shut. The board reaches it from anywhere over an encrypted link.",
  },
];

function Why() {
  return (
    <Section id="why">
      <SectionHead ix="05" label="WHY A COMPANION" />
      <SectionIntro title="Why not just an app?">
        A phone app could do most of this. The rest is why it’s a small thing
        that sits by your laptop or hangs from your keys.
      </SectionIntro>
      <div className="grid grid-cols-1 items-stretch gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        <PanelGrid>
          {REASONS.map((r) => (
            <Panel key={r.kick}>
              <Kicker>{r.kick}</Kicker>
              <PanelTitle>{r.title}</PanelTitle>
              <BodyText>{r.body}</BodyText>
            </Panel>
          ))}
        </PanelGrid>
        <Box tone="solid" className="flex flex-col gap-3.5 p-6.5">
          <Kicker>WHAT IT ISN’T</Kicker>
          <h3 className="text-[26px] font-semibold tracking-[-0.02em]">
            Not a phone. Not a new assistant.
          </h3>
          <BodyText>
            It doesn’t replace anything. Your agent keeps its memory, skills and
            model. The charm is the part it was missing: eyes, a voice, and a
            key you can find without looking.
          </BodyText>
        </Box>
      </div>
      <div className="mt-8 flex flex-col gap-3.5">
        <Kicker>IT WORKS WHERE YOUR AGENT LIVES</Kicker>
        <div className="grid grid-cols-1 border-[1.5px] border-ink bg-card md:grid-cols-2">
          {PLACES.map((p) => (
            <div
              key={p.kick}
              className="flex flex-col gap-2.5 border-ink p-6.5 not-first:max-md:border-t-[1.5px] not-first:md:border-l-[1.5px]"
            >
              <Kicker>{p.kick}</Kicker>
              <p
                className="flex flex-wrap gap-y-1.5 border-y border-dashed border-dash py-2.5 font-mono text-2xs tracking-widest"
                aria-hidden="true"
              >
                {p.flow.map((step, i) => (
                  <span key={step}>
                    {i > 0 ? (
                      <i className="px-2 text-mute not-italic">→</i>
                    ) : null}
                    {step}
                  </span>
                ))}
              </p>
              <PanelTitle>{p.title}</PanelTitle>
              <BodyText>{p.body}</BodyText>
            </div>
          ))}
        </div>
        <Note>
          ANYTHING RISKY TURNS THE FACE ORANGE AND WAITS FOR YOUR KEY ·{" "}
          <a className="text-inherit trace" href={DEPLOY_GUIDE}>
            SERVER GUIDE ↗
          </a>
        </Note>
      </div>
    </Section>
  );
}

export { Why };

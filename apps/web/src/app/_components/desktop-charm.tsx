import { facesData } from "@opencharm-labs/design/faces";

import { Button } from "@/components/ui/button";

import { DESKTOP_README, DOWNLOAD } from "../_lib/links";
import { Actions } from "./actions";
import { NotchPreview } from "./notch-preview";
import { Panel, PanelGrid, PanelTitle } from "./panel-grid";
import { Section, SectionHead, SectionIntro } from "./section";
import { BodyText, Kicker, Note } from "./text";

const POINTS = [
  {
    kick: "BY THE NOTCH",
    title: "Hold the talk key in any app.",
    body: "Its eyes sit on either side of the notch, or of a small black pill on Windows, breathing and blinking. Hold ⌥ Option + Space (Ctrl + Alt + Space on Windows) and talk; you can change the key.",
  },
  {
    kick: "THE PANEL",
    title: "Answers open below the notch.",
    body: "When it answers, thinks or asks, a panel opens underneath: captions, and questions where hold means yes and press means no.",
  },
  {
    kick: "SETTINGS",
    title: "Your folder, your agent, your voice.",
    body: "Choose the agent’s folder, the agent (Claude Code, Codex, Gemini CLI, goose, Hermes, OpenClaw, any ACP command or an OpenAI-compatible server) and the voice: local on a Mac, OpenAI with the key in your keychain, or none. It runs its own charmd and pairs by itself.",
  },
  {
    kick: "GET IT",
    title: "macOS and Windows.",
    body: "Download it from GitHub Releases, built by the repository’s own CI from this code, with checksums and build provenance so you can check what you got. Or build it yourself from the code.",
  },
];

// The neutral face's eyes, so the drawing stays in step with the face library.
const EYES = facesData.faces.find((f) => f.id === "neutral") ?? {
  L: "o",
  R: "o",
};

function NotchDrawing() {
  return (
    <figure className="flex flex-col gap-3" aria-labelledby="notch-cap">
      <NotchPreview
        eyes={EYES}
        kicker="CAPTION"
        text="Three new issues since this morning. The login bug is the one people keep hitting; I’d start there."
      />
      <Note asChild>
        <figcaption id="notch-cap">
          FIG. 06 · THE EYES ON THE NOTCH’S EARS, THE PANEL OPEN BELOW · NO
          NOTCH (OR WINDOWS): A BLACK PILL AT THE TOP CENTRE
        </figcaption>
      </Note>
    </figure>
  );
}

function DesktopCharm() {
  return (
    <Section id="desktop">
      <SectionHead ix="06" label="THE DESKTOP CHARM" />
      <SectionIntro title="The charm, without the hardware.">
        No board yet? The desktop charm lives at the top of your screen: by the
        notch on a Mac, as a small black pill on Windows. It’s the same
        OpenCharm OS the board will run, about 2% of one core at rest, and a
        4&nbsp;MB app.
      </SectionIntro>
      <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <NotchDrawing />
        <PanelGrid>
          {POINTS.map((p) => (
            <Panel key={p.kick}>
              <Kicker>{p.kick}</Kicker>
              <PanelTitle>{p.title}</PanelTitle>
              <BodyText>{p.body}</BodyText>
            </Panel>
          ))}
        </PanelGrid>
      </div>
      <Actions>
        <Button asChild variant="outline">
          <a href={DOWNLOAD}>Download</a>
        </Button>
        <Button asChild variant="outline">
          <a href={DESKTOP_README}>Build it yourself</a>
        </Button>
      </Actions>
      <Note>
        THE MIC IS ON ONLY WHILE YOU HOLD THE KEY · NO CODE OR PIN TO TYPE: A
        RANDOM PIN STAYS IN YOUR KEYCHAIN · EVERY BUILD COMES WITH SHA256SUMS
      </Note>
    </Section>
  );
}

export { DesktopCharm };

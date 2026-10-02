import {
  ColourPicker,
  FacePicker,
  NameField,
  Preview,
} from "./make-it-yours-controls";
import { Section, SectionHead, SectionIntro } from "./section";

// The section is static; only the preview and the controls run on the client.
function MakeItYours() {
  return (
    <Section id="make">
      <SectionHead ix="02" label="MAKE IT YOURS" />
      <SectionIntro title="Make it yours.">
        Pick its colour, give it a name and choose a face. Every charm on this
        page follows, by the notch too. Nothing you pick here is saved or sent.
      </SectionIntro>
      <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <Preview />
        <div className="flex min-w-0 flex-col gap-7">
          <ColourPicker />
          <NameField />
          <FacePicker />
          <p className="mt-1 max-w-[62ch] text-[14px]/[1.55] text-mute">
            Set the same in the desktop charm’s Settings, or in your workspace’s
            opencharm.json: the board, the emulator and the notch all follow it,
            with its greeting, voice and how calm it moves. On the board you
            print the shell in this colour too. On a real charm, your agent’s
            state picks the face, and your agent can try on a new look when you
            ask.
          </p>
        </div>
      </div>
    </Section>
  );
}

export { MakeItYours };

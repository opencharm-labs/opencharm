import { FAQ } from "../_lib/faq";
import { OPENCHARM_MD } from "../_lib/links";
import { Panel, PanelGrid, PanelTitle } from "./panel-grid";
import { Section, SectionHead, SectionIntro } from "./section";
import { BodyText } from "./text";

function FaqSection() {
  return (
    <Section id="faq">
      <SectionHead ix="12" label="QUESTIONS" />
      <SectionIntro title="Questions people ask.">
        Short answers. The long ones are in the code and in{" "}
        <a href={OPENCHARM_MD}>OPENCHARM.md</a>.
      </SectionIntro>
      <PanelGrid>
        {FAQ.map((f) => (
          <Panel key={f.q}>
            <PanelTitle className="text-[21px]">{f.q}</PanelTitle>
            <BodyText>{f.a}</BodyText>
          </Panel>
        ))}
      </PanelGrid>
    </Section>
  );
}

export { FaqSection };

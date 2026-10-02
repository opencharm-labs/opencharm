import { Section, SectionHead, SectionIntro } from "./section";
import { UseCases } from "./use-cases";

function UsesSection() {
  return (
    <Section id="uses">
      <SectionHead ix="04" label="USE CASES" />
      <SectionIntro title="What you’ll actually use it for.">
        Whatever your agent can do, the charm does. It adds a face, a voice and
        one key; the skills and tools are your agent’s. A few examples:
      </SectionIntro>
      <UseCases />
    </Section>
  );
}

export { UsesSection };

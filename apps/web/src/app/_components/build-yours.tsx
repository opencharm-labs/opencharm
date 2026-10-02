import { Button } from "@/components/ui/button";

import { BUILD_GUIDE, REPO } from "../_lib/links";
import { Actions } from "./actions";
import { ClosingCharm } from "./closing-charm";
import { Section, SectionHead, SectionTitle } from "./section";

function BuildYours() {
  return (
    <Section id="yours" className="pb-10">
      <SectionHead ix="13" label="BUILD YOURS" />
      <div className="grid grid-cols-1 items-center gap-14 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex flex-col gap-5">
          <SectionTitle>Nothing to buy from us. Build yours.</SectionTitle>
          <p className="max-w-[520px] text-[18px]/[1.55] text-ink-2">
            Everything is open: the firmware, charmd, the shell you print and
            the build guide. Get the board, print the shell, flash it, and give
            it a name when you pair it.
          </p>
          <Actions>
            <Button asChild>
              <a href={BUILD_GUIDE}>Read the build guide</a>
            </Button>
            <Button asChild variant="outline">
              <a href={REPO}>See the code</a>
            </Button>
          </Actions>
        </div>
        <ClosingCharm />
      </div>
    </Section>
  );
}

export { BuildYours };

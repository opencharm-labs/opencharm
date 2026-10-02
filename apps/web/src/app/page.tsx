import { AgentStates, FaceLibrary } from "./_components/face-library";
import { BuildOne } from "./_components/build-one";
import { BuildYours } from "./_components/build-yours";
import { DesktopCharm } from "./_components/desktop-charm";
import { FaqSection } from "./_components/faq-section";
import { HackIt } from "./_components/hack-it";
import { Hero, KeyNumbers } from "./_components/hero";
import { HowItWorks } from "./_components/how-it-works";
import { LandingProvider } from "./_components/landing-state";
import { Lessons } from "./_components/lessons";
import { MakeItYours } from "./_components/make-it-yours";
import { ScreenAndKey } from "./_components/screen-and-key";
import { SiteHeader } from "./_components/site-header";
import { TitleBlock } from "./_components/title-block";
import { UsesSection } from "./_components/uses-section";
import { Why } from "./_components/why";
import { jsonLd } from "./_lib/structured-data";

export default function HomePage() {
  return (
    <LandingProvider>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd() }}
      />
      <div className="relative overflow-x-clip">
        {/* The drawing's margins: a scale on the left, hatching on the right, where the screen has room. */}
        <div
          className="absolute inset-y-0 left-0 hidden w-9 border-r border-rule pattern-ruler wide:block"
          aria-hidden="true"
        />
        <div
          className="absolute inset-y-0 right-0 hidden w-18 border-l border-rule pattern-hatch wide:block"
          aria-hidden="true"
        />
        {/* Padding, not the footer's margin: a margin would escape the frame and end the rulers early. */}
        <div className="relative mx-auto max-w-[1200px] px-[clamp(16px,4vw,40px)] pb-15">
          <SiteHeader />
          <main>
            <Hero />
            <KeyNumbers />
            <FaceLibrary />
            <MakeItYours />
            <AgentStates />
            <UsesSection />
            <Why />
            <DesktopCharm />
            <ScreenAndKey />
            <HowItWorks />
            <HackIt />
            <BuildOne />
            <Lessons />
            <FaqSection />
            <BuildYours />
          </main>
          <TitleBlock />
        </div>
      </div>
    </LandingProvider>
  );
}

import { Button } from "@/components/ui/button";

import { REPO } from "../_lib/links";
import desktop from "../../../../desktop/package.json";
import cli from "../../../../../packages/cli/package.json";
import { DrawingRuler } from "./drawing-ruler";
import { MobileNav, type NavLink } from "./mobile-nav";

// The date the page was built, like the date on a drawing: it changes when the page does.
const DRAWN = new Date()
  .toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
  .toUpperCase();

// The wide header shows the short list; the phone menu has room for every section.
const WIDE: NavLink[] = [
  { href: "#face", label: "THE FACE" },
  { href: "#uses", label: "WHAT IT DOES" },
  { href: "#desktop", label: "DESKTOP" },
  { href: "#how", label: "HOW IT WORKS" },
  { href: "#build", label: "BUILD" },
  { href: "#faq", label: "FAQ" },
];

const ALL: NavLink[] = [
  { href: "#face", label: "THE FACE" },
  { href: "#make", label: "MAKE IT YOURS" },
  { href: "#uses", label: "WHAT IT DOES" },
  { href: "#desktop", label: "THE DESKTOP CHARM" },
  { href: "#how", label: "HOW IT WORKS" },
  { href: "#hack", label: "HACK IT" },
  { href: "#build", label: "BUILD ONE" },
  { href: "#faq", label: "QUESTIONS" },
  { href: REPO, label: "GITHUB" },
];

function SiteHeader() {
  return (
    <>
      <div
        className="relative h-9 font-mono text-2xs tracking-label text-mute max-[23.75rem]:text-3xs max-[23.75rem]:tracking-[0.08em]"
        aria-hidden="true"
      >
        <div className="relative flex h-6.5 items-center justify-between">
          <span className="whitespace-nowrap">
            DWG OC-001 · <span className="max-sm:hidden">LANDING · </span>REV
            0.1
          </span>
          {/* Centred on the page, not between the two sides (they differ in width). */}
          <span className="absolute left-1/2 hidden -translate-x-1/2 whitespace-nowrap lg:block">
            DESKTOP v{desktop.version} · CLI v{cli.version} · MIT
          </span>
          <span className="whitespace-nowrap">
            <span className="max-sm:hidden">SHEET 1/1 · </span>
            {DRAWN}
          </span>
        </div>
        <DrawingRuler />
      </div>

      <nav
        className="relative flex items-center justify-between gap-4 pt-5.5 font-mono"
        aria-label="Main"
      >
        <a
          className="flex items-center gap-3 no-underline"
          href="#top"
          id="top"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- a 36px SVG; next/image adds nothing here */}
          <img
            className="block size-9 shrink-0 rounded-icon ring-1 ring-black/14"
            src="/icon.svg"
            alt=""
            width={36}
            height={36}
          />
          <span className="text-[16px] font-semibold tracking-[0.18em]">
            OPENCHARM
          </span>
        </a>
        <div className="flex items-center gap-2.5 text-[13px] tracking-caption lg:gap-6.5">
          {WIDE.map((l) => (
            <a
              key={l.href}
              className="hidden no-underline lg:inline"
              href={l.href}
            >
              {l.label}
            </a>
          ))}
          <MobileNav links={ALL} />
          {/* On a phone GitHub moves into the menu, so the brand keeps its room. */}
          <Button asChild size="nav" className="max-sm:hidden">
            <a href={REPO}>GITHUB</a>
          </Button>
        </div>
      </nav>
    </>
  );
}

export { SiteHeader };

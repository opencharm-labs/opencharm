import { cn } from "@/lib/utils";

type SectionProps = React.ComponentProps<"section">;

type SectionHeadProps = {
  ix: string;
  label: string;
};

type SectionIntroProps = {
  title: string;
  children: React.ReactNode;
};

// One numbered part of the drawing: generous space above, a steady rhythm inside.
function Section({ className, ...props }: SectionProps) {
  return (
    <section
      className={cn(
        "flex flex-col gap-[clamp(24px,3.4vw,40px)] pt-[clamp(72px,9vw,110px)] pb-4",
        className
      )}
      {...props}
    />
  );
}

function SectionTitle({ className, ...props }: React.ComponentProps<"h2">) {
  return (
    <h2
      className={cn(
        "max-w-[780px] text-[length:clamp(2.25rem,5.2vw,3.75rem)]/none font-semibold tracking-[-0.04em]",
        className
      )}
      {...props}
    />
  );
}

// The drawing's section rule: index tag, label, and a dashed leader to the edge.
function SectionHead({ ix, label }: SectionHeadProps) {
  return (
    <div className="flex items-center gap-3.5 font-mono text-2xs tracking-[0.16em] text-ink-2">
      <span className="rounded-[3px] bg-ink px-1.75 py-0.75 text-[12px] font-bold tracking-[0.08em] text-white">
        {ix}
      </span>
      <span>{label}</span>
      <i className="h-px grow pattern-leader" />
    </div>
  );
}

function SectionIntro({ title, children }: SectionIntroProps) {
  return (
    <div className="grid gap-5">
      <SectionTitle className="max-w-[1000px]">{title}</SectionTitle>
      <p className="max-w-[820px] text-[18px]/[1.55] text-ink-2">{children}</p>
    </div>
  );
}

export { Section, SectionHead, SectionIntro, SectionTitle };

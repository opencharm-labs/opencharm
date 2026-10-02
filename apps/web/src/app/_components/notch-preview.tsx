import { cn } from "@/lib/utils";

type Size = "default" | "compact" | "mini";

type NotchPreviewProps = {
  /** The face's two eye glyphs; they sit on the notch's ears. */
  eyes: { L: string; R: string };
  /** The glyph colour (a facesData colour's `g`); the app's default when absent. */
  glyph?: string;
  /** Who is talking: the panel's small label. */
  kicker: string;
  /** The panel's line; the panel is closed when there is none. */
  text?: string;
  /** "HOLD · YES    PRESS · NO": the two answers, split on the wide gap. */
  hint?: string;
  /** A question: the only time the panel wears orange. */
  ask?: boolean;
  dim?: boolean;
  /** compact: Make it yours' preview; mini: a use-case card, sized like the charm beside it. */
  size?: Size;
};

// One class list per part and size: the drawing keeps its proportions at every size.
const SIZES: Record<
  Size,
  {
    screen: string;
    bar: string;
    label: string;
    ear: string;
    notch: string;
    eye: string;
    panel: string;
    text: string;
    small: string;
  }
> = {
  default: {
    screen: "rounded-t-[14px] pb-6",
    bar: "h-8.5 max-xs:justify-center",
    label: "max-xs:hidden",
    ear: "h-8.5 w-11 max-xs:w-9.5",
    notch: "h-8.5 w-[clamp(80px,22%,150px)]",
    eye: "text-[22px]/none",
    panel: "w-[min(88%,380px)] gap-2 rounded-b-[22px] px-5.5 pt-4.5 pb-5.5",
    text: "text-[15px]/[1.45]",
    small: "text-3xs/[1.45]",
  },
  compact: {
    screen: "rounded-t-[10px] pb-3",
    bar: "h-8.5 max-xs:justify-center",
    label: "max-xs:hidden",
    ear: "h-8.5 w-11 max-xs:w-9.5",
    notch: "h-8.5 w-[clamp(80px,22%,150px)]",
    eye: "text-[22px]/none",
    panel: "w-[min(92%,360px)] gap-1.5 rounded-b-[18px] px-4.5 pt-3 pb-3.5",
    text: "text-[13.5px]/[1.45]",
    small: "text-3xs/[1.45]",
  },
  mini: {
    screen: "aspect-square overflow-hidden rounded-[12px]",
    bar: "h-6.5 justify-center",
    label: "hidden",
    ear: "h-6.5 w-7.5",
    notch: "h-6.5 w-[34%]",
    eye: "text-[16px]/none",
    panel: "w-[88%] gap-1 rounded-b-[14px] px-3 pt-2.25 pb-3",
    text: "text-[12px]/[1.35]",
    small: "text-[8.5px]/[1.35]",
  },
};

// The desktop charm drawn flat: the eyes on the notch's ears, the panel open below for speech and questions.
function NotchPreview({
  eyes,
  glyph,
  kicker,
  text,
  hint,
  ask = false,
  dim = false,
  size = "default",
}: NotchPreviewProps) {
  const z = SIZES[size];
  const style = glyph
    ? ({ "--glyph": glyph } as React.CSSProperties)
    : undefined;
  const eye = cn(
    "origin-[50%_55%] animate-eye-blink font-mono font-extrabold text-[color:var(--glyph,var(--color-glyph))] motion-reduce:animate-none",
    z.eye
  );
  return (
    <div className={cn("border-[1.5px] border-ink bg-card", z.screen)}>
      <div
        className={cn(
          "flex items-center border-b border-dashed border-dash px-3.5 font-mono text-2xs tracking-caption text-mute",
          z.bar
        )}
        aria-hidden="true"
      >
        <span className={cn("mr-auto", z.label)}>FINDER</span>
        <span
          className={cn(
            "grid place-items-center rounded-bl-[14px] bg-black",
            z.ear
          )}
          style={style}
        >
          <b className={eye}>{eyes.L}</b>
        </span>
        <span className={cn("bg-black", z.notch)} />
        <span
          className={cn(
            "grid place-items-center rounded-br-[14px] bg-black",
            z.ear
          )}
          style={style}
        >
          <b className={eye}>{eyes.R}</b>
        </span>
        <span className={cn("ml-auto", z.label)}>9:41</span>
      </div>
      {text ? (
        <div
          className={cn(
            "mx-auto flex flex-col bg-black text-on-night",
            z.panel,
            // A question is the only time the panel wears orange: it needs you.
            ask && "shadow-[inset_0_0_0_2px_var(--color-signal)]"
          )}
        >
          <span
            className={cn(
              "font-mono tracking-[0.16em] text-on-night-2",
              size === "mini" ? "text-[8.5px]" : "text-3xs"
            )}
          >
            {kicker}
          </span>
          <p
            className={cn(
              "font-mono font-semibold",
              z.text,
              dim && "text-on-night-2"
            )}
          >
            {text}
          </p>
          {hint ? (
            <p
              className={cn(
                "flex flex-wrap gap-x-4.5 gap-y-1 font-mono font-semibold tracking-label text-on-night",
                z.small
              )}
            >
              {hint.split(/\s{2,}/).map((part) => (
                <span key={part}>{part}</span>
              ))}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export { NotchPreview };

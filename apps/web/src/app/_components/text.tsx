import { Slot } from "radix-ui";

import { cn } from "@/lib/utils";

type TextProps<T extends "span" | "p"> = React.ComponentProps<T> & {
  asChild?: boolean;
};

// The page's three voices besides headings: a mono kicker above a title, body copy, and a mono
// footnote. Inside a solid (ink) box they switch to the light greys that read on black.

function Kicker({ className, asChild = false, ...props }: TextProps<"span">) {
  const Comp = asChild ? Slot.Root : "span";
  return (
    <Comp
      className={cn(
        "font-mono text-[12px] tracking-label text-mute in-data-[tone=solid]:font-semibold in-data-[tone=solid]:text-[#a8a8a8]",
        className
      )}
      {...props}
    />
  );
}

function BodyText({ className, asChild = false, ...props }: TextProps<"p">) {
  const Comp = asChild ? Slot.Root : "p";
  return (
    <Comp
      className={cn(
        "text-[15px]/[1.55] text-ink-2 in-data-[tone=solid]:text-[#d4d4d4]",
        className
      )}
      {...props}
    />
  );
}

function Note({ className, asChild = false, ...props }: TextProps<"p">) {
  const Comp = asChild ? Slot.Root : "p";
  return (
    <Comp
      className={cn(
        "font-mono text-2xs/[1.7] tracking-caption text-mute in-data-[tone=solid]:text-[#a8a8a8]",
        className
      )}
      {...props}
    />
  );
}

export { BodyText, Kicker, Note };

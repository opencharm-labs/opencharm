import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { Slot } from "radix-ui";

// Pill buttons in ink, with the drawing's dashed hover line (the trace utility in globals.css).
const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-3 rounded-full border-[1.5px] border-transparent font-sans whitespace-nowrap no-underline trace select-none disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default:
          "bg-primary font-semibold text-primary-foreground active:bg-ink-2",
        outline:
          "border-input bg-card font-medium text-foreground active:bg-muted",
      },
      size: {
        default: "px-6.5 py-4 text-[18px]",
        // The hero's pair, a touch smaller so both fit on one line.
        hero: "px-5.5 py-3.75 text-[17px]",
        // The header's small mono pill.
        nav: "min-h-11 px-4.5 font-mono text-[13px] font-semibold tracking-caption",
        // A small mono pill for a control inside a figure, e.g. play and pause.
        chip: "min-h-11 px-4 font-mono text-2xs font-semibold tracking-label",
      },
    },
    compoundVariants: [
      // A filled nav pill keeps its edge without a border.
      { variant: "default", size: "nav", className: "border-0" },
    ],
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot.Root : "button";

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };

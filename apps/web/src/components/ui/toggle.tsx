"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Toggle as TogglePrimitive } from "radix-ui";

import { cn } from "@/lib/utils";

// Mono labels in pills; the chosen one fills with ink.
const toggleVariants = cva(
  "inline-flex items-center justify-center rounded-full text-center font-mono tracking-caption text-foreground disabled:pointer-events-none disabled:opacity-50 data-[state=on]:bg-primary data-[state=on]:font-semibold data-[state=on]:text-primary-foreground",
  {
    variants: {
      variant: {
        // A free-standing pill, e.g. a filter.
        outline: "min-h-11 border-[1.5px] border-input bg-card",
        // One half of a segmented switch: the group draws the border.
        segment: "min-h-9.5 bg-transparent",
      },
      size: {
        default: "text-[12px]",
        // Pills that share a phone's row evenly: tighter and smaller there, so three fit.
        fluid:
          "text-[12px] max-sm:px-1.5 max-sm:py-2 max-sm:text-2xs max-sm:tracking-[0.06em]",
      },
    },
    compoundVariants: [
      { variant: "outline", className: "px-3.5 py-2.25" },
      { variant: "segment", className: "px-3.5 py-1.5" },
      {
        variant: "outline",
        size: "fluid",
        className: "max-sm:px-1.5 max-sm:py-2",
      },
    ],
    defaultVariants: {
      variant: "outline",
      size: "default",
    },
  }
);

function Toggle({
  className,
  variant = "outline",
  size = "default",
  ...props
}: React.ComponentProps<typeof TogglePrimitive.Root> &
  VariantProps<typeof toggleVariants>) {
  return (
    <TogglePrimitive.Root
      data-slot="toggle"
      data-variant={variant}
      data-size={size}
      className={cn(toggleVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Toggle, toggleVariants };

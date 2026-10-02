"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { RadioGroup as RadioGroupPrimitive } from "radix-ui";

import { cn } from "@/lib/utils";

// The upstream round radio, plus a card: the whole choice is the radio (a colour swatch, a face), and
// the chosen one takes an ink edge. Arrow keys move and select, as in any radio group.
const radioGroupItemVariants = cva(
  "outline-none disabled:cursor-not-allowed disabled:opacity-50",
  {
    variants: {
      variant: {
        default:
          "peer relative flex aspect-square size-4 shrink-0 rounded-full border border-input focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring data-checked:border-primary data-checked:bg-primary data-checked:text-primary-foreground",
        card: "relative flex min-h-11 min-w-0 flex-col items-center justify-center gap-1.5 rounded-[10px] border-[1.5px] border-border bg-card text-center tracking-widest text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring data-checked:border-primary data-checked:shadow-[inset_0_0_0_1px_var(--color-primary)]",
      },
      size: {
        default: "",
        // A colour: swatch above its name.
        swatch: "px-1 py-2.5 text-3xs/normal",
        // A face: its glyphs above its name.
        face: "px-1.5 pt-1.5 pb-2 text-4xs/normal",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

function RadioGroup({
  className,
  ...props
}: React.ComponentProps<typeof RadioGroupPrimitive.Root>) {
  return (
    <RadioGroupPrimitive.Root
      data-slot="radio-group"
      className={cn("grid w-full gap-2", className)}
      {...props}
    />
  );
}

function RadioGroupItem({
  className,
  variant = "default",
  size = "default",
  children,
  ...props
}: React.ComponentProps<typeof RadioGroupPrimitive.Item> &
  VariantProps<typeof radioGroupItemVariants>) {
  return (
    <RadioGroupPrimitive.Item
      data-slot="radio-group-item"
      data-variant={variant}
      className={cn(radioGroupItemVariants({ variant, size, className }))}
      {...props}
    >
      {variant === "card" ? (
        children
      ) : (
        <RadioGroupPrimitive.Indicator
          data-slot="radio-group-indicator"
          className="flex size-4 items-center justify-center"
        >
          <span className="absolute top-1/2 left-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary-foreground" />
        </RadioGroupPrimitive.Indicator>
      )}
    </RadioGroupPrimitive.Item>
  );
}

export { RadioGroup, RadioGroupItem, radioGroupItemVariants };

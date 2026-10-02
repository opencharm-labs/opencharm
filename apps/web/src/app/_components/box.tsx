import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

// A part on the drawing: a white card with an ink border, or a solid ink one for the part that matters.
const boxVariants = cva("border-[1.5px] border-ink", {
  variants: {
    tone: {
      paper: "bg-card",
      solid: "bg-ink text-white",
    },
  },
  defaultVariants: {
    tone: "paper",
  },
});

function Box({
  className,
  tone = "paper",
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof boxVariants>) {
  return (
    <div
      data-tone={tone}
      className={cn(boxVariants({ tone, className }))}
      {...props}
    />
  );
}

export { Box, boxVariants };

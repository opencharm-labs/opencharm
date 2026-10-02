import * as React from "react";

import { cn } from "@/lib/utils";

// A white field ruled in ink; focus uses the page's ink outline.
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "min-h-12 w-full min-w-0 rounded-[10px] border-[1.5px] border-input bg-card px-3.5 py-2.5 text-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:opacity-50",
        className
      )}
      {...props}
    />
  );
}

export { Input };

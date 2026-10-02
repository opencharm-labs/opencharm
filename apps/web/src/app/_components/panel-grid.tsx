import { cn } from "@/lib/utils";

// Panels drawn as one ruled block: each panel draws its right and bottom edge, the block its top and
// left, so every line is drawn once. One column on phones, two from a tablet up.
function PanelGrid({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "grid grid-cols-1 border-t-[1.5px] border-l-[1.5px] border-ink bg-card sm:grid-cols-2",
        className
      )}
      {...props}
    />
  );
}

function Panel({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex flex-col gap-2.5 border-r-[1.5px] border-b-[1.5px] border-ink p-6.5",
        className
      )}
      {...props}
    />
  );
}

function PanelTitle({ className, ...props }: React.ComponentProps<"h3">) {
  return (
    <h3
      className={cn("text-[24px] font-semibold tracking-[-0.02em]", className)}
      {...props}
    />
  );
}

export { Panel, PanelGrid, PanelTitle };

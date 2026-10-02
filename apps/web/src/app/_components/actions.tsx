import { cn } from "@/lib/utils";

// A row of calls to action. On phones they stack as full-width blocks: bigger to read, easier to hit.
function Actions({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-3.5 max-sm:flex-col max-sm:items-stretch max-sm:self-stretch max-sm:*:w-full",
        className
      )}
      {...props}
    />
  );
}

export { Actions };

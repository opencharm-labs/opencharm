import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";

import { Actions } from "./_components/actions";

export const metadata: Metadata = {
  title: "Not found · OpenCharm",
};

// A page that isn't on the drawing: the face says so, and one way back.
export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-svh max-w-[1200px] flex-col items-start justify-center gap-6 px-[clamp(16px,4vw,40px)]">
      <span className="rounded-[3px] bg-ink px-1.75 py-0.75 font-mono text-[12px] font-bold tracking-[0.08em] text-white">
        404
      </span>
      <p
        className="font-mono text-[length:clamp(3rem,10vw,6rem)]/none font-extrabold"
        aria-hidden="true"
      >
        o ? o
      </p>
      <h1 className="text-[length:clamp(2.25rem,5.2vw,3.75rem)]/none font-semibold tracking-[-0.04em]">
        Not on this drawing.
      </h1>
      <p className="max-w-[520px] text-[18px]/[1.55] text-ink-2">
        The page you asked for isn’t here. The charm is one page away.
      </p>
      <Actions>
        <Button asChild>
          <Link href="/">Back to OpenCharm</Link>
        </Button>
      </Actions>
    </main>
  );
}

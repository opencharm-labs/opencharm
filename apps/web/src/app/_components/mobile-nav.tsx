"use client";

import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";

type NavLink = { href: string; label: string };

// Below 980 px the header links fold into this disclosure; a plain button and a list, no menu roles to get wrong.
function MobileNav({ links }: { links: NavLink[] }) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      button.current?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="lg:hidden">
      <Button
        ref={button}
        type="button"
        variant="outline"
        size="nav"
        aria-expanded={open}
        aria-controls="mnav-list"
        onClick={() => setOpen((o) => !o)}
      >
        {open ? "CLOSE" : "MENU"}
      </Button>
      <ul
        id="mnav-list"
        className="absolute inset-x-0 top-[calc(100%+10px)] z-20 border-[1.5px] border-ink bg-card py-1 font-mono"
        hidden={!open}
      >
        {links.map((l) => (
          <li key={l.href} className="group">
            <a
              className="flex min-h-12 items-center border-b border-dashed border-rule px-4.5 text-[14px] tracking-caption no-underline group-last:border-b-0"
              href={l.href}
              onClick={() => setOpen(false)}
            >
              {l.label}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

export { MobileNav };
export type { NavLink };

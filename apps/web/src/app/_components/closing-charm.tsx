"use client";

import { useEffect } from "react";

import { useCharmDevice } from "./charm";
import { useLanding } from "./landing-state";

const TAP_MS = 1400;

// The last charm on the page says hello with the name picked above, and giggles when you tap it.
function ClosingCharm() {
  const { host, device } = useCharmDevice({ face: "joy", tappable: true });
  const { shownName } = useLanding();

  useEffect(() => {
    const hello = { face: "joy", say: `Hi! I’m ${shownName}.` };
    device?.face.set(hello);
    const hit = device?.hit;
    if (!device || !hit) return;
    let later: ReturnType<typeof setTimeout> | undefined;
    const onTap = () => {
      clearTimeout(later);
      device.face.set({ face: "cute", say: "Hehe." });
      later = setTimeout(() => device.face.set(hello), TAP_MS);
    };
    hit.addEventListener("click", onTap);
    return () => {
      hit.removeEventListener("click", onTap);
      clearTimeout(later);
    };
  }, [device, shownName]);

  return (
    <div className="px-[6%] max-lg:max-w-[340px]">
      <div ref={host} className="aspect-square" />
    </div>
  );
}

export { ClosingCharm };

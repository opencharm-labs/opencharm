import { hostname } from "node:os";

import { Bonjour } from "bonjour-service";

// Stops announcing; resolves once the goodbye has gone out.
type StopAnnouncing = () => Promise<void>;
// Announces a charmd listening on `port` (spec 002); injectable so tests don't touch the network.
type Announce = (port: number) => StopAnnouncing;

// mDNS service `_opencharm._tcp` (spec 002): a board set up with no address finds charmd by it, and
// keeps the computer's `.local` name (spec 009), so its pairing survives a new IP. Its name says
// which computer; a clash on the network is logged, never fatal.
const announceOnNetwork: Announce = (port) => {
  // The library throws on a network error by default (one interface that can't multicast, a VPN):
  // here it's logged once and charmd carries on.
  let warned = false;
  const bonjour = new Bonjour({}, (error: unknown) => {
    if (warned) return;
    warned = true;
    console.error(`charmd: mDNS: ${String(error)}`);
  });
  const computer = hostname().replace(/\.local$/, "");
  const service = bonjour.publish({
    name: `OpenCharm on ${computer}`,
    type: "opencharm",
    port,
    txt: { path: "/charm" },
  });
  service.on("error", (error: unknown) => {
    console.error(
      `charmd: couldn't announce itself on the network: ${String(error)}`
    );
  });
  return () =>
    new Promise<void>((resolve) => {
      bonjour.unpublishAll(() => {
        bonjour.destroy();
        resolve();
      });
    });
};

export { announceOnNetwork };
export type { Announce, StopAnnouncing };

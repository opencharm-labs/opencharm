import { execFileSync } from "node:child_process";
import { hostname, platform } from "node:os";

import { Bonjour, type Service } from "bonjour-service";

// Stops announcing; resolves once the goodbye has gone out.
type StopAnnouncing = () => Promise<void>;
// Announces a charmd listening on `port` (spec 002); injectable so tests don't touch the network.
type Announce = (port: number) => StopAnnouncing;

// mDNS service `_opencharm._tcp` (spec 002): a board set up with no address finds charmd by it, and
// keeps the computer's `.local` name (spec 009), so its pairing survives a new IP. Its name says
// which computer; a clash on the network is logged, never fatal.
// The name a board can resolve: `<label>.local`. A board's mDNS only takes `.local` names, and a
// Mac's hostname may be a DHCP one ("my-mac.fritz.box"), so on a Mac its LocalHostName (what
// macOS answers for), elsewhere the first label of the hostname.
// `system`: the name is macOS's own LocalHostName, which macOS answers for.
function localHost(): { host: string; system: boolean } {
  let label = "";
  if (platform() === "darwin") {
    try {
      label = execFileSync("scutil", ["--get", "LocalHostName"], {
        encoding: "utf8",
        timeout: 2000,
      }).trim();
    } catch {
      label = "";
    }
  }
  if (/^[A-Za-z0-9-]{1,63}$/.test(label))
    return { host: `${label}.local`, system: true };
  return { host: `${hostname().split(".")[0] ?? ""}.local`, system: false };
}

// On a Mac, macOS answers for `<LocalHostName>.local` itself. The library would claim that name
// too, with every address of this computer, which macOS takes as a clash: it renames the computer
// ("my-mac-2.local"), so a board that saved the old name can't find it, and the goodbye on stop would
// tell the network the name is gone. So there only the service is announced and macOS keeps its name.
function leaveHostToSystem(service: Service): void {
  const records = service.records.bind(service);
  service.records = () =>
    records().filter((record) => record.type !== "A" && record.type !== "AAAA");
}

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
  const { host, system } = localHost();
  const service = bonjour.publish({
    name: `OpenCharm on ${computer}`,
    host,
    type: "opencharm",
    port,
    txt: { path: "/charm" },
  });
  // In time: with probing (the default) the library reads the records only after publish returns.
  if (system) leaveHostToSystem(service);
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

export { announceOnNetwork, leaveHostToSystem };
export type { Announce, StopAnnouncing };

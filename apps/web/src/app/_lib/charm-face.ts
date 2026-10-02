import type { Colour } from "@opencharm-labs/design/types";

type FaceSetOptions = {
  face?: string;
  say?: string;
  hint?: string;
  dim?: boolean;
  instant?: boolean;
};

type FaceOptions = {
  face?: string;
  colour?: Colour;
  idle?: boolean;
  animate?: boolean;
};

type CharmFaceInstance = {
  el: HTMLElement;
  visible: boolean;
  set(options: FaceSetOptions): CharmFaceInstance;
  setColour(colour: Colour): CharmFaceInstance;
  followIn(area: HTMLElement): CharmFaceInstance;
};

type DeviceOptions = FaceOptions & {
  cord?: boolean;
  tappable?: boolean;
  shape?: "device" | "icon";
};

type CharmDevice = {
  el: HTMLElement;
  face: CharmFaceInstance;
  setColour(colour: Colour): void;
  setKey(css: string): void;
  hit?: HTMLButtonElement;
};

type CharmFaceApi = {
  reduceMotion: boolean;
  Face: new (host: HTMLElement, options: FaceOptions) => CharmFaceInstance;
  device(host: HTMLElement, options: DeviceOptions): CharmDevice;
};

declare global {
  interface Window {
    CharmFace?: CharmFaceApi;
  }
}

let loading: Promise<CharmFaceApi> | undefined;

// The engine is a plain browser script that attaches window.CharmFace, so it can only run on the client.
// Its canvas draws in Geist Mono, so wait for the fonts or the first frames use the fallback.
function loadCharmFace(): Promise<CharmFaceApi> {
  loading ??= (async () => {
    // @ts-expect-error -- a plain browser script with no exports; importing it runs it.
    await import("@opencharm-labs/design/charm-face.js");
    await document.fonts.ready;
    const api = window.CharmFace;
    if (!api) throw new Error("charm-face.js did not attach window.CharmFace");
    return api;
  })();
  return loading;
}

export { loadCharmFace };
export type {
  CharmDevice,
  CharmFaceApi,
  CharmFaceInstance,
  DeviceOptions,
  FaceSetOptions,
};

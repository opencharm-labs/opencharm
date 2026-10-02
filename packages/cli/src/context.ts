import type { Style } from "./terminal";

type CliContext = {
  out: NodeJS.WriteStream;
  err: NodeJS.WriteStream;
  style: Style;
  canAnimate: boolean;
  version: string;
  signal: string;
};

export type { CliContext };

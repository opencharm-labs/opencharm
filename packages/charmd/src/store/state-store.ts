import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";

import { z } from "zod";

const recordSchema = z.object({
  id: z.string().regex(/^c_[a-z0-9]{6,}$/),
  name: z.string().min(1).max(40),
  tokenHash: z.string().regex(/^[0-9a-f]{64}$/),
  pinHash: z.string().min(1),
  failedTries: z.number().int().min(0),
  blocked: z.boolean(),
  createdAt: z.string(),
});
const stateSchema = z.object({
  version: z.literal(1),
  charms: z.array(recordSchema),
});

type CharmRecord = z.infer<typeof recordSchema>;
type State = z.infer<typeof stateSchema>;

// One small JSON file is enough for a handful of charms; writes go to a temp file and are renamed
// into place, so a crash mid-write never leaves a half-written state.
class StateStore {
  readonly #path: string;
  #state: State;

  constructor(path: string) {
    this.#path = path;
    this.#state = StateStore.#read(path);
  }

  static #read(path: string): State {
    if (!existsSync(path)) return { version: 1, charms: [] };
    try {
      return stateSchema.parse(JSON.parse(readFileSync(path, "utf8")));
    } catch (error) {
      throw new Error(
        `The charmd state file ${path} is unreadable (${error instanceof Error ? error.message : String(error)}). Fix or move it; charmd won't overwrite it.`
      );
    }
  }

  #write(): void {
    mkdirSync(dirname(this.#path), { recursive: true, mode: 0o700 });
    const temp = `${this.#path}.${process.pid}.tmp`;
    writeFileSync(temp, `${JSON.stringify(this.#state, null, 2)}\n`, {
      mode: 0o600,
    });
    renameSync(temp, this.#path);
    chmodSync(this.#path, 0o600);
  }

  list(): CharmRecord[] {
    return this.#state.charms.map((charm) => ({ ...charm }));
  }

  find(idOrName: string): CharmRecord | undefined {
    return this.#state.charms.find(
      (charm) => charm.id === idOrName || charm.name === idOrName
    );
  }

  findByTokenHash(tokenHash: string): CharmRecord | undefined {
    return this.#state.charms.find((charm) => charm.tokenHash === tokenHash);
  }

  put(record: CharmRecord): void {
    const next = recordSchema.parse(record);
    this.#state.charms = [
      ...this.#state.charms.filter((charm) => charm.id !== next.id),
      next,
    ];
    this.#write();
  }

  remove(id: string): void {
    this.#state.charms = this.#state.charms.filter((charm) => charm.id !== id);
    this.#write();
  }
}

export { StateStore };
export type { CharmRecord };

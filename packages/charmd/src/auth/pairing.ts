import { generatePairCode } from "./secrets";

type PairingOptions = {
  ttlMs: number;
  maxPending: number;
  now?: () => number;
  generate?: () => string;
};
type Pending = { code: string; connectionId: string; expiresAt: number };

// Codes live only in memory: a restart simply issues new ones, and nothing guessable is ever stored.
class PairingRegistry {
  readonly #options: Required<PairingOptions>;
  readonly #byCode = new Map<string, Pending>();

  constructor(options: PairingOptions) {
    this.#options = {
      now: Date.now,
      generate: generatePairCode,
      ...options,
    };
  }

  #prune(): void {
    const now = this.#options.now();
    for (const [code, pending] of this.#byCode) {
      if (pending.expiresAt <= now) this.#byCode.delete(code);
    }
  }

  issue(connectionId: string): { code: string; expiresIn: number } {
    this.#prune();
    this.release(connectionId);
    if (this.#byCode.size >= this.#options.maxPending) {
      throw new Error("Too many charms waiting to pair; try again shortly.");
    }
    let code = this.#options.generate();
    while (this.#byCode.has(code)) code = this.#options.generate();
    this.#byCode.set(code, {
      code,
      connectionId,
      expiresAt: this.#options.now() + this.#options.ttlMs,
    });
    return { code, expiresIn: Math.round(this.#options.ttlMs / 1000) };
  }

  claim(code: string): string | undefined {
    this.#prune();
    const pending = this.#byCode.get(code);
    if (!pending) return undefined;
    this.#byCode.delete(code);
    return pending.connectionId;
  }

  // The codes now valid: which connection shows each, and for how many more seconds.
  waiting(): { code: string; connectionId: string; expiresIn: number }[] {
    this.#prune();
    const now = this.#options.now();
    return [...this.#byCode.values()].map((p) => ({
      code: p.code,
      connectionId: p.connectionId,
      expiresIn: Math.max(0, Math.round((p.expiresAt - now) / 1000)),
    }));
  }

  release(connectionId: string): void {
    for (const [code, pending] of this.#byCode) {
      if (pending.connectionId === connectionId) this.#byCode.delete(code);
    }
  }
}

export { PairingRegistry };
export type { PairingOptions };

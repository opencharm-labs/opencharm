// Text-to-speech starts per sentence, so the first words play while the agent is still writing.
// Very short sentences are joined to the next one: one call per "Hi." sounds choppy and costs latency.
const MIN_CHARS = 10;
const ABBREVIATIONS = new Set([
  "e.g.",
  "i.e.",
  "dr.",
  "mr.",
  "mrs.",
  "ms.",
  "st.",
  "vs.",
  "no.",
]);
const BOUNDARY = /[.!?…]+(?=\s)|\n+/g;
// The reply's first words go out at a clause ("Done, I restarted it") once it's long enough to sound
// natural, so the first audio doesn't wait for a long first sentence (spec 003).
const FIRST_BOUNDARY = /[.!?…]+(?=\s)|[,;:](?=\s)|\n+/g;
const FIRST_CLAUSE_CHARS = 20;

class SentenceSplitter {
  #buffer = "";
  #pending = "";
  #started = false;
  readonly #firstClause: boolean;

  constructor(options: { firstClause?: boolean } = {}) {
    this.#firstClause = options.firstClause ?? true;
  }

  #take(piece: string): string[] {
    const text = piece.replace(/\s+/g, " ").trim();
    if (!text) return [];
    this.#pending = this.#pending ? `${this.#pending} ${text}` : text;
    if (this.#pending.length < MIN_CHARS) return [];
    const out = this.#pending;
    this.#pending = "";
    this.#started = true;
    return [out];
  }

  push(chunk: string): string[] {
    this.#buffer += chunk;
    const out: string[] = [];
    let start = 0;
    for (const match of this.#buffer.matchAll(
      this.#started || !this.#firstClause ? BOUNDARY : FIRST_BOUNDARY
    )) {
      const end = match.index + match[0].length;
      const clause = /^[,;:]/.test(match[0]);
      if (
        clause &&
        (this.#started ||
          this.#pending.length + end - start < FIRST_CLAUSE_CHARS)
      )
        continue;
      const lastWord =
        this.#buffer
          .slice(start, end)
          .trim()
          .split(/\s+/)
          .at(-1)
          ?.toLowerCase() ?? "";
      if (match[0].startsWith(".") && ABBREVIATIONS.has(lastWord)) continue;
      out.push(...this.#take(this.#buffer.slice(start, end)));
      start = end;
    }
    this.#buffer = this.#buffer.slice(start);
    return out;
  }

  flush(): string[] {
    const rest = this.#take(this.#buffer);
    this.#buffer = "";
    const tail = this.#pending;
    this.#pending = "";
    return tail ? [...rest, tail] : rest;
  }
}

// Agents answer in markdown out of habit; spoken aloud, the symbols would be read or cause pauses.
function cleanForSpeech(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^\s*(?:#{1,6}|[-*+]|\d+\.)\s+/gm, "")
    .replace(/[*_`~#>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export { SentenceSplitter, cleanForSpeech };

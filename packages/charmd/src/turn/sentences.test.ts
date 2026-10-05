import { describe, expect, it } from "vitest";

import { SentenceSplitter, cleanForSpeech } from "./sentences";

function split(chunks: string[]): string[] {
  const splitter = new SentenceSplitter();
  const out = chunks.flatMap((c) => splitter.push(c));
  return [...out, ...splitter.flush()];
}

describe("SentenceSplitter", () => {
  it("emits a sentence as soon as it ends, even mid-stream", () => {
    const splitter = new SentenceSplitter();
    expect(splitter.push("You have two meet")).toEqual([]);
    expect(splitter.push("ings today. The first")).toEqual([
      "You have two meetings today.",
    ]);
    expect(splitter.flush()).toEqual(["The first"]);
  });

  it("splits on ! ? … and line breaks", () => {
    expect(split(["Yes, really! Is that right?\nWell… okay then"])).toEqual([
      "Yes, really!",
      "Is that right?",
      "Well… okay then",
    ]);
  });

  it("keeps very short pieces together so speech doesn't stutter", () => {
    expect(split(["Hi. I'm here. Ask me anything."])).toEqual([
      "Hi. I'm here.",
      "Ask me anything.",
    ]);
  });

  it("does not split decimals or common abbreviations", () => {
    expect(
      split([
        "Here you go. It costs 3.50 dollars, e.g. at Dr. Smith's shop today.",
      ])
    ).toEqual([
      "Here you go.",
      "It costs 3.50 dollars, e.g. at Dr. Smith's shop today.",
    ]);
  });

  it("lets the reply's first clause go early once it's 20 characters long, then only whole sentences", () => {
    expect(
      split(["Done, I restarted the server; it answers now, and fast."])
    ).toEqual(["Done, I restarted the server;", "it answers now, and fast."]);
    expect(split(["Hmm, okay. Sure."])).toEqual(["Hmm, okay.", "Sure."]);
    expect(
      split(["Fatto, ho aggiornato il file", " di configurazione."])
    ).toEqual(["Fatto, ho aggiornato il file di configurazione."]);
  });

  it("keeps whole sentences when asked to (replies shown as text)", () => {
    const splitter = new SentenceSplitter({ firstClause: false });
    expect(
      splitter.push("Done, I restarted the server; it answers now. ")
    ).toEqual(["Done, I restarted the server; it answers now."]);
  });

  it("returns nothing for whitespace", () => {
    expect(split(["  ", "\n"])).toEqual([]);
  });
});

describe("cleanForSpeech", () => {
  it("drops markdown symbols and keeps link text", () => {
    expect(
      cleanForSpeech("**Two** meetings: `standup` and [review](https://x.y)")
    ).toBe("Two meetings: standup and review");
  });

  it("drops list and heading markers", () => {
    expect(cleanForSpeech("## Today\n- first\n* second\n1. third")).toBe(
      "Today first second third"
    );
  });
});

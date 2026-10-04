import { describe, expect, it } from "vitest";

import { guessLanguage } from "./language";

describe("guessing a language from words", () => {
  it("tells English from Italian in what the maintainer actually said", () => {
    expect(guessLanguage("What's on my calendar tomorrow?")).toBe("en");
    expect(
      guessLanguage("Run npm test and tell me which test failed in charmd.")
    ).toBe("en");
    expect(guessLanguage("Fammi un riassunto delle mail di oggi.")).toBe("it");
    expect(
      guessLanguage(
        "Apri il file package.json e aggiorna la dependency di TypeScript."
      )
    ).toBe("it");
    expect(
      guessLanguage("Ci sono tre email nuove. La più importante è di Marco.")
    ).toBe("it");
  });

  it("knows Spanish, French, German and Portuguese too", () => {
    expect(guessLanguage("¿Qué tengo en el calendario para mañana?")).toBe(
      "es"
    );
    expect(
      guessLanguage("Qu'est-ce que j'ai dans mon agenda pour demain ?")
    ).toBe("fr");
    expect(guessLanguage("Was steht morgen in meinem Kalender, bitte?")).toBe(
      "de"
    );
    expect(guessLanguage("O que tenho na agenda para amanhã?")).toBe("pt");
  });

  it("says nothing when unsure, so the language already in use stays", () => {
    expect(guessLanguage("OK.")).toBeUndefined();
    expect(guessLanguage("Vercel, npm, TypeScript.")).toBeUndefined();
    expect(guessLanguage("")).toBeUndefined();
  });

  it("only picks among the languages it's asked about", () => {
    expect(
      guessLanguage("Fammi un riassunto delle mail di oggi.", ["en"])
    ).toBeUndefined();
  });
});

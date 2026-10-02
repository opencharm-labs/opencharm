import { FAQ } from "./faq";
import { RELEASES, REPO } from "./links";

const SITE = "https://opencharm.dev";
const ORG = `${SITE}/#organization`;
const FREE = { "@type": "Offer", price: "0", priceCurrency: "USD" };

// The page's JSON-LD: who makes it, the two things you can run, and the FAQ as people see it on the page.
export function structuredData() {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": ORG,
        name: "OpenCharm",
        url: SITE,
        logo: `${SITE}/icon-512.png`,
        sameAs: [REPO],
      },
      {
        "@type": "WebSite",
        "@id": `${SITE}/#website`,
        url: SITE,
        name: "OpenCharm",
        inLanguage: "en",
        publisher: { "@id": ORG },
      },
      {
        "@type": "SoftwareApplication",
        "@id": `${SITE}/#desktop-charm`,
        name: "OpenCharm desktop charm",
        description:
          "The charm without the hardware: OpenCharm OS at the top of your screen (by the notch on a Mac, a black pill on Windows), with a talk key that works in any app and a panel for answers and questions. Built by the repository’s CI, with checksums, on GitHub Releases.",
        applicationCategory: "UtilitiesApplication",
        operatingSystem: "macOS, Windows",
        downloadUrl: RELEASES,
        isAccessibleForFree: true,
        offers: FREE,
        publisher: { "@id": ORG },
      },
      {
        "@type": "SoftwareApplication",
        "@id": `${SITE}/#cli`,
        name: "opencharm",
        description:
          "The OpenCharm command line: opencharm init, serve (charmd, the charm daemon), pair and sim. Runs from source with Node.js today; the npm package is coming.",
        applicationCategory: "DeveloperApplication",
        operatingSystem: "Node.js",
        url: `${REPO}/tree/main/packages/cli`,
        isAccessibleForFree: true,
        offers: FREE,
        publisher: { "@id": ORG },
      },
      {
        "@type": "FAQPage",
        "@id": `${SITE}/#faq`,
        mainEntity: FAQ.map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
      },
    ],
  };
}

// JSON.stringify leaves "<" alone; escaping it keeps a stray "</script>" from closing the tag.
export function jsonLd(): string {
  return JSON.stringify(structuredData()).replace(/</g, "\\u003c");
}

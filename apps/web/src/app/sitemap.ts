import type { MetadataRoute } from "next";

// The page is rebuilt whenever it changes, so the build time is when it last changed.
const BUILT = new Date();

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: "https://opencharm.dev",
      lastModified: BUILT,
      changeFrequency: "monthly",
      priority: 1,
    },
    {
      url: "https://opencharm.dev/llms.txt",
      lastModified: BUILT,
      changeFrequency: "monthly",
      priority: 0.5,
    },
  ];
}

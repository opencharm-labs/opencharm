// The voice models' first download (about 600 MB), as charmd reports it (voice_progress), in words.
// A failed one is tried again on a turn a few minutes later (packages/charmd/src/voice/models.ts).
export function describeModels(models) {
  const loading = models.filter((m) => m.includes(" downloading "));
  const failed = models
    .filter((m) => m.endsWith(" failed"))
    .map((m) => m.replace(/ failed$/, ""));
  return [
    loading.length
      ? `Getting its voice ready, the first time only: ${loading.join(", ")}.`
      : "",
    failed.length
      ? `Couldn't download ${failed.join(" and ")}; it tries again in a few minutes, when you talk.`
      : "",
  ]
    .filter(Boolean)
    .join(" ");
}

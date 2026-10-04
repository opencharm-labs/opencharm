import type { BuildIdentity } from "./build-identity";

// What this deploy is (spec 015), as next.config.ts computed it at build time: the one place the
// title block and /version.json read it from.
function siteIdentity(): BuildIdentity {
  const built = process.env.OPENCHARM_WEB_IDENTITY;
  return built
    ? (JSON.parse(built) as BuildIdentity)
    : { version: "web@dev", commit: "local", text: "web@dev (local)" };
}

export { siteIdentity };

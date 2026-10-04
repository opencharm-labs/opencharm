// What this deploy is (spec 015), for bug reports and reference: a static file at /version.json.
export const dynamic = "force-static";

export function GET(): Response {
  const version = process.env.OPENCHARM_WEB_VERSION ?? "web@dev";
  const commit = process.env.OPENCHARM_WEB_COMMIT ?? "local";
  return Response.json({ version, commit, text: `${version} (${commit})` });
}

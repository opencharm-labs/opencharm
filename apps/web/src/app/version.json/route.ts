import { siteIdentity } from "@/lib/site-identity";

// What this deploy is (spec 015), for bug reports and reference: a static file at /version.json.
export const dynamic = "force-static";

export function GET(): Response {
  return Response.json(siteIdentity());
}

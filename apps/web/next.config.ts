import type { NextConfig } from "next";

import { buildIdentity } from "./src/lib/build-identity";

// What this deploy is (spec 015), computed once and inlined into the page and /version.json.
const BUILD = buildIdentity();

// A static page that loads nothing from other origins (HSTS keeps it on https, so no request ever
// needs upgrading). Inline scripts stay allowed: a statically
// rendered page can't carry per-request nonces, and Next.js inlines its bootstrap. Development adds
// eval for React's tooling.
const CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: CSP },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains",
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  // The page itself never needs these; the charm's microphone lives in the app, not here.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  },
];

const nextConfig: NextConfig = {
  env: {
    OPENCHARM_WEB_VERSION: BUILD.version,
    OPENCHARM_WEB_COMMIT: BUILD.commit,
  },
  // Memoises components at build time, so the page needs no hand-written useMemo or useCallback.
  reactCompiler: true,
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;

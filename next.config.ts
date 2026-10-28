import type { NextConfig } from "next";

/**
 * Sites allowed to show MeaningEngine inside an iframe (IoG's website and program pages).
 * Override with EMBED_ALLOWED_ORIGINS, space-separated, at build time.
 */
const embedOrigins =
  process.env.EMBED_ALLOWED_ORIGINS?.trim() || "https://instituteongenerosity.org https://*.instituteongenerosity.org";

const securityHeaders = [
  // Only this site and IoG's sites may embed the tool; this also blocks clickjacking elsewhere.
  { key: "Content-Security-Policy", value: `frame-ancestors 'self' ${embedOrigins}` },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Route handlers read these at runtime; make sure Vercel bundles them.
  outputFileTracingIncludes: {
    "/api/**": ["./config/**", "./prompts/**"],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;

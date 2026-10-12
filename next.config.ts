import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Route handlers read these at runtime; make sure Vercel bundles them.
  outputFileTracingIncludes: {
    "/api/**": ["./config/**", "./prompts/**"],
  },
};

export default nextConfig;

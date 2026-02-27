import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow large PDF payloads on the /api/evaluate route
  experimental: {
    serverActions: {
      bodySizeLimit: "25mb",
    },
  },
  // Disable Turbopack — workaround for panic bug with Japanese characters in path
  turbopack: undefined,
};

export default nextConfig;

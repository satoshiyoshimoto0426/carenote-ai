import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ワークスペース根の誤推定対策: 親フォルダに別の package-lock.json があるため、
  // Next が C:\Users\vivid を根と誤認し、ビルドのトレース収集が OneDrive 全体を
  // 走査して固まる（2026-07-07 ビルド7分超タイムアウトの原因）。本プロジェクトに限定する。
  outputFileTracingRoot: __dirname,
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

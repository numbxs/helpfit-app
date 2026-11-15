import type { NextConfig } from "next";

// Changes on every deploy so the service worker picks up new app shells.
const buildVersion =
  process.env.BUILD_VERSION ?? process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 10) ?? Date.now().toString(36);

const nextConfig: NextConfig = {
  // Docker builds set NEXT_OUTPUT=standalone; `next start` and Vercel use the default output.
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
  poweredByHeader: false,
  devIndicators: false,
  env: { NEXT_PUBLIC_BUILD_VERSION: buildVersion },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
        ],
      },
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;

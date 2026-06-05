import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pg-native"],
  async headers() {
    return [
      {
        // Never cache HTML pages — always fetch fresh from server.
        // Next.js static assets (_next/static/*) are content-hashed and
        // safe to cache long-term; only the HTML shell needs busting.
        source: "/((?!_next/static|_next/image|favicon).*)",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Pragma", value: "no-cache" },
          { key: "Expires", value: "0" },
        ],
      },
    ];
  },
};

export default nextConfig;

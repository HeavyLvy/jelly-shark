import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  experimental: {
    agentFeedback: true,
  },
  cacheComponents: true,
  partialPrefetching: true,
  images: {
    // Jellyfin resizes images itself; see lib/jellyfin/image-loader.ts.
    loader: "custom",
    loaderFile: "./lib/jellyfin/image-loader.ts",
    qualities: [75, 80, 85],
  },
};

export default nextConfig;

import { networkInterfaces } from "node:os";
import type { NextConfig } from "next";

/**
 * This machine's LAN IPv4 addresses, so the dev server can be opened from other
 * devices on the network (e.g. a phone at http://192.168.1.x:3100). Next blocks
 * cross-origin requests to dev-only assets unless the host is listed here.
 */
const lanHosts = Object.values(networkInterfaces())
  .flat()
  .filter((i) => i && i.family === "IPv4" && !i.internal)
  .map((i) => i!.address);

const nextConfig: NextConfig = {
  /* config options here */
  experimental: {
    agentFeedback: true,
  },
  // Self-contained server bundle (.next/standalone) for the container image.
  output: "standalone",
  allowedDevOrigins: lanHosts,
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

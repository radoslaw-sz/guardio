import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    // When run from .guardio-dashboard (bin), ensure project root is cwd so Next is resolvable
    root: process.cwd(),
  },
  webpack: (config) => {
    // optional webpack tweaks
    return config;
  },
};

export default nextConfig;
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // "standalone" output is only for the Docker build (docker/Dockerfile
  // copies .next/standalone). Vercel has its own build output format and
  // this setting breaks routing there, so skip it when building on Vercel.
  output: process.env.VERCEL ? undefined : "standalone",
};

export default nextConfig;

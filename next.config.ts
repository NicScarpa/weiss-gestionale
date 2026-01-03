import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";

const withSerwist = withSerwistInit({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
});

const nextConfig: NextConfig = {
  // Use webpack for production builds (required by Serwist)
  // Turbopack will still be used for dev
  turbopack: {},
};

export default withSerwist(nextConfig);

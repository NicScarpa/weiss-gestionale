import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";
import { withSentryConfig } from "@sentry/nextjs";

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

// Configurazione Sentry
const sentryConfig = {
  // Organizzazione e progetto Sentry (configurare in .env)
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,

  // Carica source maps solo in produzione
  silent: process.env.NODE_ENV !== "production",

  // Upload source maps per debugging migliore
  widenClientFileUpload: true,

  // Route tutte le richieste del tunnel tramite Next.js
  tunnelRoute: "/monitoring",

  // Nascondi source maps dal client
  hideSourceMaps: true,

  // Disabilita tree shaking di Sentry (può causare problemi)
  disableLogger: true,

  // Automaticamente instrumenta API routes
  automaticVercelMonitors: true,
};

// Esporta la configurazione con Serwist e Sentry
export default withSentryConfig(
  withSerwist(nextConfig),
  sentryConfig
);

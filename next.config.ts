import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";
import { withSentryConfig } from "@sentry/nextjs";

const withSerwist = withSerwistInit({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
});

const nextConfig: NextConfig = {
  serverExternalPackages: ['pg'],
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self)' },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https:",
              "font-src 'self' data:",
              "connect-src 'self' https://*.sentry.io https://*.upstash.io wss:",
              "frame-ancestors 'none'",
            ].join('; '),
          },
        ],
      },
    ]
  },
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

  // Configurazione webpack per Sentry
  webpack: {
    treeshake: {
      removeDebugLogging: true,
    },
    automaticVercelMonitors: true,
  },
};

// Esporta la configurazione con Serwist e Sentry
export default withSentryConfig(
  withSerwist(nextConfig),
  sentryConfig
);

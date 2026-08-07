import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

// Il service worker non si costruisce più qui: `withSerwist` è un plugin
// webpack e da Next 16 la build passa da Turbopack, che lo ignorava in
// silenzio lasciando la PWA senza service worker. Ora lo compila la CLI di
// Serwist, configurata in serwist.config.mjs ed eseguita da `npm run build`.
const nextConfig: NextConfig = {
  // pdf-parse trascina pdfjs-dist, che al bundling tocca API di browser
  // (DOMMatrix) assenti in Node: va lasciato esterno e caricato a runtime.
  serverExternalPackages: ['pg', 'pdf-parse'],
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

// L'upload dei source map a Sentry richiede un token: senza, il build deve
// procedere in silenzio invece di riempire i log di avvisi. Nessuno deve avere
// bisogno di un account Sentry per compilare il progetto.
const sentryAuthToken = process.env.SENTRY_AUTH_TOKEN;

// Configurazione Sentry
const sentryConfig = {
  // Organizzazione e progetto Sentry (configurare in .env)
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: sentryAuthToken,

  silent: !sentryAuthToken,

  sourcemaps: {
    disable: !sentryAuthToken,
  },

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
    // La produzione gira su Railway: i cron monitor di Vercel non esistono.
    automaticVercelMonitors: false,
  },
};

// Esporta la configurazione con Sentry
export default withSentryConfig(
  nextConfig,
  sentryConfig
);

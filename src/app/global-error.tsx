'use client'

import { useEffect } from 'react'
import * as Sentry from '@sentry/nextjs'

/**
 * Ultima rete di sicurezza: cattura gli errori di rendering che sfuggono a
 * ogni altro error boundary, compresi quelli del root layout. Sostituisce
 * l'intera pagina, quindi deve produrre da sé <html> e <body> e non può
 * contare sul CSS globale: gli stili sono in linea di proposito.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <html lang="it">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif',
          background: '#fafafa',
          color: '#18181b',
        }}
      >
        <main style={{ maxWidth: '32rem', padding: '2rem', textAlign: 'center' }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 600, marginBottom: '0.75rem' }}>
            Qualcosa è andato storto
          </h1>
          <p style={{ lineHeight: 1.6, marginBottom: '1.5rem' }}>
            La pagina non è riuscita a caricarsi. L&apos;errore è stato segnalato:
            riprova, e se continua a succedere avvisa l&apos;amministratore.
          </p>
          {error.digest && (
            <p style={{ fontSize: '0.8rem', color: '#71717a', marginBottom: '1.5rem' }}>
              Codice errore: <code>{error.digest}</code>
            </p>
          )}
          <button
            type="button"
            onClick={reset}
            style={{
              padding: '0.6rem 1.25rem',
              fontSize: '0.95rem',
              borderRadius: '0.5rem',
              border: 'none',
              background: '#18181b',
              color: '#fafafa',
              cursor: 'pointer',
            }}
          >
            Riprova
          </button>
        </main>
      </body>
    </html>
  )
}

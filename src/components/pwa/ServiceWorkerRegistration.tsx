'use client'

import { useEffect } from 'react'

/**
 * Registra il service worker della PWA.
 *
 * Prima lo faceva il plugin `withSerwist` di next.config.ts, che iniettava lo
 * script di registrazione nel bundle. Ora che il service worker è compilato
 * dalla CLI di Serwist (perché il plugin, essendo webpack, veniva ignorato da
 * Turbopack), la registrazione va fatta esplicitamente: senza, il file esiste
 * ma il browser non lo installa, e non c'è né offline né push.
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    // In sviluppo il service worker non viene compilato: registrarlo
    // servirebbe solo a produrre un 404 nella console.
    if (process.env.NODE_ENV !== 'production') return

    const registra = () => {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
        // Un service worker mancante non deve impedire l'uso dell'applicazione.
      })
    }

    if (document.readyState === 'complete') {
      registra()
    } else {
      window.addEventListener('load', registra, { once: true })
      return () => window.removeEventListener('load', registra)
    }
  }, [])

  return null
}

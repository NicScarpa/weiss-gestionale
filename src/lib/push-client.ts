/**
 * Sottoscrizione alle notifiche push, lato browser.
 *
 * Finora questo pezzo non esisteva: la UI chiedeva il permesso delle notifiche
 * e poi si fermava lì, senza mai registrare il dispositivo. Il permesso da solo
 * non fa arrivare nulla — serve una sottoscrizione presso il push service del
 * browser, e va consegnata al server.
 */

export type StatoPush =
  /** Il browser non supporta le notifiche push (o non siamo in un contesto sicuro). */
  | 'non-supportato'
  /** Il server non ha le chiavi VAPID: nessuna notifica può partire. */
  | 'non-configurato'
  /** L'utente ha negato il permesso dalle impostazioni del browser. */
  | 'negato'
  /** Tutto pronto, ma questo dispositivo non è ancora sottoscritto. */
  | 'da-attivare'
  /** Dispositivo sottoscritto: le notifiche arrivano. */
  | 'attivo'

export interface DiagnosiPush {
  stato: StatoPush
  /** Spiegazione mostrabile all'utente. */
  dettaglio: string
}

interface RispostaConfig {
  configured: boolean
  publicKey: string | null
}

/**
 * Il browser supporta il push? Richiede service worker, PushManager e un
 * contesto sicuro (https o localhost).
 */
export function pushSupportato(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window &&
    window.isSecureContext
  )
}

/**
 * La chiave VAPID viaggia in base64url; `applicationServerKey` vuole i byte.
 */
function base64UrlToUint8Array(base64Url: string): Uint8Array {
  const padding = '='.repeat((4 - (base64Url.length % 4)) % 4)
  const base64 = (base64Url + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = window.atob(base64)
  const output = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) {
    output[i] = raw.charCodeAt(i)
  }
  return output
}

async function leggiConfigurazione(): Promise<RispostaConfig> {
  const res = await fetch('/api/notifications/config')
  if (!res.ok) {
    throw new Error('Impossibile leggere la configurazione delle notifiche')
  }
  return res.json()
}

/**
 * Nome leggibile del browser, per distinguere i dispositivi nell'elenco.
 */
function descriviDispositivo(): { deviceName: string; deviceType: 'ios' | 'android' | 'web'; browserName: string } {
  const ua = navigator.userAgent

  const browserName = /Edg\//.test(ua)
    ? 'Edge'
    : /Chrome\//.test(ua) && !/Chromium/.test(ua)
      ? 'Chrome'
      : /Firefox\//.test(ua)
        ? 'Firefox'
        : /Safari\//.test(ua)
          ? 'Safari'
          : 'Browser'

  const deviceType: 'ios' | 'android' | 'web' = /iPhone|iPad|iPod/.test(ua)
    ? 'ios'
    : /Android/.test(ua)
      ? 'android'
      : 'web'

  const sistema = /iPhone|iPad|iPod/.test(ua)
    ? 'iOS'
    : /Android/.test(ua)
      ? 'Android'
      : /Macintosh/.test(ua)
        ? 'Mac'
        : /Windows/.test(ua)
          ? 'Windows'
          : 'Desktop'

  return { deviceName: `${browserName} su ${sistema}`, deviceType, browserName }
}

/**
 * Fotografa lo stato reale del canale: supporto del browser, configurazione del
 * server, permesso concesso e presenza di una sottoscrizione attiva.
 */
export async function diagnosticaPush(): Promise<DiagnosiPush> {
  if (!pushSupportato()) {
    return {
      stato: 'non-supportato',
      dettaglio:
        "Questo browser non supporta le notifiche push. Su iPhone funzionano solo se l'app è installata sulla schermata Home.",
    }
  }

  let config: RispostaConfig
  try {
    config = await leggiConfigurazione()
  } catch {
    return {
      stato: 'non-configurato',
      dettaglio: 'Impossibile contattare il server per verificare le notifiche.',
    }
  }

  if (!config.configured || !config.publicKey) {
    return {
      stato: 'non-configurato',
      dettaglio:
        'Le notifiche push non sono ancora configurate sul server: nessun avviso può essere inviato.',
    }
  }

  if (Notification.permission === 'denied') {
    return {
      stato: 'negato',
      dettaglio:
        'Le notifiche sono bloccate dal browser. Sbloccale dalle impostazioni del sito per riceverle.',
    }
  }

  const registration = await navigator.serviceWorker.ready
  const sottoscrizione = await registration.pushManager.getSubscription()

  if (!sottoscrizione || Notification.permission !== 'granted') {
    return {
      stato: 'da-attivare',
      dettaglio: 'Attiva le notifiche per ricevere gli avvisi su questo dispositivo.',
    }
  }

  return {
    stato: 'attivo',
    dettaglio: 'Questo dispositivo riceve le notifiche.',
  }
}

/**
 * Chiede il permesso, crea la sottoscrizione e la registra sul server.
 * Lancia un errore con un messaggio mostrabile se una delle fasi fallisce.
 */
export async function attivaPush(): Promise<void> {
  if (!pushSupportato()) {
    throw new Error('Questo browser non supporta le notifiche push.')
  }

  const config = await leggiConfigurazione()
  if (!config.configured || !config.publicKey) {
    throw new Error('Le notifiche push non sono configurate sul server.')
  }

  const permesso = await Notification.requestPermission()
  if (permesso !== 'granted') {
    throw new Error(
      permesso === 'denied'
        ? 'Permesso negato: sblocca le notifiche dalle impostazioni del browser.'
        : 'Permesso non concesso.'
    )
  }

  const registration = await navigator.serviceWorker.ready

  // Se esiste già una sottoscrizione con una chiave diversa (chiavi VAPID
  // ruotate) va disdetta, altrimenti subscribe() fallisce.
  const esistente = await registration.pushManager.getSubscription()
  if (esistente) {
    await esistente.unsubscribe()
  }

  const sottoscrizione = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: base64UrlToUint8Array(config.publicKey) as BufferSource,
  })

  const { endpoint, keys } = sottoscrizione.toJSON() as {
    endpoint: string
    keys: { p256dh: string; auth: string }
  }

  const res = await fetch('/api/notifications/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint, keys, ...descriviDispositivo() }),
  })

  if (!res.ok) {
    // Il server non conosce questa sottoscrizione: inutile tenerla nel browser.
    await sottoscrizione.unsubscribe()
    throw new Error('Il server non ha accettato la registrazione del dispositivo.')
  }
}

/**
 * Disdice la sottoscrizione di questo dispositivo, sul browser e sul server.
 */
export async function disattivaPush(): Promise<void> {
  if (!pushSupportato()) return

  const registration = await navigator.serviceWorker.ready
  const sottoscrizione = await registration.pushManager.getSubscription()
  if (!sottoscrizione) return

  const endpoint = sottoscrizione.endpoint
  await sottoscrizione.unsubscribe()

  await fetch('/api/notifications/subscribe', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint }),
  })
}

/**
 * Chiede al server di inviare una notifica di prova a questo utente.
 */
export async function inviaNotificaDiProva(): Promise<void> {
  const res = await fetch('/api/notifications/test', { method: 'POST' })
  if (!res.ok) {
    const corpo = await res.json().catch(() => ({}))
    throw new Error(corpo.error ?? 'Invio della notifica di prova fallito.')
  }
}

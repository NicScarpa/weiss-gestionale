/**
 * Iscrizione del browser alle notifiche push (Web Push, VAPID).
 *
 * Gira solo nel browser. Il percorso è: chiedere il permesso all'utente →
 * farsi dare dal service worker un'iscrizione firmata con la chiave pubblica
 * del server → consegnarla al server, che da quel momento può scrivere a
 * questo dispositivo.
 *
 * Senza questo pezzo il resto della catena esiste ma non ha destinatari: è
 * esattamente quello che è successo finché c'era solo `requestPermission()`.
 */

/** La chiave VAPID viaggia in base64url e il browser la vuole in byte. */
function base64UrlToUint8Array(base64Url: string): Uint8Array {
  const padding = '='.repeat((4 - (base64Url.length % 4)) % 4)
  const base64 = (base64Url + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)

  const output = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) {
    output[i] = raw.charCodeAt(i)
  }
  return output
}

/** Le chiavi dell'iscrizione, in base64url, come le vuole il server. */
function estraiChiavi(subscription: PushSubscription): {
  p256dh: string
  auth: string
} {
  const json = subscription.toJSON()
  const keys = json.keys ?? {}

  if (!keys.p256dh || !keys.auth) {
    throw new Error('Il browser non ha fornito le chiavi di cifratura')
  }

  return { p256dh: keys.p256dh, auth: keys.auth }
}

/** Nome leggibile del dispositivo, per far riconoscere l'iscrizione. */
function descriviDispositivo(): {
  deviceName: string
  deviceType: 'ios' | 'android' | 'web'
  browserName: string
} {
  const ua = navigator.userAgent
  const deviceType: 'ios' | 'android' | 'web' = /iPhone|iPad|iPod/.test(ua)
    ? 'ios'
    : /Android/.test(ua)
      ? 'android'
      : 'web'

  const browserName = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\//.test(ua)
      ? 'Opera'
      : /Chrome\//.test(ua)
        ? 'Chrome'
        : /Safari\//.test(ua)
          ? 'Safari'
          : /Firefox\//.test(ua)
            ? 'Firefox'
            : 'Browser'

  const sistema = /iPhone|iPad|iPod/.test(ua)
    ? 'iPhone'
    : /Android/.test(ua)
      ? 'Android'
      : /Macintosh/.test(ua)
        ? 'Mac'
        : /Windows/.test(ua)
          ? 'Windows'
          : 'Computer'

  return { deviceName: `${browserName} su ${sistema}`, deviceType, browserName }
}

export function pushSupportato(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

/**
 * Esito dell'iscrizione. Il motivo del fallimento è testo per l'utente:
 * ogni caso richiede un'azione diversa (dare il permesso, installare l'app,
 * chiamare l'assistenza), quindi non basta un booleano.
 *
 * Non è una union discriminata perché il progetto compila con `strict: false`,
 * dove il narrowing su `ok` non scatta e `motivo` risulterebbe inesistente.
 */
export interface EsitoIscrizione {
  ok: boolean
  motivo?: string
}

/** Iscrive questo browser alle notifiche. */
export async function iscriviAllePush(): Promise<EsitoIscrizione> {
  if (!pushSupportato()) {
    return {
      ok: false,
      motivo:
        "Questo browser non supporta le notifiche. Su iPhone bisogna prima aggiungere l'app alla schermata Home.",
    }
  }

  const permesso = await Notification.requestPermission()
  if (permesso !== 'granted') {
    return {
      ok: false,
      motivo:
        permesso === 'denied'
          ? 'Le notifiche sono bloccate: vanno riattivate dalle impostazioni del browser.'
          : 'Permesso non concesso.',
    }
  }

  const risposta = await fetch('/api/notifications/vapid-key')
  if (!risposta.ok) {
    return {
      ok: false,
      motivo: 'Le notifiche non sono configurate sul server. Avvisa l\'amministratore.',
    }
  }
  const { publicKey } = await risposta.json()

  const registration = await navigator.serviceWorker.ready

  // Un'iscrizione già presente può essere stata creata con un'altra chiave
  // (per esempio dopo una rotazione): in quel caso va rifatta, altrimenti il
  // server non riuscirebbe più a scrivere a questo dispositivo.
  const esistente = await registration.pushManager.getSubscription()
  let subscription = esistente

  if (esistente) {
    const chiaveAttuale = esistente.options?.applicationServerKey
    const combacia =
      chiaveAttuale &&
      btoa(String.fromCharCode(...new Uint8Array(chiaveAttuale)))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '') === publicKey

    if (!combacia) {
      await esistente.unsubscribe()
      subscription = null
    }
  }

  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlToUint8Array(publicKey) as BufferSource,
    })
  }

  const { p256dh, auth } = estraiChiavi(subscription)
  const dispositivo = descriviDispositivo()

  const salvataggio = await fetch('/api/notifications/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      endpoint: subscription.endpoint,
      p256dh,
      auth,
      ...dispositivo,
    }),
  })

  if (!salvataggio.ok) {
    return { ok: false, motivo: 'Il server non ha accettato la registrazione.' }
  }

  return { ok: true }
}

/** Disiscrive questo browser: smette di ricevere e il server lo dimentica. */
export async function disiscriviDallePush(): Promise<void> {
  if (!pushSupportato()) return

  const registration = await navigator.serviceWorker.ready
  const subscription = await registration.pushManager.getSubscription()
  if (!subscription) return

  await fetch('/api/notifications/subscribe', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint: subscription.endpoint }),
  })

  await subscription.unsubscribe()
}

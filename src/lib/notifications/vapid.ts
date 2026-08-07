/**
 * Configurazione del canale Web Push (VAPID).
 *
 * Il canale è attivo solo se sono presenti entrambe le chiavi VAPID e il
 * soggetto (un mailto: o un URL del mittente, richiesto dallo standard).
 * Le chiavi si generano una volta sola con `npx web-push generate-vapid-keys`
 * e vanno messe fra le variabili d'ambiente del deploy.
 *
 * La chiave pubblica è, per definizione, pubblica: il browser deve riceverla
 * per creare la sottoscrizione. La privata non lascia mai il server.
 */

export interface ConfigurazioneVapid {
  publicKey: string
  privateKey: string
  subject: string
}

/**
 * Ritorna la configurazione VAPID, oppure null se il canale non è configurato.
 */
export function getVapidConfig(): ConfigurazioneVapid | null {
  const publicKey = process.env.VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT

  if (!publicKey || !privateKey || !subject) {
    return null
  }

  return { publicKey, privateKey, subject }
}

/**
 * Il canale push è utilizzabile?
 */
export function isPushConfigured(): boolean {
  return getVapidConfig() !== null
}

/**
 * Chiave pubblica da consegnare al browser, o null se il canale non è configurato.
 */
export function getVapidPublicKey(): string | null {
  return getVapidConfig()?.publicKey ?? null
}

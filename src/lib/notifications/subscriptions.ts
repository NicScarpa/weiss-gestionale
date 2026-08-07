/**
 * Accesso alle sottoscrizioni push.
 *
 * Questo modulo è l'unico punto che conosce come una sottoscrizione Web Push
 * è rappresentata nel database. Una sottoscrizione è una tripletta
 * (endpoint, chiave p256dh, chiave auth): senza le due chiavi il payload non è
 * cifrabile e la notifica non parte.
 *
 * Il modello Prisma `PushSubscription` ha però un solo campo utile, `fcmToken`,
 * eredità del percorso Firebase mai entrato in funzione. Finché quel campo non
 * viene sostituito da tre colonne dedicate, la tripletta ci viene serializzata
 * dentro in forma canonica (ordine delle chiavi deciso qui, non dal client, così
 * la stessa sottoscrizione produce sempre la stessa stringa). L'indice unique
 * continua a funzionare perché l'endpoint è di per sé unico.
 */

import { prisma } from '@/lib/prisma'

export interface SottoscrizionePush {
  id: string
  userId: string
  endpoint: string
  p256dh: string
  auth: string
}

/** Dati che arrivano dal browser (`PushSubscription.toJSON()`). */
export interface DatiSottoscrizione {
  endpoint: string
  keys: {
    p256dh: string
    auth: string
  }
}

/**
 * Forma canonica con cui la tripletta viene persistita.
 * L'ordine dei campi è fissato qui perché la stringa finisce in una colonna
 * unique: se dipendesse dall'ordine di serializzazione del client, la stessa
 * sottoscrizione potrebbe generare due righe diverse.
 */
function serializza(dati: DatiSottoscrizione): string {
  return JSON.stringify({
    endpoint: dati.endpoint,
    keys: { p256dh: dati.keys.p256dh, auth: dati.keys.auth },
  })
}

function deserializza(
  riga: { id: string; userId: string; fcmToken: string }
): SottoscrizionePush | null {
  try {
    const dati = JSON.parse(riga.fcmToken) as DatiSottoscrizione
    if (!dati?.endpoint || !dati.keys?.p256dh || !dati.keys?.auth) return null
    return {
      id: riga.id,
      userId: riga.userId,
      endpoint: dati.endpoint,
      p256dh: dati.keys.p256dh,
      auth: dati.keys.auth,
    }
  } catch {
    // Righe nel vecchio formato (token FCM nudo): inutilizzabili per Web Push.
    return null
  }
}

/**
 * Registra o aggiorna la sottoscrizione di un dispositivo.
 */
export async function salvaSottoscrizione(params: {
  userId: string
  dati: DatiSottoscrizione
  deviceName?: string
  deviceType?: string
  browserName?: string
}): Promise<{ id: string; deviceName: string | null; deviceType: string | null }> {
  const { userId, dati, deviceName, deviceType, browserName } = params
  const chiave = serializza(dati)

  const comuni = {
    userId,
    deviceName,
    deviceType,
    browserName,
    isActive: true,
    lastUsedAt: new Date(),
  }

  const riga = await prisma.pushSubscription.upsert({
    where: { fcmToken: chiave },
    create: { ...comuni, fcmToken: chiave },
    update: comuni,
  })

  return { id: riga.id, deviceName: riga.deviceName, deviceType: riga.deviceType }
}

/**
 * Sottoscrizioni attive e utilizzabili di un utente.
 */
export async function sottoscrizioniAttive(userId: string): Promise<SottoscrizionePush[]> {
  const righe = await prisma.pushSubscription.findMany({
    where: { userId, isActive: true },
  })
  return righe.map(deserializza).filter((s): s is SottoscrizionePush => s !== null)
}

/**
 * Sottoscrizioni attive di più utenti in una sola query.
 */
export async function sottoscrizioniAttiveDi(userIds: string[]): Promise<SottoscrizionePush[]> {
  if (userIds.length === 0) return []
  const righe = await prisma.pushSubscription.findMany({
    where: { userId: { in: userIds }, isActive: true },
  })
  return righe.map(deserializza).filter((s): s is SottoscrizionePush => s !== null)
}

/**
 * Cerca la sottoscrizione di un endpoint, indipendentemente dall'utente.
 */
export async function trovaPerEndpoint(
  endpoint: string
): Promise<{ id: string; userId: string } | null> {
  const riga = await prisma.pushSubscription.findFirst({
    where: { fcmToken: { contains: endpoint } },
    select: { id: true, userId: true },
  })
  return riga
}

/**
 * Rimuove una sottoscrizione (l'utente ha disattivato le notifiche).
 */
export async function rimuoviSottoscrizione(id: string): Promise<void> {
  await prisma.pushSubscription.delete({ where: { id } })
}

/**
 * Disattiva una sottoscrizione che il push service ha dichiarato defunta
 * (410 Gone / 404): il browser l'ha revocata e non tornerà valida.
 */
export async function disattivaSottoscrizione(id: string): Promise<void> {
  await prisma.pushSubscription.update({
    where: { id },
    data: { isActive: false },
  })
}

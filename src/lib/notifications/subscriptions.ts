/**
 * Accesso alle sottoscrizioni push.
 *
 * Una sottoscrizione Web Push è la tripletta (endpoint, chiave p256dh, chiave
 * auth) prodotta dal browser: l'endpoint dice a quale push service consegnare
 * il messaggio, le due chiavi servono a cifrarne il contenuto. Il modello
 * Prisma le conserva in tre colonne dedicate, quindi qui non resta nessuna
 * traduzione da fare.
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
  /** Il browser può dichiarare una scadenza; nella pratica è quasi sempre assente. */
  expirationTime?: number | null
}

const CAMPI_INVIO = {
  id: true,
  userId: true,
  endpoint: true,
  p256dh: true,
  auth: true,
} as const

/**
 * Registra o aggiorna la sottoscrizione di un dispositivo.
 *
 * L'endpoint è la chiave naturale: se lo stesso dispositivo si risottoscrive,
 * la riga esistente viene aggiornata invece che duplicata.
 */
export async function salvaSottoscrizione(params: {
  userId: string
  dati: DatiSottoscrizione
  deviceName?: string
  deviceType?: string
  browserName?: string
}): Promise<{ id: string; deviceName: string | null; deviceType: string | null }> {
  const { userId, dati, deviceName, deviceType, browserName } = params

  const comuni = {
    userId,
    p256dh: dati.keys.p256dh,
    auth: dati.keys.auth,
    expiresAt: dati.expirationTime ? new Date(dati.expirationTime) : null,
    deviceName,
    deviceType,
    browserName,
    isActive: true,
    lastUsedAt: new Date(),
  }

  const riga = await prisma.pushSubscription.upsert({
    where: { endpoint: dati.endpoint },
    create: { ...comuni, endpoint: dati.endpoint },
    update: comuni,
  })

  return { id: riga.id, deviceName: riga.deviceName, deviceType: riga.deviceType }
}

/**
 * Sottoscrizioni attive di un utente.
 */
export async function sottoscrizioniAttive(userId: string): Promise<SottoscrizionePush[]> {
  return prisma.pushSubscription.findMany({
    where: { userId, isActive: true },
    select: CAMPI_INVIO,
  })
}

/**
 * Sottoscrizioni attive di più utenti in una sola query.
 */
export async function sottoscrizioniAttiveDi(userIds: string[]): Promise<SottoscrizionePush[]> {
  if (userIds.length === 0) return []
  return prisma.pushSubscription.findMany({
    where: { userId: { in: userIds }, isActive: true },
    select: CAMPI_INVIO,
  })
}

/**
 * Cerca la sottoscrizione di un endpoint, indipendentemente dall'utente.
 */
export async function trovaPerEndpoint(
  endpoint: string
): Promise<{ id: string; userId: string } | null> {
  return prisma.pushSubscription.findUnique({
    where: { endpoint },
    select: { id: true, userId: true },
  })
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

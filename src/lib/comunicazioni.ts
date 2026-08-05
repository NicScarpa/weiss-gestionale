import type { Prisma } from '@prisma/client'
import { prisma } from './prisma'

/**
 * Pezzi condivisi dalle route delle comunicazioni aziendali.
 *
 * Chi è destinatario di una comunicazione è la stessa domanda in tre posti —
 * elenco del portale, invio della push, conteggio delle letture — e deve avere
 * una risposta sola: chi lavora qui, usa il portale, e ha un ruolo tra quelli
 * indicati (o nessun ruolo indicato, che vuol dire tutti).
 */

/** Campi restituiti al client, uguali in lista e nelle azioni. */
export const comunicazioneSelect = {
  id: true,
  title: true,
  message: true,
  priority: true,
  eventDate: true,
  expiresAt: true,
  targetRoles: true,
  createdAt: true,
  createdBy: { select: { id: true, firstName: true, lastName: true } },
} as const

/**
 * Filtro delle comunicazioni che un destinatario deve vedere: non scadute e
 * indirizzate al suo ruolo.
 */
export function filtroVisibili(ruolo: string): Prisma.CommunicationWhereInput {
  return {
    AND: [
      { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
      { OR: [{ targetRoles: { isEmpty: true } }, { targetRoles: { has: ruolo } }] },
    ],
  }
}

/**
 * Gli utenti a cui una comunicazione è destinata. Chi non ha il portale
 * abilitato non la leggerebbe comunque, quindi non riceve nemmeno la push.
 */
export async function destinatariDi(
  venueId: string,
  targetRoles: string[],
  options?: { escludiUserId?: string }
): Promise<string[]> {
  const utenti = await prisma.user.findMany({
    where: {
      venueId,
      isActive: true,
      portalEnabled: true,
      ...(targetRoles.length > 0 && { role: { name: { in: targetRoles } } }),
      ...(options?.escludiUserId && { id: { not: options.escludiUserId } }),
    },
    select: { id: true },
  })

  return utenti.map((utente) => utente.id)
}

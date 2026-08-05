import { prisma } from './prisma'
import { cache } from 'react'

/**
 * ARCHITETTURA SINGLE-VENUE (decisione del 5 agosto 2026)
 *
 * L'applicazione gestisce UNA SOLA sede. Il campo `venueId` è presente su
 * quasi tutti i modelli, ma non abilita il multi-tenant: la sede viene
 * risolta qui come "l'unica sede attiva", non dalla sessione utente.
 *
 * Il vincolo è applicato in `POST /api/venues`, che rifiuta la creazione di
 * una seconda sede (409).
 *
 * Per abilitare davvero il multi-sede in futuro servono tre cose insieme:
 *  1. `venueId` nel token di sessione (o un selettore sede per gli admin)
 *  2. queste funzioni riscritte per leggerlo dalla sessione
 *  3. i controlli `resource.venueId !== venueId` diventano significativi
 *     (oggi confrontano la risorsa con l'unica sede esistente: sono tautologici)
 * Finché i tre punti non sono fatti insieme, NON rimuovere il guard sulla
 * creazione della seconda sede: `getVenueId()` restituirebbe una sede
 * arbitraria e l'isolamento dei dati salterebbe silenziosamente.
 */

/**
 * Restituisce l'ID dell'unica sede attiva.
 * Cached per request (React cache).
 */
export const getVenueId = cache(async (): Promise<string> => {
  const venue = await prisma.venue.findFirst({
    where: { isActive: true },
    select: { id: true },
  })
  if (!venue) throw new Error('Nessuna sede attiva configurata')
  return venue.id
})

/**
 * Restituisce l'oggetto completo dell'unica sede attiva.
 * Cached per request (React cache).
 */
export const getVenue = cache(async () => {
  const venue = await prisma.venue.findFirst({ where: { isActive: true } })
  if (!venue) throw new Error('Nessuna sede attiva configurata')
  return venue
})

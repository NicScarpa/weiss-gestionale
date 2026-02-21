import { prisma } from './prisma'
import { cache } from 'react'

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

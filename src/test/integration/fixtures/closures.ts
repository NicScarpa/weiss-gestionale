import { prisma } from '@/lib/prisma'
import type { ClosureStatus } from '@prisma/client'

/**
 * Fixture per le chiusure di cassa.
 *
 * Costruiscono righe vere sul database di test: sono la scorciatoia per
 * arrivare allo stato di partenza di un test senza passare da mezza interfaccia,
 * ma i vincoli (unicità sede+data, foreign key) restano quelli veri.
 */

/** Sede del seed. Ogni test parte da questa. */
export async function venueDiTest() {
  const venue = await prisma.venue.findUnique({ where: { code: 'WEISS' } })
  if (!venue) {
    throw new Error('Sede WEISS assente: il seed non è stato applicato al database di test.')
  }
  return venue
}

export interface PostazioneFixture {
  name?: string
  /** Contante in cassa a fine giornata. */
  cashAmount?: number
  posAmount?: number
  /** Fondo cassa da lasciare in postazione. */
  floatAmount?: number
}

export interface UscitaFixture {
  payee?: string
  amount: number
  description?: string
  accountId?: string
}

export interface ChiusuraFixture {
  status?: ClosureStatus
  /** Data della chiusura; deve essere unica per sede. */
  date?: Date
  venueId?: string
  submittedById?: string
  postazioni?: PostazioneFixture[]
  uscite?: UscitaFixture[]
}

/**
 * Crea una chiusura con le sue postazioni e uscite e la restituisce completa
 * di relazioni.
 */
export async function creaChiusura(fixture: ChiusuraFixture = {}) {
  const venueId = fixture.venueId ?? (await venueDiTest()).id

  const closure = await prisma.dailyClosure.create({
    data: {
      venueId,
      date: fixture.date ?? new Date('2026-03-15'),
      status: fixture.status ?? 'DRAFT',
      submittedById: fixture.submittedById ?? null,
      submittedAt: fixture.submittedById ? new Date() : null,
      stations: {
        create: (fixture.postazioni ?? []).map((p, i) => ({
          name: p.name ?? `CASSA ${i + 1}`,
          position: i,
          cashAmount: p.cashAmount ?? 0,
          posAmount: p.posAmount ?? 0,
          floatAmount: p.floatAmount ?? 114,
        })),
      },
      expenses: {
        create: (fixture.uscite ?? []).map((u, i) => ({
          payee: u.payee ?? 'Fornitore di prova',
          description: u.description ?? null,
          amount: u.amount,
          accountId: u.accountId ?? null,
          position: i,
        })),
      },
    },
    include: { stations: true, expenses: true },
  })

  return closure
}

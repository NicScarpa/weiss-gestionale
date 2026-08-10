import { prisma } from '@/lib/prisma'
import type { ClosureStatus } from '@prisma/client'
import { calculateTotalCounted } from '@/lib/closure-calculations'

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

/** Pezzi contati nel cassetto: solo i tagli che servono al test. */
export interface ConteggioFixture {
  bills50?: number
  bills20?: number
  bills10?: number
  bills5?: number
  coins2?: number
  coins1?: number
  coins050?: number
}

export interface PostazioneFixture {
  name?: string
  /** Contante in cassa a fine giornata. */
  cashAmount?: number
  posAmount?: number
  /** Fondo cassa da lasciare in postazione. */
  floatAmount?: number
  /**
   * Conteggio fisico del cassetto. Va valorizzato ogni volta che il test deve
   * somigliare alla produzione: l'interfaccia di chiusura invia sempre la
   * griglia dei tagli, quindi in produzione una postazione senza conteggio non
   * esiste. Una fixture che lo ometteva è il motivo per cui la PUT ha potuto
   * rispondere 500 per settimane con la suite tutta verde.
   */
  conteggio?: ConteggioFixture
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
          ...(p.conteggio
            ? {
                cashCount: {
                  create: {
                    ...p.conteggio,
                    totalCounted: calculateTotalCounted(p.conteggio),
                    expectedTotal: p.cashAmount ?? 0,
                    difference: calculateTotalCounted(p.conteggio) - (p.cashAmount ?? 0),
                  },
                },
              }
            : {}),
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
    include: { stations: { include: { cashCount: true } }, expenses: true },
  })

  return closure
}

import { prisma } from '@/lib/prisma'
import type { ClosureStatus } from '@prisma/client'
import { calculateTotalCounted } from '@/lib/closure-calculations'
import { trovaCentroStrutturale } from '@/lib/services/cost-center-service'

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

/**
 * Il centro di costo strutturale del seed (STR): lo stesso che sceglierebbe
 * chi compila la chiusura in produzione, quando la sceglie. Le fixture non
 * ne inventano uno: lo leggono, come farebbe il codice vero.
 */
export async function centroDiCostoDiDefault(): Promise<string> {
  const centro = await trovaCentroStrutturale(prisma)
  if (!centro) {
    throw new Error(
      'Nessun centro di costo di default (isDefault: true) nel seed di test: le ' +
        'fixture non possono costruire lo scenario che la produzione usa davvero.'
    )
  }
  return centro.id
}

/**
 * Un centro di costo del seed diverso da quello di default, cercato per codice
 * (WEISS, VV, CAS). Serve ai test sull'imputazione: se la chiusura porta il
 * centro strutturale, «il centro è stato conservato» e «il centro è stato
 * riportato al default» danno lo stesso risultato, e il test non distingue il
 * comportamento giusto da quello sbagliato.
 */
export async function centroDiCosto(code: string): Promise<string> {
  const centro = await prisma.costCenter.findFirst({ where: { code, isActive: true } })
  if (!centro) {
    throw new Error(`Centro di costo "${code}" assente dal seed di test.`)
  }
  return centro.id
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
  /**
   * Centro di costo della singola riga, che sovrascrive quello di testata.
   * `null` (o assente) significa «eredita dalla testata», ed è il valore che
   * il form invia quando l'utente sceglie «Come la chiusura».
   */
  costCenterId?: string | null
}

export interface ChiusuraFixture {
  status?: ClosureStatus
  /** Data della chiusura; deve essere unica per sede. */
  date?: Date
  venueId?: string
  submittedById?: string
  postazioni?: PostazioneFixture[]
  uscite?: UscitaFixture[]
  /**
   * Centro di costo della chiusura. Di default quello strutturale del seed:
   * senza, la chiusura è uno scenario che la produzione non ammette più
   * (`closure-service.ts` rifiuta la validazione con `missing_cost_center`),
   * quindi ometterlo costruirebbe un test contro uno stato impossibile. Passa
   * esplicitamente `null` solo nei test che verificano proprio quel rifiuto.
   */
  costCenterId?: string | null
}

/**
 * Crea una chiusura con le sue postazioni e uscite e la restituisce completa
 * di relazioni.
 */
export async function creaChiusura(fixture: ChiusuraFixture = {}) {
  const venueId = fixture.venueId ?? (await venueDiTest()).id
  const costCenterId =
    fixture.costCenterId === null ? null : (fixture.costCenterId ?? (await centroDiCostoDiDefault()))

  const closure = await prisma.dailyClosure.create({
    data: {
      venueId,
      date: fixture.date ?? new Date('2026-03-15'),
      status: fixture.status ?? 'DRAFT',
      submittedById: fixture.submittedById ?? null,
      submittedAt: fixture.submittedById ? new Date() : null,
      costCenterId,
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
          costCenterId: u.costCenterId ?? null,
          position: i,
        })),
      },
    },
    include: { stations: { include: { cashCount: true } }, expenses: true },
  })

  return closure
}

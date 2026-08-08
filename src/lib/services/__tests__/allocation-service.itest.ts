import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { setupIntegrationDb } from '@/test/integration/db'
import { creaMovimento } from '@/test/integration/fixtures/scadenzario'
import { venueDiTest } from '@/test/integration/fixtures/closures'
import { setEntryAllocations, type FettaInput } from '../allocation-service'

/**
 * La suddivisione su database vero.
 *
 * I test unitari di `allocation-service.test.ts` girano su un Prisma finto:
 * per costruzione non possono cogliere una corsa fra due richieste, perché non
 * esiste nessuna transazione e nessun lock da contendere. Le invarianti che
 * questo modulo difende — «la somma delle fette non supera mai il movimento» e
 * «una suddivisione sostituisce la precedente, non ci si somma» — vivono o
 * muoiono proprio lì, e vanno verificate contro PostgreSQL.
 */
setupIntegrationDb()

/** Tre conti attivi del seed: i destinatari delle fette. */
async function treConti(): Promise<[string, string, string]> {
  const conti = await prisma.account.findMany({
    where: { isActive: true },
    select: { id: true },
    orderBy: { code: 'asc' },
    take: 3,
  })
  if (conti.length < 3) {
    throw new Error('Servono almeno tre conti attivi nel seed del database di test.')
  }
  return [conti[0].id, conti[1].id, conti[2].id]
}

async function fetteDelMovimento(journalEntryId: string) {
  const righe = await prisma.journalEntryAllocation.findMany({
    where: { journalEntryId },
    select: { accountId: true, importo: true, origine: true },
  })
  return {
    righe,
    numero: righe.length,
    somma: Number(righe.reduce((s, r) => s + Number(r.importo), 0).toFixed(2)),
  }
}

let venueId: string

beforeEach(async () => {
  venueId = (await venueDiTest()).id
})

describe('suddivisioni concorrenti sullo stesso movimento', () => {
  it(
    'due PUT simultanei si sostituiscono invece di sommarsi',
    { repeats: 5 },
    async () => {
      const movimento = await creaMovimento({ uscita: 1000, venueId })
      const [a, b, c] = await treConti()
      const fette: FettaInput[] = [
        { accountId: a, importo: 400 },
        { accountId: b, importo: 300 },
        { accountId: c, importo: 300 },
      ]

      const esiti = await Promise.all([
        setEntryAllocations({ journalEntryId: movimento.id, venueId, userId: null, fette }),
        setEntryAllocations({ journalEntryId: movimento.id, venueId, userId: null, fette }),
      ])

      // Nessuna delle due deve fallire: la suddivisione è idempotente, la
      // seconda sostituisce la prima. Il difetto non è un errore, è il
      // silenzio con cui il movimento finisce a valere il doppio.
      expect(esiti.map((e) => e.outcome)).toEqual(['ok', 'ok'])

      const dopo = await fetteDelMovimento(movimento.id)
      expect(dopo.numero).toBe(3)
      expect(dopo.somma).toBe(1000)
    }
  )

  it(
    'due suddivisioni diverse: vince una sola, e resta solo la sua',
    { repeats: 5 },
    async () => {
      const movimento = await creaMovimento({ uscita: 1000, venueId })
      const [a, b, c] = await treConti()

      const esiti = await Promise.all([
        setEntryAllocations({
          journalEntryId: movimento.id,
          venueId,
          userId: null,
          fette: [{ accountId: a, importo: 1000 }],
        }),
        setEntryAllocations({
          journalEntryId: movimento.id,
          venueId,
          userId: null,
          fette: [
            { accountId: b, importo: 600 },
            { accountId: c, importo: 400 },
          ],
        }),
      ])

      expect(esiti.map((e) => e.outcome)).toEqual(['ok', 'ok'])

      const dopo = await fetteDelMovimento(movimento.id)
      expect(dopo.somma).toBe(1000)
      // O la suddivisione da una fetta o quella da due: mai le tre insieme
      expect([1, 2]).toContain(dopo.numero)
      const conti = new Set(dopo.righe.map((r) => r.accountId))
      expect(conti.has(a) && (conti.has(b) || conti.has(c))).toBe(false)
    }
  )

  it('la suddivisione non tocca le fette ereditate di un altro movimento', async () => {
    const primo = await creaMovimento({ uscita: 1000, venueId })
    const secondo = await creaMovimento({ uscita: 500, venueId })
    const [a, b] = await treConti()

    await prisma.journalEntryAllocation.create({
      data: { journalEntryId: secondo.id, accountId: b, importo: 500, origine: 'ereditata' },
    })

    const esito = await setEntryAllocations({
      journalEntryId: primo.id,
      venueId,
      userId: null,
      fette: [{ accountId: a, importo: 1000 }],
    })

    expect(esito.outcome).toBe('ok')
    expect((await fetteDelMovimento(secondo.id)).numero).toBe(1)
  })
})

describe('quadratura contro il database vero', () => {
  it('le fette manuali non possono superare il movimento al netto delle ereditate', async () => {
    const movimento = await creaMovimento({ uscita: 1000, venueId })
    const [a, b] = await treConti()

    await prisma.journalEntryAllocation.create({
      data: { journalEntryId: movimento.id, accountId: b, importo: 700, origine: 'ereditata' },
    })

    const esito = await setEntryAllocations({
      journalEntryId: movimento.id,
      venueId,
      userId: null,
      fette: [{ accountId: a, importo: 400 }],
    })

    expect(esito).toEqual({
      outcome: 'invalid',
      motivo: expect.stringContaining("supera l'importo del movimento"),
    })
    // Niente scritto: la fetta ereditata resta l'unica
    expect(await fetteDelMovimento(movimento.id)).toMatchObject({ numero: 1, somma: 700 })
  })

  it('un movimento di un altra sede non è raggiungibile', async () => {
    const movimento = await creaMovimento({ uscita: 1000, venueId })
    const [a] = await treConti()

    const esito = await setEntryAllocations({
      journalEntryId: movimento.id,
      venueId: 'venue-di-un-altro',
      userId: null,
      fette: [{ accountId: a, importo: 1000 }],
    })

    expect(esito).toEqual({ outcome: 'entry_not_found' })
    expect((await fetteDelMovimento(movimento.id)).numero).toBe(0)
  })

  it('un movimento cancellato logicamente non è suddividibile', async () => {
    const movimento = await creaMovimento({ uscita: 1000, venueId })
    const [a] = await treConti()
    await prisma.journalEntry.updateMany({
      where: { id: movimento.id },
      data: { deletedAt: new Date() },
    })

    const esito = await setEntryAllocations({
      journalEntryId: movimento.id,
      venueId,
      userId: null,
      fette: [{ accountId: a, importo: 1000 }],
    })

    expect(esito).toEqual({ outcome: 'entry_not_found' })
  })
})

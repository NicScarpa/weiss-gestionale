import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { prisma } from '@/lib/prisma'
import { setupIntegrationDb } from '@/test/integration/db'
import { impostaClientPerTest } from '@/lib/gocardless/servizio'
import type { ClientGoCardless } from '@/lib/gocardless/client'
import { sincronizzaConti } from '../bank-sync-service'

setupIntegrationDb()

const OGGI = new Date('2026-08-15T02:00:00.000Z')

function movimento(id: string, giorno: string, importo: string) {
  return {
    transactionId: id,
    bookingDate: giorno,
    transactionAmount: { amount: importo, currency: 'EUR' },
    remittanceInformationUnstructured: `Movimento ${id}`,
    proprietaryBankTransactionCode: '26//11',
  }
}

/** Un client finto: solo `movimentiConto` serve, il resto non viene chiamato. */
function clientFinto(
  booked: ReturnType<typeof movimento>[],
  opzioni: { pending?: ReturnType<typeof movimento>[]; restanti?: number | null; errore?: Error } = {}
): ClientGoCardless {
  return {
    movimentiConto: vi.fn(async () => {
      if (opzioni.errore) throw opzioni.errore
      return {
        dati: { transactions: { booked, pending: opzioni.pending ?? [] } },
        limiti: { restanti: opzioni.restanti ?? null, ripresaFraSecondi: null },
      }
    }),
  } as unknown as ClientGoCardless
}

async function montaConto(nome: string, providerAccountId: string) {
  const venue = await prisma.venue.findFirstOrThrow()
  // `bank_connections` ha un vincolo di unicità sulla sede: **un solo
  // collegamento bancario per sede**. Più conti condividono lo stesso, ed è
  // proprio il caso che il terzo test deve coprire.
  const connessione =
    (await prisma.bankConnection.findFirst({ where: { venueId: venue.id } })) ??
    (await prisma.bankConnection.create({
      data: {
        venueId: venue.id,
        institutionId: 'BANCA_MARCA',
        institutionName: 'Banca della Marca',
        requisitionId: `req-${venue.id}`,
        status: 'LN',
      },
    }))
  const conto = await prisma.bankAccount.create({
    data: {
      venueId: venue.id,
      name: nome,
      accountType: 'BANK',
      connectionId: connessione.id,
      providerAccountId,
      syncEnabled: true,
    },
  })
  return { venueId: venue.id, contoId: conto.id }
}

describe('sincronizzaConti', () => {
  beforeEach(() => {
    process.env.RESEND_API_KEY = ''
  })
  afterEach(() => {
    impostaClientPerTest(null)
  })

  it('porta i movimenti dentro, pronti per la riconciliazione', async () => {
    const { venueId, contoId } = await montaConto('Banca della Marca', 'acct-1')
    impostaClientPerTest(
      clientFinto([movimento('20260810-1', '2026-08-10', '-12.50'), movimento('20260810-2', '2026-08-10', '340.00')])
    )

    const esiti = await sincronizzaConti({ venueId, origine: 'cron', oggi: OGGI })

    expect(esiti).toHaveLength(1)
    expect(esiti[0].esito).toBe('OK')
    expect(esiti[0].movimentiNuovi).toBe(2)

    const righe = await prisma.bankTransaction.findMany({ where: { bankAccountId: contoId } })
    expect(righe).toHaveLength(2)
    // PENDING è ciò che la coda della riconciliazione assistita legge: senza,
    // i movimenti entrerebbero e nessuno li proporrebbe.
    expect(righe.every((r) => r.status === 'PENDING')).toBe(true)
    expect(righe.every((r) => r.importSource === 'PSD2_GOCARDLESS')).toBe(true)
  })

  it('rieseguita non raddoppia nulla: i duplicati li ferma l’indice', async () => {
    const { venueId, contoId } = await montaConto('Banca della Marca', 'acct-1')
    const movimenti = [movimento('20260810-1', '2026-08-10', '-12.50')]

    impostaClientPerTest(clientFinto(movimenti))
    await sincronizzaConti({ venueId, origine: 'cron', oggi: OGGI })

    impostaClientPerTest(clientFinto(movimenti))
    const secondo = await sincronizzaConti({ venueId, origine: 'manuale', oggi: OGGI })

    expect(secondo[0].movimentiNuovi).toBe(0)
    expect(secondo[0].movimentiDuplicati).toBe(1)
    expect(await prisma.bankTransaction.count({ where: { bankAccountId: contoId } })).toBe(1)
  })

  // Il difetto che l'indice esiste per prevenire: nel dato vero 249
  // `transactionId` su 678 sono condivisi fra due conti.
  it('lo stesso identificativo su due conti diversi non è un duplicato', async () => {
    const primo = await montaConto('Conto A', 'acct-A')
    const secondo = await montaConto('Conto B', 'acct-B')

    impostaClientPerTest(clientFinto([movimento('20260810-1', '2026-08-10', '-12.50')]))
    const esiti = await sincronizzaConti({ venueId: primo.venueId, origine: 'cron', oggi: OGGI })

    expect(esiti).toHaveLength(2)
    expect(esiti.every((e) => e.movimentiNuovi === 1)).toBe(true)
    expect(await prisma.bankTransaction.count({ where: { bankAccountId: primo.contoId } })).toBe(1)
    expect(await prisma.bankTransaction.count({ where: { bankAccountId: secondo.contoId } })).toBe(1)
  })

  it('un conto spento non viene toccato', async () => {
    const { venueId, contoId } = await montaConto('Banca della Marca', 'acct-1')
    await prisma.bankAccount.update({ where: { id: contoId }, data: { syncEnabled: false } })

    impostaClientPerTest(clientFinto([movimento('20260810-1', '2026-08-10', '-12.50')]))
    const esiti = await sincronizzaConti({ venueId, origine: 'cron', oggi: OGGI })

    expect(esiti).toHaveLength(0)
    expect(await prisma.bankTransaction.count({ where: { bankAccountId: contoId } })).toBe(0)
  })

  it('i provvisori restituiti dalla banca non entrano', async () => {
    const { venueId, contoId } = await montaConto('Banca della Marca', 'acct-1')
    impostaClientPerTest(
      clientFinto([movimento('20260810-1', '2026-08-10', '-12.50')], {
        pending: [movimento('20260811-9', '2026-08-11', '-4.00')],
      })
    )

    await sincronizzaConti({ venueId, origine: 'cron', oggi: OGGI })

    const righe = await prisma.bankTransaction.findMany({ where: { bankAccountId: contoId } })
    expect(righe).toHaveLength(1)
    expect(righe[0].providerTransactionId).toBe('20260810-1')
  })

  it('a contingente esaurito non chiama, registra il giro e non allarma', async () => {
    const { venueId, contoId } = await montaConto('Banca della Marca', 'acct-1')

    // Tre giri già fatti oggi: con la riserva, il contingente è chiuso.
    const conto = await prisma.bankAccount.findUniqueOrThrow({ where: { id: contoId } })
    for (let i = 0; i < 3; i++) {
      await prisma.bankSyncRun.create({
        data: {
          venueId,
          connectionId: conto.connectionId as string,
          bankAccountId: contoId,
          startedAt: new Date('2026-08-15T01:00:00.000Z'),
          esito: 'OK',
        },
      })
    }

    const finto = clientFinto([movimento('20260810-1', '2026-08-10', '-12.50')])
    impostaClientPerTest(finto)
    const esiti = await sincronizzaConti({ venueId, origine: 'manuale', oggi: OGGI })

    expect(esiti[0].esito).toBe('LIMITE')
    expect(finto.movimentiConto).not.toHaveBeenCalled()
    expect(await prisma.notificationLog.count({ where: { type: 'BANK_SYNC_FAILED' } })).toBe(0)
    expect(
      await prisma.bankSyncRun.count({ where: { bankAccountId: contoId, esito: 'LIMITE' } })
    ).toBe(1)
  })

  it('un errore di rete registra il giro e fa scattare l’avviso', async () => {
    const { venueId, contoId } = await montaConto('Banca della Marca', 'acct-1')
    impostaClientPerTest(clientFinto([], { errore: new Error('connessione rifiutata') }))

    const esiti = await sincronizzaConti({ venueId, origine: 'cron', oggi: OGGI })

    expect(esiti[0].esito).toBe('ERRORE')
    expect(esiti[0].errore).toContain('connessione rifiutata')
    expect(
      await prisma.bankSyncRun.count({ where: { bankAccountId: contoId, esito: 'ERRORE' } })
    ).toBe(1)
    expect(
      await prisma.notificationLog.count({ where: { type: 'BANK_SYNC_FAILED' } })
    ).toBeGreaterThan(0)
  })

  it('registra il residuo dichiarato dalla banca, per la decisione successiva', async () => {
    const { venueId, contoId } = await montaConto('Banca della Marca', 'acct-1')
    impostaClientPerTest(clientFinto([], { restanti: 2 }))

    await sincronizzaConti({ venueId, origine: 'cron', oggi: OGGI })

    const giro = await prisma.bankSyncRun.findFirstOrThrow({ where: { bankAccountId: contoId } })
    expect(giro.rateLimitRemaining).toBe(2)
  })
})

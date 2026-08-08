import { describe, it, expect, vi, beforeEach } from 'vitest'

// Il service è tutto accesso al database: si mocka prisma e si osserva cosa
// scrive. $transaction esegue la callback passando il mock stesso come tx.
// `$queryRaw` copre i lock di riga (SELECT ... FOR UPDATE) che il service
// prende su movimento e scadenza prima di decidere.
vi.mock('@/lib/prisma', () => ({
  prisma: {
    schedule: { findFirst: vi.fn(), update: vi.fn(), count: vi.fn() },
    journalEntry: { findFirst: vi.fn(), update: vi.fn() },
    scheduleReconciliation: {
      findFirst: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      aggregate: vi.fn(),
    },
    schedulePayment: { create: vi.fn(), delete: vi.fn(), aggregate: vi.fn() },
    electronicInvoice: { update: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn() },
    invoiceLineAccount: { findMany: vi.fn(), createMany: vi.fn() },
    journalEntryAllocation: {
      findMany: vi.fn(),
      createMany: vi.fn(),
      deleteMany: vi.fn(),
      aggregate: vi.fn(),
    },
    $queryRaw: vi.fn(),
    $transaction: vi.fn(),
  },
}))

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

vi.mock('@/lib/scadenzario/stima-data-attesa', () => ({
  applicaStimaSuScadenza: vi.fn(),
  ricalcolaStimeFornitore: vi.fn(),
}))

vi.mock('@/lib/accounts/mapping', () => ({
  derivaBudgetCategoryDaConto: vi.fn(),
}))

import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { logger } from '@/lib/logger'
import { applicaStimaSuScadenza, ricalcolaStimeFornitore } from '@/lib/scadenzario/stima-data-attesa'
import { derivaBudgetCategoryDaConto } from '@/lib/accounts/mapping'
import {
  reconcileScheduleWithEntry,
  undoScheduleReconciliation,
} from '../schedule-reconciliation-service'

const VENUE = 'venue-1'

function scadenza(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sched-1',
    venueId: VENUE,
    tipo: 'passiva',
    stato: 'aperta',
    importoTotale: new Prisma.Decimal(100),
    importoPagato: new Prisma.Decimal(0),
    dataPagamento: null,
    dataAttesaSource: null,
    invoiceId: null,
    supplierId: 'sup-1',
    dataScadenza: new Date('2026-07-20'),
    ...overrides,
  }
}

/**
 * Pagamenti finti in memoria: `ricalcolaStatoSchedule` ricava l'importo pagato
 * dalla somma dei pagamenti registrati, quindi un mock statico dell'aggregate
 * risponderebbe lo stesso valore prima e dopo la creazione e lo stato uscirebbe
 * sempre sbagliato. Questa manciata di righe fa da tabella `schedule_payments`.
 */
const pagamentiFinti: { id: string; importo: number; dataPagamento: Date }[] = []

function collegaPagamentiFinti() {
  pagamentiFinti.length = 0

  vi.mocked(prisma.schedulePayment.create).mockImplementation((async (args: {
    data: { importo: Prisma.Decimal; dataPagamento: Date }
  }) => {
    const creato = {
      id: `pay-${pagamentiFinti.length + 1}`,
      importo: Number(args.data.importo),
      dataPagamento: args.data.dataPagamento,
    }
    pagamentiFinti.push(creato)
    return { id: 'pay-1' }
  }) as never)

  vi.mocked(prisma.schedulePayment.delete).mockImplementation((async () => {
    pagamentiFinti.length = 0
    return { id: 'pay-1' }
  }) as never)

  vi.mocked(prisma.schedulePayment.aggregate).mockImplementation((async () => ({
    _sum: {
      importo:
        pagamentiFinti.length === 0
          ? null
          : new Prisma.Decimal(pagamentiFinti.reduce((t, p) => t + p.importo, 0)),
    },
    _max: {
      dataPagamento:
        pagamentiFinti.length === 0
          ? null
          : pagamentiFinti.reduce((max, p) => (p.dataPagamento > max ? p.dataPagamento : max),
              pagamentiFinti[0].dataPagamento),
    },
  })) as never)
}

function movimento(overrides: Record<string, unknown> = {}) {
  return {
    id: 'entry-1',
    date: new Date('2026-07-30'),
    debitAmount: null,
    creditAmount: new Prisma.Decimal(100),
    description: 'Bonifico fornitore',
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(prisma.$transaction).mockImplementation(
    async (cb: unknown) => (cb as (tx: typeof prisma) => Promise<unknown>)(prisma)
  )
  // I lock di riga trovano sempre la riga: i casi "non esiste" si esercitano
  // dalla findFirst, che è dove il service legge davvero i campi.
  vi.mocked(prisma.$queryRaw).mockResolvedValue([{ id: 'riga' }] as never)
  collegaPagamentiFinti()
  vi.mocked(prisma.scheduleReconciliation.create).mockResolvedValue(
    { id: 'rec-1' } as never
  )
  vi.mocked(prisma.scheduleReconciliation.findFirst).mockResolvedValue(null)
  // Default: nessuna quota già impegnata sul movimento, quindi la sua
  // capienza coincide con l'importo.
  vi.mocked(prisma.scheduleReconciliation.aggregate).mockResolvedValue({
    _sum: { amount: null },
  } as never)
  vi.mocked(prisma.electronicInvoice.findFirst).mockResolvedValue(null)
  vi.mocked(prisma.schedule.count).mockResolvedValue(0 as never)
  // Default pensato per l'annullo, che parte sempre da una scadenza saldata
  // con la data attesa riallineata al movimento. I test di riconciliazione
  // sovrascrivono questo mock con la scadenza che serve a loro.
  vi.mocked(prisma.schedule.findFirst).mockResolvedValue(
    scadenza({
      stato: 'pagata',
      importoPagato: new Prisma.Decimal(100),
      dataAttesaSource: 'riconciliazione',
    }) as never
  )
  // Default: nessuna fetta ereditata da ritirare, così i test che non
  // riguardano l'ereditarietà non devono preoccuparsene.
  vi.mocked(prisma.journalEntryAllocation.deleteMany).mockResolvedValue({ count: 0 } as never)
  // Default: nessuna fetta preesistente sul movimento, così i test che non
  // riguardano lo sforamento dell'importo utile non devono preoccuparsene.
  vi.mocked(prisma.journalEntryAllocation.aggregate).mockResolvedValue({
    _sum: { importo: null },
  } as never)
})

describe('reconcileScheduleWithEntry - dataAttesa', () => {
  it('riallinea dataAttesa alla data del movimento quando la riconciliazione salda la scadenza', async () => {
    const entry = movimento()
    vi.mocked(prisma.schedule.findFirst).mockResolvedValue(scadenza() as never)
    vi.mocked(prisma.journalEntry.findFirst).mockResolvedValue(entry as never)

    const esito = await reconcileScheduleWithEntry({
      scheduleId: 'sched-1',
      journalEntryId: 'entry-1',
      venueId: VENUE,
      userId: 'user-1',
    })

    expect(esito.outcome).toBe('ok')
    expect(prisma.schedule.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          stato: 'pagata',
          dataAttesa: entry.date,
        }),
      })
    )
  })

  it('non tocca dataAttesa su una riconciliazione parziale', async () => {
    vi.mocked(prisma.schedule.findFirst).mockResolvedValue(scadenza() as never)
    vi.mocked(prisma.journalEntry.findFirst).mockResolvedValue(
      movimento({ creditAmount: new Prisma.Decimal(40) }) as never
    )

    const esito = await reconcileScheduleWithEntry({
      scheduleId: 'sched-1',
      journalEntryId: 'entry-1',
      venueId: VENUE,
      userId: 'user-1',
    })

    expect(esito.outcome).toBe('ok')
    const update = vi.mocked(prisma.schedule.update).mock.calls[0][0]
    expect(update.data.stato).toBe('parzialmente_pagata')
    expect(update.data).not.toHaveProperty('dataAttesa')
  })
})

describe('undoScheduleReconciliation - dataAttesa', () => {
  it('riporta dataAttesa a null: la scadenza torna a seguire la data contrattuale', async () => {
    vi.mocked(prisma.scheduleReconciliation.findFirst).mockResolvedValue({
      id: 'rec-1',
      scheduleId: 'sched-1',
      paymentId: 'pay-1',
      amount: new Prisma.Decimal(100),
      schedule: {
        importoTotale: new Prisma.Decimal(100),
        importoPagato: new Prisma.Decimal(100),
      },
    } as never)

    const esito = await undoScheduleReconciliation({
      reconciliationId: 'rec-1',
      venueId: VENUE,
    })

    expect(esito.outcome).toBe('ok')
    expect(prisma.schedule.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          dataPagamento: null,
          dataAttesa: null,
        }),
      })
    )
  })
})

describe('reconcileScheduleWithEntry - provenienza e ricalcolo', () => {
  it('al saldo la source diventa riconciliazione e si ricalcolano le stime del fornitore', async () => {
    const entry = movimento()
    vi.mocked(prisma.schedule.findFirst).mockResolvedValue(scadenza() as never)
    vi.mocked(prisma.journalEntry.findFirst).mockResolvedValue(entry as never)

    await reconcileScheduleWithEntry({
      scheduleId: 'sched-1',
      journalEntryId: 'entry-1',
      venueId: VENUE,
      userId: 'user-1',
    })

    expect(prisma.schedule.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          dataAttesa: entry.date,
          dataAttesaSource: 'riconciliazione',
        }),
      })
    )
    expect(ricalcolaStimeFornitore).toHaveBeenCalledWith('sup-1', VENUE)
  })

  it('su un acconto parziale non si ricalcola nulla', async () => {
    vi.mocked(prisma.schedule.findFirst).mockResolvedValue(scadenza() as never)
    vi.mocked(prisma.journalEntry.findFirst).mockResolvedValue(
      movimento({ creditAmount: new Prisma.Decimal(40) }) as never
    )

    await reconcileScheduleWithEntry({
      scheduleId: 'sched-1',
      journalEntryId: 'entry-1',
      venueId: VENUE,
      userId: 'user-1',
    })

    expect(ricalcolaStimeFornitore).not.toHaveBeenCalled()
  })

  it("l'undo azzera la data attesa e poi la ristima", async () => {
    vi.mocked(prisma.scheduleReconciliation.findFirst).mockResolvedValue({
      id: 'rec-1',
      scheduleId: 'sched-1',
      paymentId: 'pay-1',
      amount: new Prisma.Decimal(100),
      schedule: {
        importoTotale: new Prisma.Decimal(100),
        importoPagato: new Prisma.Decimal(100),
      },
    } as never)

    await undoScheduleReconciliation({ reconciliationId: 'rec-1', venueId: VENUE })

    expect(prisma.schedule.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ dataAttesa: null, dataAttesaSource: null }),
      })
    )
    expect(applicaStimaSuScadenza).toHaveBeenCalledWith('sched-1', VENUE)
  })

  it("l'undo toglie un'osservazione dalla storia: ricalcola anche le altre scadenze del fornitore", async () => {
    vi.mocked(prisma.scheduleReconciliation.findFirst).mockResolvedValue({
      id: 'rec-1',
      scheduleId: 'sched-1',
      paymentId: 'pay-1',
      amount: new Prisma.Decimal(100),
      schedule: {
        importoTotale: new Prisma.Decimal(100),
        importoPagato: new Prisma.Decimal(100),
        tipo: 'passiva',
        supplierId: 'sup-1',
      },
    } as never)

    await undoScheduleReconciliation({ reconciliationId: 'rec-1', venueId: VENUE })

    expect(ricalcolaStimeFornitore).toHaveBeenCalledWith('sup-1', VENUE)
  })

  it("l'undo su una scadenza senza fornitore non ricalcola nulla", async () => {
    vi.mocked(prisma.schedule.findFirst).mockResolvedValue(
      scadenza({
        stato: 'pagata',
        importoPagato: new Prisma.Decimal(100),
        dataAttesaSource: 'riconciliazione',
        supplierId: null,
      }) as never
    )
    vi.mocked(prisma.scheduleReconciliation.findFirst).mockResolvedValue({
      id: 'rec-1',
      scheduleId: 'sched-1',
      paymentId: 'pay-1',
      amount: new Prisma.Decimal(100),
    } as never)

    await undoScheduleReconciliation({ reconciliationId: 'rec-1', venueId: VENUE })

    expect(ricalcolaStimeFornitore).not.toHaveBeenCalled()
    expect(applicaStimaSuScadenza).toHaveBeenCalledWith('sched-1', VENUE)
  })
})

describe('reconcileScheduleWithEntry - ereditarietà pro-quota dalla fattura (Fase 3)', () => {
  it('fattura con righe tutte categorizzate: il movimento eredita le fette pro-quota e il dominante si allinea', async () => {
    vi.mocked(prisma.schedule.findFirst).mockResolvedValue(
      scadenza({ invoiceId: 'inv-1', importoTotale: new Prisma.Decimal(1000) }) as never
    )
    vi.mocked(prisma.journalEntry.findFirst).mockResolvedValue(
      movimento({ creditAmount: new Prisma.Decimal(1000) }) as never
    )
    vi.mocked(prisma.electronicInvoice.findUnique).mockResolvedValue({
      lineItems: [{ numeroLinea: 1 }, { numeroLinea: 2 }],
    } as never)
    vi.mocked(prisma.invoiceLineAccount.findMany).mockResolvedValue([
      { accountId: 'conto-a', importo: new Prisma.Decimal(700) },
      { accountId: 'conto-b', importo: new Prisma.Decimal(300) },
    ] as never)
    // Prima chiamata: verifica fette 'manuale' preesistenti (nessuna).
    // Seconda chiamata: rilettura di TUTTE le fette dopo la scrittura, per
    // il calcolo del dominante (aggiornaContoDominante).
    vi.mocked(prisma.journalEntryAllocation.findMany)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { accountId: 'conto-a', importo: new Prisma.Decimal(700) },
        { accountId: 'conto-b', importo: new Prisma.Decimal(300) },
      ] as never)
    vi.mocked(derivaBudgetCategoryDaConto).mockResolvedValue('cat-a')

    const esito = await reconcileScheduleWithEntry({
      scheduleId: 'sched-1',
      journalEntryId: 'entry-1',
      venueId: VENUE,
      userId: 'user-1',
    })

    expect(esito.outcome).toBe('ok')
    // Il where include ora lo stato: eredita solo ciò che un umano ha
    // confermato (F2-ALL-001). Questa asserzione documentava il contratto
    // precedente, in cui una proposta dell'AI pesava quanto una conferma.
    expect(prisma.invoiceLineAccount.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { invoiceId: 'inv-1', stato: 'confermata' } })
    )
    expect(prisma.journalEntryAllocation.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          journalEntryId: 'entry-1',
          accountId: 'conto-a',
          origine: 'ereditata',
          reconciliationId: 'rec-1',
        }),
        expect.objectContaining({
          journalEntryId: 'entry-1',
          accountId: 'conto-b',
          origine: 'ereditata',
          reconciliationId: 'rec-1',
        }),
      ],
    })
    const fetteScritte = vi.mocked(prisma.journalEntryAllocation.createMany).mock.calls[0][0]
      .data as Array<{ importo: Prisma.Decimal }>
    expect(fetteScritte.map((f) => Number(f.importo))).toEqual([700, 300])
    expect(prisma.journalEntry.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'entry-1' },
        data: expect.objectContaining({ accountId: 'conto-a', categorizationSource: 'split' }),
      })
    )
  })

  it('pagamento parziale: le fette ereditate sono pro-quota sull\'importo saldato', async () => {
    vi.mocked(prisma.schedule.findFirst).mockResolvedValue(
      scadenza({ invoiceId: 'inv-1', importoTotale: new Prisma.Decimal(1000) }) as never
    )
    vi.mocked(prisma.journalEntry.findFirst).mockResolvedValue(
      movimento({ creditAmount: new Prisma.Decimal(500) }) as never
    )
    vi.mocked(prisma.electronicInvoice.findUnique).mockResolvedValue({
      lineItems: [{ numeroLinea: 1 }, { numeroLinea: 2 }],
    } as never)
    vi.mocked(prisma.invoiceLineAccount.findMany).mockResolvedValue([
      { accountId: 'conto-a', importo: new Prisma.Decimal(700) },
      { accountId: 'conto-b', importo: new Prisma.Decimal(300) },
    ] as never)
    vi.mocked(prisma.journalEntryAllocation.findMany)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { accountId: 'conto-a', importo: new Prisma.Decimal(350) },
        { accountId: 'conto-b', importo: new Prisma.Decimal(150) },
      ] as never)
    vi.mocked(derivaBudgetCategoryDaConto).mockResolvedValue('cat-a')

    const esito = await reconcileScheduleWithEntry({
      scheduleId: 'sched-1',
      journalEntryId: 'entry-1',
      venueId: VENUE,
      userId: 'user-1',
    })

    expect(esito.outcome).toBe('ok')
    const fetteScritte = vi.mocked(prisma.journalEntryAllocation.createMany).mock.calls[0][0]
      .data as Array<{ accountId: string; importo: Prisma.Decimal }>
    expect(fetteScritte.map((f) => ({ accountId: f.accountId, importo: Number(f.importo) }))).toEqual([
      { accountId: 'conto-a', importo: 350 },
      { accountId: 'conto-b', importo: 150 },
    ])
  })

  it('copertura incompleta (righe non tutte categorizzate): nessuna fetta ereditata', async () => {
    vi.mocked(prisma.schedule.findFirst).mockResolvedValue(
      scadenza({ invoiceId: 'inv-2' }) as never
    )
    vi.mocked(prisma.journalEntry.findFirst).mockResolvedValue(movimento() as never)
    vi.mocked(prisma.electronicInvoice.findUnique).mockResolvedValue({
      lineItems: [{ numeroLinea: 1 }, { numeroLinea: 2 }],
    } as never)
    // Una sola riga imputata su due: copertura incompleta
    vi.mocked(prisma.invoiceLineAccount.findMany).mockResolvedValue([
      { accountId: 'conto-a', importo: new Prisma.Decimal(100) },
    ] as never)

    const esito = await reconcileScheduleWithEntry({
      scheduleId: 'sched-1',
      journalEntryId: 'entry-1',
      venueId: VENUE,
      userId: 'user-1',
    })

    expect(esito.outcome).toBe('ok')
    expect(prisma.journalEntryAllocation.createMany).not.toHaveBeenCalled()
  })

  it('fette manuali preesistenti sul movimento: no-op (le manuali vincono)', async () => {
    vi.mocked(prisma.schedule.findFirst).mockResolvedValue(
      scadenza({ invoiceId: 'inv-3' }) as never
    )
    vi.mocked(prisma.journalEntry.findFirst).mockResolvedValue(movimento() as never)
    vi.mocked(prisma.electronicInvoice.findUnique).mockResolvedValue({
      lineItems: [{ numeroLinea: 1 }],
    } as never)
    vi.mocked(prisma.invoiceLineAccount.findMany).mockResolvedValue([
      { accountId: 'conto-a', importo: new Prisma.Decimal(100) },
    ] as never)
    // Il movimento ha già una fetta 'manuale': vince e blocca l'ereditarietà
    vi.mocked(prisma.journalEntryAllocation.findMany).mockResolvedValue([
      { accountId: 'conto-manuale', importo: new Prisma.Decimal(100) },
    ] as never)

    const esito = await reconcileScheduleWithEntry({
      scheduleId: 'sched-1',
      journalEntryId: 'entry-1',
      venueId: VENUE,
      userId: 'user-1',
    })

    expect(esito.outcome).toBe('ok')
    expect(prisma.journalEntryAllocation.createMany).not.toHaveBeenCalled()
  })

  it('movimento che riconcilia più scadenze: se le fette già ereditate più la nuova quota superano l\'importo utile del movimento, l\'ereditarietà si astiene (non scrive oltre l\'importo)', async () => {
    // Il movimento vale 1000: una prima riconciliazione (altra scadenza,
    // altra fattura) ha già ereditato fette per 600. Questa riconciliazione
    // (scadenza-2, fattura inv-4) userebbe il disponibile pieno del
    // movimento (1000) per calcolare la propria quota, non il residuo dopo
    // la prima riconciliazione: quota 500, che sommata alle 600 già
    // scritte (1100) sfora l'importo utile del movimento (1000).
    vi.mocked(prisma.schedule.findFirst).mockResolvedValue(
      scadenza({ id: 'sched-2', invoiceId: 'inv-4', importoTotale: new Prisma.Decimal(500) }) as never
    )
    vi.mocked(prisma.journalEntry.findFirst).mockResolvedValue(
      movimento({ creditAmount: new Prisma.Decimal(1000) }) as never
    )
    vi.mocked(prisma.electronicInvoice.findUnique).mockResolvedValue({
      lineItems: [{ numeroLinea: 1 }],
    } as never)
    vi.mocked(prisma.invoiceLineAccount.findMany).mockResolvedValue([
      { accountId: 'conto-c', importo: new Prisma.Decimal(500) },
    ] as never)
    // Nessuna fetta 'manuale' sul movimento (la ereditaFetteDaFattura fa
    // sempre questo controllo per prima)
    vi.mocked(prisma.journalEntryAllocation.findMany).mockResolvedValue([])
    // Ma il movimento ha già 600 di fette 'ereditata' da un'altra
    // riconciliazione: è quello che l'aggregate deve intercettare.
    vi.mocked(prisma.journalEntryAllocation.aggregate).mockResolvedValue({
      _sum: { importo: new Prisma.Decimal(600) },
    } as never)

    const esito = await reconcileScheduleWithEntry({
      scheduleId: 'sched-2',
      journalEntryId: 'entry-1',
      venueId: VENUE,
      userId: 'user-1',
    })

    // La riconciliazione procede comunque (l'astensione riguarda solo
    // l'ereditarietà, non il pagamento della scadenza)
    expect(esito.outcome).toBe('ok')
    expect(prisma.journalEntryAllocation.createMany).not.toHaveBeenCalled()
    expect(logger.warn).toHaveBeenCalled()
  })

  it('scadenza senza invoiceId: nessuna lettura della fattura', async () => {
    vi.mocked(prisma.schedule.findFirst).mockResolvedValue(scadenza() as never)
    vi.mocked(prisma.journalEntry.findFirst).mockResolvedValue(movimento() as never)

    const esito = await reconcileScheduleWithEntry({
      scheduleId: 'sched-1',
      journalEntryId: 'entry-1',
      venueId: VENUE,
      userId: 'user-1',
    })

    expect(esito.outcome).toBe('ok')
    expect(prisma.electronicInvoice.findUnique).not.toHaveBeenCalled()
    expect(prisma.invoiceLineAccount.findMany).not.toHaveBeenCalled()
    expect(prisma.journalEntryAllocation.createMany).not.toHaveBeenCalled()
  })
})

describe('undoScheduleReconciliation - ritiro delle fette ereditate (Fase 3)', () => {
  function riconciliazione(overrides: Record<string, unknown> = {}) {
    return {
      id: 'rec-1',
      scheduleId: 'sched-1',
      journalEntryId: 'entry-1',
      paymentId: 'pay-1',
      amount: new Prisma.Decimal(100),
      schedule: {
        importoTotale: new Prisma.Decimal(100),
        importoPagato: new Prisma.Decimal(100),
        tipo: 'passiva',
        supplierId: null,
      },
      ...overrides,
    }
  }

  it("rimuove SOLO le fette della propria riconciliazione (deleteMany con il reconciliationId giusto)", async () => {
    vi.mocked(prisma.scheduleReconciliation.findFirst).mockResolvedValue(riconciliazione() as never)
    vi.mocked(prisma.journalEntryAllocation.deleteMany).mockResolvedValue({ count: 0 } as never)

    const esito = await undoScheduleReconciliation({ reconciliationId: 'rec-1', venueId: VENUE })

    expect(esito.outcome).toBe('ok')
    expect(prisma.journalEntryAllocation.deleteMany).toHaveBeenCalledWith({
      where: { reconciliationId: 'rec-1' },
    })
  })

  it('la deleteMany delle fette avviene PRIMA della cancellazione della riconciliazione (la FK è onDelete: SetNull)', async () => {
    vi.mocked(prisma.scheduleReconciliation.findFirst).mockResolvedValue(riconciliazione() as never)
    vi.mocked(prisma.journalEntryAllocation.deleteMany).mockResolvedValue({ count: 2 } as never)
    vi.mocked(prisma.journalEntryAllocation.findMany).mockResolvedValue([])

    await undoScheduleReconciliation({ reconciliationId: 'rec-1', venueId: VENUE })

    const ordineDelete = vi.mocked(prisma.journalEntryAllocation.deleteMany).mock
      .invocationCallOrder[0]
    const ordineCancellazioneRiconciliazione = vi.mocked(prisma.scheduleReconciliation.delete).mock
      .invocationCallOrder[0]
    expect(ordineDelete).toBeLessThan(ordineCancellazioneRiconciliazione)
  })

  it('con fette residue dopo il ritiro: il dominante si ricalcola su quelle rimaste', async () => {
    vi.mocked(prisma.scheduleReconciliation.findFirst).mockResolvedValue(riconciliazione() as never)
    vi.mocked(prisma.journalEntryAllocation.deleteMany).mockResolvedValue({ count: 1 } as never)
    vi.mocked(prisma.journalEntryAllocation.findMany).mockResolvedValue([
      { accountId: 'conto-manuale', importo: new Prisma.Decimal(60) },
      { accountId: 'conto-b', importo: new Prisma.Decimal(40) },
    ] as never)
    vi.mocked(derivaBudgetCategoryDaConto).mockResolvedValue('cat-manuale')

    const esito = await undoScheduleReconciliation({ reconciliationId: 'rec-1', venueId: VENUE })

    expect(esito.outcome).toBe('ok')
    expect(prisma.journalEntry.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'entry-1' },
        data: expect.objectContaining({
          accountId: 'conto-manuale',
          categorizationSource: 'split',
        }),
      })
    )
  })

  it('senza fette residue dopo il ritiro: il movimento torna a source "manual" senza cambiare accountId', async () => {
    vi.mocked(prisma.scheduleReconciliation.findFirst).mockResolvedValue(riconciliazione() as never)
    vi.mocked(prisma.journalEntryAllocation.deleteMany).mockResolvedValue({ count: 2 } as never)
    vi.mocked(prisma.journalEntryAllocation.findMany).mockResolvedValue([])

    const esito = await undoScheduleReconciliation({ reconciliationId: 'rec-1', venueId: VENUE })

    expect(esito.outcome).toBe('ok')
    expect(prisma.journalEntry.update).toHaveBeenCalledWith({
      where: { id: 'entry-1' },
      data: { categorizationSource: 'manual' },
    })
    expect(prisma.journalEntry.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ accountId: expect.anything() }) })
    )
  })

  it('nessuna fetta da ritirare (deleteMany count 0): il movimento non viene toccato', async () => {
    vi.mocked(prisma.scheduleReconciliation.findFirst).mockResolvedValue(riconciliazione() as never)
    vi.mocked(prisma.journalEntryAllocation.deleteMany).mockResolvedValue({ count: 0 } as never)

    const esito = await undoScheduleReconciliation({ reconciliationId: 'rec-1', venueId: VENUE })

    expect(esito.outcome).toBe('ok')
    expect(prisma.journalEntryAllocation.findMany).not.toHaveBeenCalled()
    expect(prisma.journalEntry.update).not.toHaveBeenCalled()
  })
})

describe("reconcileScheduleWithEntry - solo le imputazioni confermate ereditano", () => {
  it("un'ipotesi dell'AI mai confermata non riscrive il conto del movimento", async () => {
    // Difetto F2-ALL-001 dell'audit W5-F2, il più grave dell'area: esisteva un
    // percorso interamente automatico dall'ipotesi del modello fino al conto su
    // cui il budget conta i soldi, senza un essere umano in mezzo.
    //
    // Fattura mista da 1.200 €, l'AI ipotizza 700 «Pulizie» e 500 «Alimentari»,
    // nessuno apre la fattura. Due settimane dopo si riconcilia il bonifico: da
    // quel momento il movimento risulta imputato a Pulizie, e il budget ci
    // manda sopra TUTTI e 1.200 €. L'audit registrava la riconciliazione ma non
    // la riscrittura del conto, e il valore precedente non era salvato da
    // nessuna parte: un difetto che cancellava le proprie tracce.
    vi.mocked(prisma.schedule.findFirst).mockResolvedValue(
      scadenza({ invoiceId: 'inv-1', importoTotale: new Prisma.Decimal(1200) }) as never
    )
    vi.mocked(prisma.journalEntry.findFirst).mockResolvedValue(
      movimento({ creditAmount: new Prisma.Decimal(1200) }) as never
    )
    vi.mocked(prisma.electronicInvoice.findUnique).mockResolvedValue({
      lineItems: [{ numeroLinea: 1 }, { numeroLinea: 2 }],
    } as never)
    // Il database restituisce solo le confermate, perché il filtro è nel where:
    // se il codice sotto test non lo passa, questo mock non se ne accorge — per
    // questo il where viene verificato esplicitamente più sotto.
    vi.mocked(prisma.invoiceLineAccount.findMany).mockResolvedValue([] as never)
    vi.mocked(prisma.journalEntryAllocation.findMany).mockResolvedValue([] as never)

    const esito = await reconcileScheduleWithEntry({
      scheduleId: 'sched-1',
      journalEntryId: 'entry-1',
      venueId: VENUE,
      userId: 'user-1',
    })

    // La riconciliazione va a buon fine: è l'ereditarietà che si astiene.
    expect(esito.outcome).toBe('ok')

    // La query deve chiedere SOLO le confermate.
    expect(prisma.invoiceLineAccount.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ invoiceId: 'inv-1', stato: 'confermata' }),
      })
    )

    // E soprattutto: il conto del movimento non è stato riscritto.
    const riscritture = vi
      .mocked(prisma.journalEntry.update)
      .mock.calls.filter((c) => 'accountId' in ((c[0] as { data?: object })?.data ?? {}))
    expect(riscritture).toHaveLength(0)
  })

  it('se solo una parte delle righe è confermata, l ereditarietà si astiene', async () => {
    // La guardia esistente conta le imputazioni contro le righe della fattura.
    // Contava le righe senza guardarne lo stato, quindi una fattura interamente
    // «gialla» la superava. Col filtro, una fattura mezza confermata non arriva
    // al conteggio pieno e l'astensione scatta da sé.
    vi.mocked(prisma.schedule.findFirst).mockResolvedValue(
      scadenza({ invoiceId: 'inv-1', importoTotale: new Prisma.Decimal(1000) }) as never
    )
    vi.mocked(prisma.journalEntry.findFirst).mockResolvedValue(
      movimento({ creditAmount: new Prisma.Decimal(1000) }) as never
    )
    vi.mocked(prisma.electronicInvoice.findUnique).mockResolvedValue({
      lineItems: [{ numeroLinea: 1 }, { numeroLinea: 2 }],
    } as never)
    vi.mocked(prisma.invoiceLineAccount.findMany).mockResolvedValue([
      { accountId: 'conto-a', importo: new Prisma.Decimal(700) },
    ] as never)
    vi.mocked(prisma.journalEntryAllocation.findMany).mockResolvedValue([] as never)

    const esito = await reconcileScheduleWithEntry({
      scheduleId: 'sched-1',
      journalEntryId: 'entry-1',
      venueId: VENUE,
      userId: 'user-1',
    })

    expect(esito.outcome).toBe('ok')
    expect(prisma.journalEntryAllocation.createMany).not.toHaveBeenCalled()
  })
})

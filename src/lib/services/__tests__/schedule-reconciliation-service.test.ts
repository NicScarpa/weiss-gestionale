import { describe, it, expect, vi, beforeEach } from 'vitest'

// Il service è tutto accesso al database: si mocka prisma e si osserva cosa
// scrive. $transaction esegue la callback passando il mock stesso come tx.
// `$queryRaw` copre i lock di riga (SELECT ... FOR UPDATE) che il service
// prende su movimento e scadenza prima di decidere.
vi.mock('@/lib/prisma', () => ({
  prisma: {
    schedule: { findFirst: vi.fn(), update: vi.fn(), count: vi.fn() },
    journalEntry: { findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    costCenter: { findUnique: vi.fn(), findFirst: vi.fn() },
    account: { findMany: vi.fn() },
    scheduleReconciliation: {
      findFirst: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      aggregate: vi.fn(),
    },
    schedulePayment: { create: vi.fn(), delete: vi.fn(), aggregate: vi.fn() },
    electronicInvoice: { update: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
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

vi.mock('@/lib/sdi/parser', () => ({
  parseFatturaPA: vi.fn(),
}))

import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { logger } from '@/lib/logger'
import { applicaStimaSuScadenza, ricalcolaStimeFornitore } from '@/lib/scadenzario/stima-data-attesa'
import { derivaBudgetCategoryDaConto } from '@/lib/accounts/mapping'
import { parseFatturaPA } from '@/lib/sdi/parser'
import { LINEA_BOLLO } from '@/lib/sdi/righe-di-sistema'
import {
  reconcileScheduleWithEntry,
  undoScheduleReconciliation,
} from '../schedule-reconciliation-service'

const VENUE = 'venue-1'
const CENTRO_STR = { id: 'cc-str', code: 'STR', isDefault: true, isActive: true }
const CENTRO_WEISS = { id: 'cc-weiss', code: 'WEISS', isDefault: false, isActive: true }

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
  // Default: nessuna nota di credito rettifica la fattura in lavorazione, così
  // i test che non riguardano il Task 6 non devono preoccuparsene.
  vi.mocked(prisma.electronicInvoice.findMany).mockResolvedValue([] as never)
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
  // È la stessa lettura che dice se ci sono fette manuali e quanta IVA
  // dichiarano quelle già scritte: una sola, come nel servizio.
  vi.mocked(prisma.journalEntryAllocation.findMany).mockResolvedValue([] as never)
  // L'anagrafica dei centri, che l'ereditarietà interroga per rivalutare il
  // centro contro il conto arrivato dalle fette (percorso automatico).
  vi.mocked(prisma.costCenter.findFirst).mockImplementation(
    (async ({ where }: { where: { isDefault?: boolean; code?: string } }) =>
      where.code === 'WEISS' ? CENTRO_WEISS : where.isDefault ? CENTRO_STR : null) as never
  )
  // Default: il conto dominante non pretende un centro.
  vi.mocked(prisma.account.findMany).mockResolvedValue([] as never)
  vi.mocked(prisma.journalEntry.findUnique).mockResolvedValue({
    costCenterId: null,
    costCenterSource: null,
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
      { accountId: 'conto-a', importo: new Prisma.Decimal(700), numeroLinea: 1 },
      { accountId: 'conto-b', importo: new Prisma.Decimal(300), numeroLinea: 2 },
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
      { accountId: 'conto-a', importo: new Prisma.Decimal(700), numeroLinea: 1 },
      { accountId: 'conto-b', importo: new Prisma.Decimal(300), numeroLinea: 2 },
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

  it('il bonifico importato che eredita un conto OBBLIGATORIO finisce sul locale, non sulla struttura, e resta da approvare', async () => {
    // Il caso da cui nasce la regola: il movimento è nato dall'import senza
    // conto, quindi con il centro che si dà a chi non ne ha uno; la fattura
    // di birra arriva solo ora, con un conto che un centro lo pretende. Prima
    // il costo restava su Struttura, e non comparendo fra i "non attribuiti"
    // non se ne accorgeva nessuno.
    vi.mocked(prisma.schedule.findFirst).mockResolvedValue(
      scadenza({ invoiceId: 'inv-1', importoTotale: new Prisma.Decimal(1000) }) as never
    )
    vi.mocked(prisma.journalEntry.findFirst).mockResolvedValue(
      movimento({ creditAmount: new Prisma.Decimal(1000) }) as never
    )
    vi.mocked(prisma.electronicInvoice.findUnique).mockResolvedValue({
      lineItems: [{ numeroLinea: 1 }],
    } as never)
    vi.mocked(prisma.invoiceLineAccount.findMany).mockResolvedValue([
      { accountId: 'conto-birra', importo: new Prisma.Decimal(1000), numeroLinea: 1 },
    ] as never)
    vi.mocked(prisma.journalEntryAllocation.findMany)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { accountId: 'conto-birra', importo: new Prisma.Decimal(1000) },
      ] as never)
    // Il movimento è anteriore alla colonna di provenienza (source null) e
    // porta il centro di sistema: non è una scelta, è il ripiego di quando il
    // conto ancora non c'era.
    vi.mocked(prisma.journalEntry.findUnique).mockResolvedValue({
      costCenterId: 'cc-str',
      costCenterSource: null,
    } as never)
    vi.mocked(prisma.account.findMany).mockResolvedValue([
      { id: 'conto-birra', code: '600020', name: 'Acquisti bevande', costCenterRule: 'OBBLIGATORIO' },
    ] as never)
    vi.mocked(derivaBudgetCategoryDaConto).mockResolvedValue('cat-bevande')

    const esito = await reconcileScheduleWithEntry({
      scheduleId: 'sched-1',
      journalEntryId: 'entry-1',
      venueId: VENUE,
      userId: 'user-1',
    })

    expect(esito.outcome).toBe('ok')
    expect(prisma.journalEntry.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'entry-1' },
        data: expect.objectContaining({
          accountId: 'conto-birra',
          costCenterId: 'cc-weiss',
          verified: false,
        }),
      })
    )
  })

  it('il movimento già sul centro operativo perché supposto resta lì, e resta da approvare', async () => {
    // Movimento importato dopo la colonna di provenienza: il centro è già
    // WEISS, ma indovinato. Non essendo una scelta, l'ereditarietà lo
    // rivaluta lo stesso — e la rivalutazione conferma WEISS, senza che il
    // movimento diventi per questo approvato.
    vi.mocked(prisma.schedule.findFirst).mockResolvedValue(
      scadenza({ invoiceId: 'inv-1', importoTotale: new Prisma.Decimal(1000) }) as never
    )
    vi.mocked(prisma.journalEntry.findFirst).mockResolvedValue(
      movimento({ creditAmount: new Prisma.Decimal(1000) }) as never
    )
    vi.mocked(prisma.electronicInvoice.findUnique).mockResolvedValue({
      lineItems: [{ numeroLinea: 1 }],
    } as never)
    vi.mocked(prisma.invoiceLineAccount.findMany).mockResolvedValue([
      { accountId: 'conto-birra', importo: new Prisma.Decimal(1000), numeroLinea: 1 },
    ] as never)
    vi.mocked(prisma.journalEntryAllocation.findMany)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { accountId: 'conto-birra', importo: new Prisma.Decimal(1000) },
      ] as never)
    vi.mocked(prisma.journalEntry.findUnique).mockResolvedValue({
      costCenterId: 'cc-weiss',
      costCenterSource: 'supposto',
    } as never)
    vi.mocked(prisma.account.findMany).mockResolvedValue([
      { id: 'conto-birra', code: '600020', name: 'Acquisti bevande', costCenterRule: 'OBBLIGATORIO' },
    ] as never)

    await reconcileScheduleWithEntry({
      scheduleId: 'sched-1',
      journalEntryId: 'entry-1',
      venueId: VENUE,
      userId: 'user-1',
    })

    expect(prisma.journalEntry.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          costCenterId: 'cc-weiss',
          costCenterSource: 'supposto',
          verified: false,
        }),
      })
    )
    // Il centro supposto non è stato riproposto come se fosse una scelta:
    // nessuna findUnique di validazione, la risoluzione è ripartita dal conto.
    expect(prisma.costCenter.findUnique).not.toHaveBeenCalled()
  })

  it('un centro scelto da un umano (CAS) non viene sovrascritto dall\'ereditarietà', async () => {
    vi.mocked(prisma.schedule.findFirst).mockResolvedValue(
      scadenza({ invoiceId: 'inv-1', importoTotale: new Prisma.Decimal(1000) }) as never
    )
    vi.mocked(prisma.journalEntry.findFirst).mockResolvedValue(
      movimento({ creditAmount: new Prisma.Decimal(1000) }) as never
    )
    vi.mocked(prisma.electronicInvoice.findUnique).mockResolvedValue({
      lineItems: [{ numeroLinea: 1 }],
    } as never)
    vi.mocked(prisma.invoiceLineAccount.findMany).mockResolvedValue([
      { accountId: 'conto-birra', importo: new Prisma.Decimal(1000) },
    ] as never)
    vi.mocked(prisma.journalEntryAllocation.findMany)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { accountId: 'conto-birra', importo: new Prisma.Decimal(1000) },
      ] as never)
    vi.mocked(prisma.journalEntry.findUnique).mockResolvedValue({
      costCenterId: 'cc-cas',
      costCenterSource: 'scelto',
    } as never)
    vi.mocked(prisma.costCenter.findUnique).mockResolvedValue({
      id: 'cc-cas', isActive: true,
    } as never)
    vi.mocked(prisma.account.findMany).mockResolvedValue([
      { id: 'conto-birra', code: '600020', name: 'Acquisti bevande', costCenterRule: 'OBBLIGATORIO' },
    ] as never)

    await reconcileScheduleWithEntry({
      scheduleId: 'sched-1',
      journalEntryId: 'entry-1',
      venueId: VENUE,
      userId: 'user-1',
    })

    expect(prisma.journalEntry.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ costCenterId: 'cc-cas', verified: false }),
      })
    )
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

  it('fattura col bollo: le righe vere confermate non bastano, il bollo (-1) non è ancora imputato', async () => {
    vi.mocked(prisma.schedule.findFirst).mockResolvedValue(
      scadenza({ invoiceId: 'inv-bollo' }) as never
    )
    vi.mocked(prisma.journalEntry.findFirst).mockResolvedValue(movimento() as never)
    vi.mocked(prisma.electronicInvoice.findUnique).mockResolvedValue({
      lineItems: [{ numeroLinea: 1 }],
      xmlContent: '<xml>fattura con bollo</xml>',
    } as never)
    vi.mocked(parseFatturaPA).mockReturnValue({ datiBollo: { importoBollo: 2 } } as never)
    // L'unica riga vera è confermata, ma la fattura porta anche un bollo che
    // non è stato imputato a nessun conto: la copertura non è piena.
    vi.mocked(prisma.invoiceLineAccount.findMany).mockResolvedValue([
      { accountId: 'conto-a', importo: new Prisma.Decimal(100), numeroLinea: 1 },
    ] as never)

    const esito = await reconcileScheduleWithEntry({
      scheduleId: 'sched-1',
      journalEntryId: 'entry-1',
      venueId: VENUE,
      userId: 'user-1',
    })

    expect(esito.outcome).toBe('ok')
    expect(prisma.journalEntryAllocation.createMany).not.toHaveBeenCalled()
    expect(logger.info).toHaveBeenCalledWith(
      'Righe fattura non tutte confermate: nessuna ereditarietà pro-quota',
      expect.objectContaining({ righe: 2, confermate: 1 })
    )
  })

  it('fattura col bollo interamente coperta (riga vera + bollo confermati): eredita anche la fetta del bollo, con l\'IVA di entrambe dichiarata', async () => {
    // Riga vera 100 + 22% IVA = 122; bollo 2 senza IVA: lordo 124, che è
    // anche la quota (pagamento pieno, nessuna scalatura). Numeri scelti
    // apposta per cadere esatti sui centesimi e non lasciare dubbi
    // sull'arrotondamento.
    vi.mocked(prisma.schedule.findFirst).mockResolvedValue(
      scadenza({ invoiceId: 'inv-bollo', importoTotale: new Prisma.Decimal(124) }) as never
    )
    vi.mocked(prisma.journalEntry.findFirst).mockResolvedValue(
      movimento({ creditAmount: new Prisma.Decimal(124) }) as never
    )
    vi.mocked(prisma.electronicInvoice.findUnique).mockResolvedValue({
      lineItems: [{ numeroLinea: 1, aliquotaIVA: 22 }],
      xmlContent: '<xml>fattura con bollo</xml>',
    } as never)
    vi.mocked(parseFatturaPA).mockReturnValue({ datiBollo: { importoBollo: 2 } } as never)
    vi.mocked(prisma.invoiceLineAccount.findMany).mockResolvedValue([
      { accountId: 'conto-a', importo: new Prisma.Decimal(100), numeroLinea: 1 },
      { accountId: 'conto-bollo', importo: new Prisma.Decimal(2), numeroLinea: LINEA_BOLLO },
    ] as never)
    vi.mocked(prisma.journalEntryAllocation.findMany)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { accountId: 'conto-a', importo: new Prisma.Decimal(122) },
        { accountId: 'conto-bollo', importo: new Prisma.Decimal(2) },
      ] as never)
    vi.mocked(derivaBudgetCategoryDaConto).mockResolvedValue('cat-a')

    const esito = await reconcileScheduleWithEntry({
      scheduleId: 'sched-1',
      journalEntryId: 'entry-1',
      venueId: VENUE,
      userId: 'user-1',
    })

    expect(esito.outcome).toBe('ok')
    expect(prisma.journalEntryAllocation.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({ accountId: 'conto-a' }),
        expect.objectContaining({ accountId: 'conto-bollo' }),
      ],
    })
    // La riga vera porta la sua IVA al 22% e il bollo la sua (zero): se
    // `aliquotePerLinea` non desse un'aliquota al bollo, `ivaNota` cadrebbe
    // per l'intero movimento e ANCHE la fetta di `conto-a` finirebbe con
    // `iva: null` — non solo quella del bollo. Per questo si controllano
    // entrambe le fette, non solo quella del bollo.
    const fetteScritte = vi.mocked(prisma.journalEntryAllocation.createMany).mock.calls[0][0]
      .data as Array<{ accountId: string; importo: Prisma.Decimal; iva: Prisma.Decimal | null }>
    expect(
      fetteScritte.map((f) => ({ accountId: f.accountId, importo: Number(f.importo), iva: f.iva === null ? null : Number(f.iva) }))
    ).toEqual([
      { accountId: 'conto-a', importo: 122, iva: 22 },
      { accountId: 'conto-bollo', importo: 2, iva: 0 },
    ])
  })

  it('riga divisa fra due conti: entrambe le quote ricevono l\'aliquota della riga madre, non una a testa', async () => {
    // Riga 1 unica nello snapshot, 22% IVA, divisa 60/40 fra due conti
    // (Task 5): 60 di detersivi + 40 di tovaglioli, stesso numeroLinea,
    // progressivo diverso. Lordo 60*1,22 + 40*1,22 = 122, che è anche la
    // quota (pagamento pieno).
    vi.mocked(prisma.schedule.findFirst).mockResolvedValue(
      scadenza({ invoiceId: 'inv-divisa', importoTotale: new Prisma.Decimal(122) }) as never
    )
    vi.mocked(prisma.journalEntry.findFirst).mockResolvedValue(
      movimento({ creditAmount: new Prisma.Decimal(122) }) as never
    )
    vi.mocked(prisma.electronicInvoice.findUnique).mockResolvedValue({
      lineItems: [{ numeroLinea: 1, aliquotaIVA: 22 }],
      xmlContent: '<xml>fattura divisa</xml>',
    } as never)
    vi.mocked(parseFatturaPA).mockReturnValue({} as never)
    vi.mocked(prisma.invoiceLineAccount.findMany).mockResolvedValue([
      { accountId: 'conto-detersivi', importo: new Prisma.Decimal(60), numeroLinea: 1 },
      { accountId: 'conto-tovaglioli', importo: new Prisma.Decimal(40), numeroLinea: 1 },
    ] as never)
    vi.mocked(prisma.journalEntryAllocation.findMany)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { accountId: 'conto-detersivi', importo: new Prisma.Decimal(73.2) },
        { accountId: 'conto-tovaglioli', importo: new Prisma.Decimal(48.8) },
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
      .data as Array<{ accountId: string; importo: Prisma.Decimal; iva: Prisma.Decimal | null }>
    // L'aliquota attesa (22%) viene dichiarata qui, dalla riga 1 dello
    // snapshot passato sopra a `electronicInvoice.findUnique` — non dalla
    // stessa mappa che il codice sotto test costruisce. Un test che rilegge
    // quella mappa passerebbe anche se il codice smettesse di condividere
    // l'aliquota fra le due quote.
    const aliquotaRigaMadre = 22
    expect(
      fetteScritte.map((f) => ({
        accountId: f.accountId,
        importo: Number(f.importo),
        iva: f.iva === null ? null : Number(f.iva),
      }))
    ).toEqual([
      { accountId: 'conto-detersivi', importo: 73.2, iva: 60 * (aliquotaRigaMadre / 100) },
      { accountId: 'conto-tovaglioli', importo: 48.8, iva: 40 * (aliquotaRigaMadre / 100) },
    ])
  })

  it('fattura con XML non più parsabile: si assume nessuna riga di sistema e si logga', async () => {
    vi.mocked(prisma.schedule.findFirst).mockResolvedValue(
      scadenza({ invoiceId: 'inv-1' }) as never
    )
    vi.mocked(prisma.journalEntry.findFirst).mockResolvedValue(movimento() as never)
    vi.mocked(prisma.electronicInvoice.findUnique).mockResolvedValue({
      lineItems: [{ numeroLinea: 1 }],
      xmlContent: '<xml>corrotto</xml>',
    } as never)
    // Once, non Implementation: `vi.clearAllMocks()` nel beforeEach azzera le
    // chiamate registrate ma NON le implementazioni installate con
    // `mockImplementation` — un `mockImplementation` qui lascerebbe il parser
    // lanciante per tutti i test successivi del file, con un fallimento che
    // sembrerebbe provenire da tutt'altro test.
    vi.mocked(parseFatturaPA).mockImplementationOnce(() => {
      throw new Error('Formato XML non riconosciuto')
    })
    // L'unica riga è confermata: senza righe di sistema la copertura è piena
    // anche se l'XML non è più leggibile (non ci si astiene dall'intera
    // ereditarietà solo perché non si può contare il bollo).
    vi.mocked(prisma.invoiceLineAccount.findMany).mockResolvedValue([
      { accountId: 'conto-a', importo: new Prisma.Decimal(100), numeroLinea: 1 },
    ] as never)
    vi.mocked(prisma.journalEntryAllocation.findMany)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ accountId: 'conto-a', importo: new Prisma.Decimal(100) }] as never)
    vi.mocked(derivaBudgetCategoryDaConto).mockResolvedValue('cat-a')

    const esito = await reconcileScheduleWithEntry({
      scheduleId: 'sched-1',
      journalEntryId: 'entry-1',
      venueId: VENUE,
      userId: 'user-1',
    })

    expect(esito.outcome).toBe('ok')
    expect(prisma.journalEntryAllocation.createMany).toHaveBeenCalled()
    expect(logger.warn).toHaveBeenCalledWith(
      'XML della fattura non parsabile: si assume nessuna riga di sistema',
      expect.objectContaining({ invoiceId: 'inv-1' })
    )
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
      { accountId: 'conto-a', importo: new Prisma.Decimal(100), numeroLinea: 1 },
    ] as never)
    // Il movimento ha già una fetta 'manuale': vince e blocca l'ereditarietà
    vi.mocked(prisma.journalEntryAllocation.findMany).mockResolvedValue([
      { accountId: 'conto-manuale', importo: new Prisma.Decimal(100), origine: 'manuale' },
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
      { accountId: 'conto-c', importo: new Prisma.Decimal(500), numeroLinea: 1 },
    ] as never)
    // Nessuna fetta 'manuale' sul movimento, ma 600 già 'ereditata' da
    // un'altra riconciliazione: è la somma che la guardia deve intercettare.
    vi.mocked(prisma.journalEntryAllocation.findMany).mockResolvedValue([
      { accountId: 'conto-b', importo: new Prisma.Decimal(600), origine: 'ereditata', iva: null },
    ] as never)

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

  it('riga di sconto negativa: il conto sparisce dai pesi e l\'ereditarietà lo dice', async () => {
    // Il `PrezzoTotale` negativo arriva dal parser senza normalizzazione e
    // l'imputazione per riga lo accetta: il conto che lo riceve va sotto zero
    // e viene scartato dai pesi. Le fette rimaste quadrano con la quota ma non
    // più con il documento — l'approssimazione è deliberata (vedi il docblock
    // di `calcolaPesiConIva`), il silenzio no.
    vi.mocked(prisma.schedule.findFirst).mockResolvedValue(
      scadenza({ invoiceId: 'inv-5', importoTotale: new Prisma.Decimal(978) }) as never
    )
    vi.mocked(prisma.journalEntry.findFirst).mockResolvedValue(
      movimento({ creditAmount: new Prisma.Decimal(978) }) as never
    )
    vi.mocked(prisma.electronicInvoice.findUnique).mockResolvedValue({
      lineItems: [
        { numeroLinea: 1, aliquotaIVA: 10 },
        { numeroLinea: 2, aliquotaIVA: 22 },
      ],
    } as never)
    vi.mocked(prisma.invoiceLineAccount.findMany).mockResolvedValue([
      { accountId: 'alimentari', importo: new Prisma.Decimal(1000), numeroLinea: 1 },
      { accountId: 'sconti', importo: new Prisma.Decimal(-100), numeroLinea: 2 },
    ] as never)
    vi.mocked(prisma.journalEntryAllocation.findMany)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { accountId: 'alimentari', importo: new Prisma.Decimal(978) },
      ] as never)
    vi.mocked(derivaBudgetCategoryDaConto).mockResolvedValue('cat-a')

    const esito = await reconcileScheduleWithEntry({
      scheduleId: 'sched-1',
      journalEntryId: 'entry-1',
      venueId: VENUE,
      userId: 'user-1',
    })

    expect(esito.outcome).toBe('ok')
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('righe scartate dai pesi'),
      expect.objectContaining({ invoiceId: 'inv-5', contiScartati: 1, contiNeiPesi: 1 })
    )
    // Una sola fetta, con la propria IVA ancora dichiarata: 100 riscalati
    // sulla quota effettivamente pagata.
    const fetteScritte = vi.mocked(prisma.journalEntryAllocation.createMany).mock.calls[0][0]
      .data as Array<{ accountId: string; iva: Prisma.Decimal | null }>
    expect(fetteScritte).toHaveLength(1)
    expect(Number(fetteScritte[0].iva)).toBeCloseTo(88.91, 2)
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

/**
 * Una nota di credito non genera una scadenza propria (è TD04/05/08/09): si
 * compensa sul pagamento successivo. Il collegamento (`rettificaInvoiceId`) è
 * già risolto all'import (route.ts) e qui si assume presente; questi test
 * riguardano solo cosa fa `ereditaFetteDaFattura` con le note collegate.
 */
describe('reconcileScheduleWithEntry - nota di credito che rettifica (Task 6)', () => {
  it('nota di credito imputata per intero: sottrae i pesi della riga che rettifica, che sparisce dai pesi', async () => {
    // Fattura mista: alimentari 1.000 @10% (1.100 lordi), pulizia 100 @22%
    // (122 lordi) — totale 1.222. Nota di credito: i detersivi resi, 100 @22%
    // (122 lordi), interamente imputata sullo stesso conto pulizia. Pagamento
    // di 1.100 (il residuo dopo la nota): atteso alimentari 1.100 / 0 pulizia,
    // non la proporzione vecchia (990 / 110) che ignorava la nota.
    vi.mocked(prisma.schedule.findFirst).mockResolvedValue(
      scadenza({ invoiceId: 'inv-mista', importoTotale: new Prisma.Decimal(1222) }) as never
    )
    vi.mocked(prisma.journalEntry.findFirst).mockResolvedValue(
      movimento({ creditAmount: new Prisma.Decimal(1100) }) as never
    )
    vi.mocked(prisma.electronicInvoice.findUnique).mockResolvedValue({
      lineItems: [
        { numeroLinea: 1, aliquotaIVA: 10 },
        { numeroLinea: 2, aliquotaIVA: 22 },
      ],
      xmlContent: null,
    } as never)
    // La nota di credito che rettifica 'inv-mista' (rettificaInvoiceId
    // risolto all'import, non a questo livello).
    vi.mocked(prisma.electronicInvoice.findMany).mockResolvedValue([
      { id: 'nota-1', lineItems: [{ numeroLinea: 1, aliquotaIVA: 22 }], xmlContent: null },
    ] as never)
    vi.mocked(prisma.invoiceLineAccount.findMany)
      .mockResolvedValueOnce([
        { accountId: 'alimentari', importo: new Prisma.Decimal(1000), numeroLinea: 1 },
        { accountId: 'pulizia', importo: new Prisma.Decimal(100), numeroLinea: 2 },
      ] as never) // imputazioni della fattura
      .mockResolvedValueOnce([
        { accountId: 'pulizia', importo: new Prisma.Decimal(100), numeroLinea: 1 },
      ] as never) // imputazioni della nota di credito (interamente confermata)
    vi.mocked(prisma.journalEntryAllocation.findMany)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ accountId: 'alimentari', importo: new Prisma.Decimal(1100) }] as never)
    vi.mocked(derivaBudgetCategoryDaConto).mockResolvedValue('cat-alimentari')

    const esito = await reconcileScheduleWithEntry({
      scheduleId: 'sched-1',
      journalEntryId: 'entry-1',
      venueId: VENUE,
      userId: 'user-1',
    })

    expect(esito.outcome).toBe('ok')
    // La nota è letta cercando le fatture che LA hanno come rettifica, cioè
    // per rettificaInvoiceId uguale alla fattura in pagamento.
    expect(prisma.electronicInvoice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { rettificaInvoiceId: 'inv-mista' } })
    )
    // Pulizia sparisce: il suo peso (122 lordi) meno quello della nota (122
    // lordi) fa esattamente zero, e `calcolaPesiConIva` lo scarta da sé —
    // niente fetta a 0, non una fetta mancante per errore.
    expect(prisma.journalEntryAllocation.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ accountId: 'alimentari' })],
    })
    const fetteScritte = vi.mocked(prisma.journalEntryAllocation.createMany).mock.calls[0][0]
      .data as Array<{ accountId: string; importo: Prisma.Decimal; iva: Prisma.Decimal | null }>
    expect(
      fetteScritte.map((f) => ({
        accountId: f.accountId,
        importo: Number(f.importo),
        iva: f.iva === null ? null : Number(f.iva),
      }))
    ).toEqual([{ accountId: 'alimentari', importo: 1100, iva: 100 }])
  })

  it('nota di credito non imputata per intero: l\'ereditarietà si astiene dall\'intera fattura', async () => {
    // Sottrarne una parte darebbe un risultato peggiore di non sottrarre
    // nulla, perché sembrerebbe corretto: l'astensione riguarda l'INTERA
    // ereditarietà, non solo la sottrazione.
    vi.mocked(prisma.schedule.findFirst).mockResolvedValue(
      scadenza({ invoiceId: 'inv-mista', importoTotale: new Prisma.Decimal(1222) }) as never
    )
    vi.mocked(prisma.journalEntry.findFirst).mockResolvedValue(
      movimento({ creditAmount: new Prisma.Decimal(1100) }) as never
    )
    vi.mocked(prisma.electronicInvoice.findUnique).mockResolvedValue({
      lineItems: [
        { numeroLinea: 1, aliquotaIVA: 10 },
        { numeroLinea: 2, aliquotaIVA: 22 },
      ],
      xmlContent: null,
    } as never)
    vi.mocked(prisma.electronicInvoice.findMany).mockResolvedValue([
      { id: 'nota-1', lineItems: [{ numeroLinea: 1, aliquotaIVA: 22 }], xmlContent: null },
    ] as never)
    vi.mocked(prisma.invoiceLineAccount.findMany)
      .mockResolvedValueOnce([
        { accountId: 'alimentari', importo: new Prisma.Decimal(1000), numeroLinea: 1 },
        { accountId: 'pulizia', importo: new Prisma.Decimal(100), numeroLinea: 2 },
      ] as never) // fattura: interamente confermata
      .mockResolvedValueOnce([] as never) // nota di credito: nessuna riga confermata

    const esito = await reconcileScheduleWithEntry({
      scheduleId: 'sched-1',
      journalEntryId: 'entry-1',
      venueId: VENUE,
      userId: 'user-1',
    })

    // L'astensione riguarda solo l'ereditarietà: la riconciliazione della
    // scadenza procede comunque (stesso principio delle altre guardie).
    expect(esito.outcome).toBe('ok')
    expect(prisma.journalEntryAllocation.createMany).not.toHaveBeenCalled()
    expect(logger.info).toHaveBeenCalledWith(
      "Nota di credito non imputata per intero: l'ereditarietà si astiene dall'intera fattura",
      expect.objectContaining({ invoiceId: 'inv-mista', notaId: 'nota-1', righe: 1, confermate: 0 })
    )
  })

  it('nota di credito più grande della riga che rettifica: peso negativo, ereditarietà sospesa', async () => {
    // La nota (150 @22% = 183 lordi) supera il peso della riga pulizia che
    // dovrebbe rettificare (100 @22% = 122 lordi): un caso da guardare, non
    // da indovinare. Si segnala e ci si ferma, non si scrive nulla.
    vi.mocked(prisma.schedule.findFirst).mockResolvedValue(
      scadenza({ invoiceId: 'inv-mista', importoTotale: new Prisma.Decimal(1222) }) as never
    )
    vi.mocked(prisma.journalEntry.findFirst).mockResolvedValue(
      movimento({ creditAmount: new Prisma.Decimal(1100) }) as never
    )
    vi.mocked(prisma.electronicInvoice.findUnique).mockResolvedValue({
      lineItems: [
        { numeroLinea: 1, aliquotaIVA: 10 },
        { numeroLinea: 2, aliquotaIVA: 22 },
      ],
      xmlContent: null,
    } as never)
    vi.mocked(prisma.electronicInvoice.findMany).mockResolvedValue([
      { id: 'nota-1', lineItems: [{ numeroLinea: 1, aliquotaIVA: 22 }], xmlContent: null },
    ] as never)
    vi.mocked(prisma.invoiceLineAccount.findMany)
      .mockResolvedValueOnce([
        { accountId: 'alimentari', importo: new Prisma.Decimal(1000), numeroLinea: 1 },
        { accountId: 'pulizia', importo: new Prisma.Decimal(100), numeroLinea: 2 },
      ] as never)
      .mockResolvedValueOnce([
        { accountId: 'pulizia', importo: new Prisma.Decimal(150), numeroLinea: 1 },
      ] as never)

    const esito = await reconcileScheduleWithEntry({
      scheduleId: 'sched-1',
      journalEntryId: 'entry-1',
      venueId: VENUE,
      userId: 'user-1',
    })

    expect(esito.outcome).toBe('ok')
    expect(prisma.journalEntryAllocation.createMany).not.toHaveBeenCalled()
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('peso'),
      expect.objectContaining({ invoiceId: 'inv-mista', accountId: 'pulizia' })
    )
  })

  it('interazione con il Task 5: la riga della nota divisa fra due conti si sottrae da entrambi, ciascuna con la propria quota', async () => {
    // Fattura a tre conti: alimentari 1.000 @10% (1.100), pulizia 60 @22%
    // (73,2) e imballo 40 @22% (48,8) — stessa riga fattura divisa in due
    // (Task 5). Nota di credito: la STESSA riga resa, divisa nello stesso
    // modo su entrambi i conti (60 + 40): entrambe le quote devono sottrarsi
    // dal proprio conto, non solo la prima.
    vi.mocked(prisma.schedule.findFirst).mockResolvedValue(
      scadenza({ invoiceId: 'inv-divisa', importoTotale: new Prisma.Decimal(1222) }) as never
    )
    vi.mocked(prisma.journalEntry.findFirst).mockResolvedValue(
      movimento({ creditAmount: new Prisma.Decimal(1100) }) as never
    )
    vi.mocked(prisma.electronicInvoice.findUnique).mockResolvedValue({
      lineItems: [
        { numeroLinea: 1, aliquotaIVA: 10 },
        { numeroLinea: 2, aliquotaIVA: 22 },
      ],
      xmlContent: null,
    } as never)
    vi.mocked(prisma.electronicInvoice.findMany).mockResolvedValue([
      { id: 'nota-1', lineItems: [{ numeroLinea: 1, aliquotaIVA: 22 }], xmlContent: null },
    ] as never)
    vi.mocked(prisma.invoiceLineAccount.findMany)
      .mockResolvedValueOnce([
        { accountId: 'alimentari', importo: new Prisma.Decimal(1000), numeroLinea: 1 },
        { accountId: 'pulizia', importo: new Prisma.Decimal(60), numeroLinea: 2 },
        { accountId: 'imballo', importo: new Prisma.Decimal(40), numeroLinea: 2 },
      ] as never) // imputazioni della fattura: riga 2 divisa (progressivo)
      .mockResolvedValueOnce([
        { accountId: 'pulizia', importo: new Prisma.Decimal(60), numeroLinea: 1 },
        { accountId: 'imballo', importo: new Prisma.Decimal(40), numeroLinea: 1 },
      ] as never) // imputazioni della nota: la sua unica riga, divisa allo stesso modo
    vi.mocked(prisma.journalEntryAllocation.findMany)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ accountId: 'alimentari', importo: new Prisma.Decimal(1100) }] as never)
    vi.mocked(derivaBudgetCategoryDaConto).mockResolvedValue('cat-alimentari')

    const esito = await reconcileScheduleWithEntry({
      scheduleId: 'sched-1',
      journalEntryId: 'entry-1',
      venueId: VENUE,
      userId: 'user-1',
    })

    expect(esito.outcome).toBe('ok')
    // Pulizia e imballo si azzerano entrambi ed escono dai pesi: se la nota
    // sottraesse solo dalla prima quota letta, uno dei due resterebbe con un
    // peso residuo diverso da zero.
    expect(prisma.journalEntryAllocation.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ accountId: 'alimentari' })],
    })
    const fetteScritte = vi.mocked(prisma.journalEntryAllocation.createMany).mock.calls[0][0]
      .data as Array<{ accountId: string; importo: Prisma.Decimal }>
    expect(fetteScritte.map((f) => ({ accountId: f.accountId, importo: Number(f.importo) }))).toEqual([
      { accountId: 'alimentari', importo: 1100 },
    ])
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
    // Una sola lettura delle fette, quella che fotografa lo stato PRIMA della
    // cancellazione: se il dominante si fosse ricalcolato ce ne sarebbe una
    // seconda, e sarebbe il segno che il movimento è stato toccato.
    expect(prisma.journalEntryAllocation.findMany).toHaveBeenCalledTimes(1)
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

import { describe, it, expect, vi, beforeEach } from 'vitest'

// La pipeline è best-effort assoluto: si mocka prisma, il parser, il mapping
// budget e l'SDK Anthropic per osservare esattamente cosa viene scritto senza
// mai colpire una vera API o un vero database.
vi.mock('@/lib/prisma', () => ({
  prisma: {
    electronicInvoice: { findUnique: vi.fn() },
    invoiceLineAccount: { findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
    supplierProductAccount: { findMany: vi.fn() },
    account: { findMany: vi.fn() },
    budgetCategory: { findMany: vi.fn() },
  },
}))

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

vi.mock('@/lib/sdi/parser', () => ({
  parseFatturaPA: vi.fn(),
}))

vi.mock('@/lib/accounts/mapping', () => ({
  derivaBudgetCategoryDaConto: vi.fn(),
}))

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn(),
}))

import Anthropic from '@anthropic-ai/sdk'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { parseFatturaPA } from '@/lib/sdi/parser'
import { derivaBudgetCategoryDaConto } from '@/lib/accounts/mapping'
import { categorizzaRigheFattura } from '../index'

const INVOICE_ID = 'fatt-1'
const VENUE_ID = 'venue-1'

const fatturaBase = {
  supplierId: 'fornitore-1',
  xmlContent: '<xml>contenuto</xml>',
  venueId: VENUE_ID,
}

const rigaPane = {
  numeroLinea: 1,
  descrizione: 'PANE COMUNE',
  codiceArticolo: 'ART001',
  prezzoUnitario: 10,
  prezzoTotale: 10,
  aliquotaIVA: 22,
}

const rigaAcqua = {
  numeroLinea: 2,
  descrizione: 'ACQUA NATURALE',
  codiceArticolo: null,
  prezzoUnitario: 5,
  prezzoTotale: 5,
  aliquotaIVA: 22,
}

const contiCosto = [
  { id: 'acc-pane', name: 'Materie prime - pane' },
  { id: 'acc-acqua', name: 'Materie prime - bevande' },
]

const mockAnthropicParse = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  process.env.ANTHROPIC_API_KEY = 'test-key'

  vi.mocked(prisma.electronicInvoice.findUnique).mockResolvedValue(fatturaBase as never)
  vi.mocked(prisma.invoiceLineAccount.findMany).mockResolvedValue([])
  vi.mocked(prisma.invoiceLineAccount.create).mockResolvedValue({} as never)
  vi.mocked(prisma.invoiceLineAccount.update).mockResolvedValue({} as never)
  vi.mocked(prisma.supplierProductAccount.findMany).mockResolvedValue([])
  vi.mocked(prisma.account.findMany).mockResolvedValue(contiCosto as never)
  vi.mocked(prisma.budgetCategory.findMany).mockResolvedValue([])
  vi.mocked(derivaBudgetCategoryDaConto).mockResolvedValue(null)
  vi.mocked(parseFatturaPA).mockReturnValue({
    dettaglioLinee: [rigaPane, rigaAcqua],
  } as never)

  mockAnthropicParse.mockReset()
  mockAnthropicParse.mockResolvedValue({
    stop_reason: 'end_turn',
    parsed_output: { righe: [] },
  })
  vi.mocked(Anthropic).mockImplementation(function () {
    return { messages: { parse: mockAnthropicParse } } as unknown as InstanceType<typeof Anthropic>
  })
})

describe('categorizzaRigheFattura', () => {
  it('match memoria per codice esatto: la riga viene scritta confermata/regola-appresa, e l\'AI riceve comunque la riga per un eventuale dubbio', async () => {
    vi.mocked(prisma.supplierProductAccount.findMany).mockResolvedValue([
      {
        id: 'mem-1',
        venueId: VENUE_ID,
        supplierId: 'fornitore-1',
        nomeNormalizzato: 'pane comune',
        codiceArticolo: 'ART001',
        accountId: 'acc-pane',
        conferme: 3,
      },
    ] as never)

    await categorizzaRigheFattura({ invoiceId: INVOICE_ID })

    expect(prisma.invoiceLineAccount.create).toHaveBeenCalledWith({
      data: {
        invoiceId: INVOICE_ID,
        numeroLinea: 1,
        descrizione: 'PANE COMUNE',
        codiceArticolo: 'ART001',
        importo: 10,
        accountId: 'acc-pane',
        stato: 'confermata',
        fonte: 'regola-appresa',
      },
    })

    // L'AI viene comunque interpellata (per il dubbio sulla riga 1 e per la
    // riga 2, scoperta), col modello previsto dalla spec.
    expect(mockAnthropicParse).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'claude-haiku-4-5', max_tokens: 4096 })
    )
    const promptInviato = mockAnthropicParse.mock.calls[0][0].messages[0].content as string
    expect(promptInviato).toContain('acc-pane')
  })

  it('la memoria è scoping per venue: una mappatura confermata in un altro venue non deve mai matchare una riga di questa fattura', async () => {
    // Il mock si comporta come farebbe una vera query Prisma filtrata per
    // where: se il codice sotto test non passa venueId nel where, questa
    // memoria di un ALTRO venue (stesso supplierId, stesso codiceArticolo)
    // verrebbe restituita comunque e la riga 1 finirebbe 'confermata' con
    // l'accountId sbagliato — esattamente il leak cross-venue segnalato in
    // review.
    const memoriaDiUnAltroVenue = {
      id: 'mem-altro-venue',
      venueId: 'venue-diverso',
      supplierId: 'fornitore-1',
      nomeNormalizzato: 'pane comune',
      codiceArticolo: 'ART001',
      accountId: 'acc-venue-diverso',
      conferme: 10,
    }
    vi.mocked(prisma.supplierProductAccount.findMany).mockImplementation(async (args) => {
      const where = (args as { where: { supplierId: string; venueId?: string } }).where
      // Replica il comportamento reale di Prisma: se il where non porta la
      // chiave venueId, il filtro semplicemente non la considera (leak); se
      // la porta, deve corrispondere esattamente.
      const filtraPerVenue = 'venueId' in where
      return [memoriaDiUnAltroVenue].filter(
        (m) => m.supplierId === where.supplierId && (!filtraPerVenue || m.venueId === where.venueId)
      ) as never
    })

    await categorizzaRigheFattura({ invoiceId: INVOICE_ID })

    expect(prisma.invoiceLineAccount.create).not.toHaveBeenCalledWith({
      data: expect.objectContaining({ numeroLinea: 1, fonte: 'regola-appresa' }),
    })
  })

  it('righe scoperte: chiama parse col modello previsto e crea la riga proposta/ai con confidence e motivo', async () => {
    mockAnthropicParse.mockResolvedValue({
      stop_reason: 'end_turn',
      parsed_output: {
        righe: [
          {
            numeroLinea: 2,
            accountId: 'acc-acqua',
            confidence: 0.87,
            motivo: 'Acqua naturale in bottiglia',
            dubbioSuMemoria: false,
          },
        ],
      },
    })

    await categorizzaRigheFattura({ invoiceId: INVOICE_ID })

    expect(mockAnthropicParse).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'claude-haiku-4-5', max_tokens: 4096 })
    )
    expect(prisma.invoiceLineAccount.create).toHaveBeenCalledWith({
      data: {
        invoiceId: INVOICE_ID,
        numeroLinea: 2,
        descrizione: 'ACQUA NATURALE',
        codiceArticolo: null,
        importo: 5,
        accountId: 'acc-acqua',
        stato: 'proposta',
        fonte: 'ai',
        confidence: 0.87,
        motivazioneAi: 'Acqua naturale in bottiglia',
      },
    })
  })

  it('accountId allucinato: la riga viene scartata (nessuna scrittura) con un warning', async () => {
    mockAnthropicParse.mockResolvedValue({
      stop_reason: 'end_turn',
      parsed_output: {
        righe: [
          {
            numeroLinea: 2,
            accountId: 'acc-inventato',
            confidence: 0.5,
            motivo: 'motivo qualsiasi',
            dubbioSuMemoria: false,
          },
        ],
      },
    })

    await categorizzaRigheFattura({ invoiceId: INVOICE_ID })

    expect(prisma.invoiceLineAccount.create).not.toHaveBeenCalled()
    expect(prisma.invoiceLineAccount.update).not.toHaveBeenCalled()
    expect(logger.warn).toHaveBeenCalled()
  })

  it('numeroLinea inesistente: la riga viene scartata con un warning', async () => {
    mockAnthropicParse.mockResolvedValue({
      stop_reason: 'end_turn',
      parsed_output: {
        righe: [
          {
            numeroLinea: 999,
            accountId: 'acc-acqua',
            confidence: 0.5,
            motivo: 'motivo qualsiasi',
            dubbioSuMemoria: false,
          },
        ],
      },
    })

    await categorizzaRigheFattura({ invoiceId: INVOICE_ID })

    expect(prisma.invoiceLineAccount.create).not.toHaveBeenCalled()
    expect(prisma.invoiceLineAccount.update).not.toHaveBeenCalled()
    expect(logger.warn).toHaveBeenCalled()
  })

  it('dubbioSuMemoria: la riga già confermata dalla memoria torna in stato proposta, mantenendo fonte e conto originali', async () => {
    vi.mocked(prisma.supplierProductAccount.findMany).mockResolvedValue([
      {
        id: 'mem-1',
        venueId: VENUE_ID,
        supplierId: 'fornitore-1',
        nomeNormalizzato: 'pane comune',
        codiceArticolo: 'ART001',
        accountId: 'acc-pane',
        conferme: 3,
      },
    ] as never)
    mockAnthropicParse.mockResolvedValue({
      stop_reason: 'end_turn',
      parsed_output: {
        righe: [
          {
            numeroLinea: 1,
            accountId: 'acc-pane',
            confidence: 0.4,
            motivo: 'Il fornitore di solito consegna pane speciale su questo articolo',
            dubbioSuMemoria: true,
          },
        ],
      },
    })

    await categorizzaRigheFattura({ invoiceId: INVOICE_ID })

    // La riga 1 viene prima scritta dalla memoria...
    expect(prisma.invoiceLineAccount.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ numeroLinea: 1, stato: 'confermata', fonte: 'regola-appresa' }),
    })
    // ...poi rimessa in dubbio senza toccare fonte/accountId.
    expect(prisma.invoiceLineAccount.update).toHaveBeenCalledWith({
      where: { invoiceId_numeroLinea: { invoiceId: INVOICE_ID, numeroLinea: 1 } },
      data: {
        stato: 'proposta',
        motivazioneAi: 'Il fornitore di solito consegna pane speciale su questo articolo',
      },
    })
  })

  it('senza ANTHROPIC_API_KEY: nessuna chiamata AI, restano valide le scritture da memoria', async () => {
    delete process.env.ANTHROPIC_API_KEY
    vi.mocked(prisma.supplierProductAccount.findMany).mockResolvedValue([
      {
        id: 'mem-1',
        venueId: VENUE_ID,
        supplierId: 'fornitore-1',
        nomeNormalizzato: 'pane comune',
        codiceArticolo: 'ART001',
        accountId: 'acc-pane',
        conferme: 3,
      },
    ] as never)

    await categorizzaRigheFattura({ invoiceId: INVOICE_ID })

    expect(mockAnthropicParse).not.toHaveBeenCalled()
    expect(prisma.invoiceLineAccount.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ numeroLinea: 1, stato: 'confermata', fonte: 'regola-appresa' }),
    })
    expect(logger.info).toHaveBeenCalled()
  })

  it('errore della chiamata AI: nessuna eccezione propagata e nessuna scrittura AI', async () => {
    mockAnthropicParse.mockRejectedValue(new Error('API down'))

    await expect(
      categorizzaRigheFattura({ invoiceId: INVOICE_ID, venueId: VENUE_ID })
    ).resolves.toBeUndefined()

    expect(logger.error).toHaveBeenCalled()
  })

  it('righe già presenti in tabella: non vengono mai sovrascritte né rinviate all\'AI', async () => {
    vi.mocked(prisma.invoiceLineAccount.findMany).mockResolvedValue([
      { numeroLinea: 1 },
    ] as never)
    vi.mocked(prisma.supplierProductAccount.findMany).mockResolvedValue([
      {
        id: 'mem-1',
        venueId: VENUE_ID,
        supplierId: 'fornitore-1',
        nomeNormalizzato: 'pane comune',
        codiceArticolo: 'ART001',
        accountId: 'acc-pane',
        conferme: 3,
      },
    ] as never)
    mockAnthropicParse.mockResolvedValue({
      stop_reason: 'end_turn',
      parsed_output: {
        righe: [
          {
            numeroLinea: 2,
            accountId: 'acc-acqua',
            confidence: 0.9,
            motivo: 'Acqua',
            dubbioSuMemoria: false,
          },
        ],
      },
    })

    await categorizzaRigheFattura({ invoiceId: INVOICE_ID })

    // La riga 1 è già in tabella: nessuna create/update la riguarda.
    expect(prisma.invoiceLineAccount.create).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ numeroLinea: 1 }) })
    )
    expect(prisma.invoiceLineAccount.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ where: { invoiceId_numeroLinea: { invoiceId: INVOICE_ID, numeroLinea: 1 } } })
    )
    // La riga 2, scoperta, viene comunque creata dalla proposta AI.
    expect(prisma.invoiceLineAccount.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ numeroLinea: 2, stato: 'proposta', fonte: 'ai' }),
    })
  })

  it('fattura senza xmlContent: nessuna scrittura e nessuna eccezione', async () => {
    vi.mocked(prisma.electronicInvoice.findUnique).mockResolvedValue({
      ...fatturaBase,
      xmlContent: null,
    } as never)

    await categorizzaRigheFattura({ invoiceId: INVOICE_ID })

    expect(parseFatturaPA).not.toHaveBeenCalled()
    expect(prisma.invoiceLineAccount.create).not.toHaveBeenCalled()
  })
})

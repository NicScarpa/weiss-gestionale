import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { Session } from 'next-auth'
import { Prisma } from '@prisma/client'
import { GET } from '../route'

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))

vi.mock('@/lib/venue', () => ({
  getVenueId: vi.fn().mockResolvedValue('venue-test-123'),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    electronicInvoice: { findFirst: vi.fn() },
    invoiceLineAccount: { findMany: vi.fn() },
    scheduleReconciliation: { findMany: vi.fn() },
  },
}))

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

vi.mock('@/lib/sdi/parser', () => ({
  parseFatturaPA: vi.fn(),
  TIPI_DOCUMENTO: { TD01: 'Fattura' },
}))

// Mockato al confine: `imputazioniDivergenti` ha già la propria suite
// d'integrazione su database vero (riallineamento.itest.ts). Qui si verifica
// solo che la rotta la interroghi per i movimenti giusti e filtri la
// risposta sulla fattura corrente — non si riproduce la sua logica interna.
vi.mock('@/lib/invoices/riallineamento', () => ({
  imputazioniDivergenti: vi.fn(),
}))

import { authDiRoute } from '@/test/auth-unitari'
import { prisma } from '@/lib/prisma'
import { parseFatturaPA } from '@/lib/sdi/parser'
import { imputazioniDivergenti } from '@/lib/invoices/riallineamento'

const sessione = { user: { id: 'user-1', role: 'admin' } } as unknown as Session

const fatturaEsistente = {
  id: 'fatt-1',
  venueId: 'venue-test-123',
  xmlContent: '<xml>contenuto</xml>',
}

function richiesta(id = 'fatt-1') {
  const request = new NextRequest(`http://localhost:3000/api/invoices/${id}`)
  return { request, context: { params: Promise.resolve({ id }) } }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(authDiRoute).mockResolvedValue(sessione as never)
  vi.mocked(prisma.electronicInvoice.findFirst).mockResolvedValue(fatturaEsistente as never)
  vi.mocked(parseFatturaPA).mockReturnValue({
    dettaglioLinee: [{ numeroLinea: 1, descrizione: 'Detersivi e tovaglioli', prezzoTotale: 100 }],
  } as never)
  vi.mocked(prisma.invoiceLineAccount.findMany).mockResolvedValue([] as never)
  vi.mocked(prisma.scheduleReconciliation.findMany).mockResolvedValue([] as never)
})

describe('GET /api/invoices/[id]: righe divise nella risposta', () => {
  it('interroga invoiceLineAccount ordinando per progressivo crescente', async () => {
    vi.mocked(prisma.invoiceLineAccount.findMany).mockResolvedValue([] as never)

    const { request, context } = richiesta()
    await GET(request, context)

    expect(prisma.invoiceLineAccount.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { progressivo: 'asc' } })
    )
  })

  it('riga divisa: imputazioni porta tutte le quote in ordine di progressivo, con importo', async () => {
    // Il mock torna già ordinato (0, poi 1): è quello che orderBy garantisce
    // in produzione. Il codice si fida di quell'ordine, non lo ricalcola.
    vi.mocked(prisma.invoiceLineAccount.findMany).mockResolvedValue([
      {
        numeroLinea: 1,
        progressivo: 0,
        accountId: 'conto-detersivi',
        importo: new Prisma.Decimal(60),
        stato: 'confermata',
        fonte: 'manuale',
        confidence: null,
        motivazioneAi: null,
      },
      {
        numeroLinea: 1,
        progressivo: 1,
        accountId: 'conto-tovaglioli',
        importo: new Prisma.Decimal(40),
        stato: 'confermata',
        fonte: 'manuale',
        confidence: null,
        motivazioneAi: null,
      },
    ] as never)

    const { request, context } = richiesta()
    const response = await GET(request, context)
    const data = await response.json()

    const riga = data.parsedData.dettaglioLinee[0]
    // imputazioni[0] è "la" quota principale per chi non gestisce le righe
    // divise (Task 8): deve essere quella col progressivo più basso.
    expect(riga.imputazioni[0]).toEqual(
      expect.objectContaining({ accountId: 'conto-detersivi', stato: 'confermata' })
    )
    expect(riga.imputazioni).toEqual([
      expect.objectContaining({ progressivo: 0, accountId: 'conto-detersivi', importo: 60 }),
      expect.objectContaining({ progressivo: 1, accountId: 'conto-tovaglioli', importo: 40 }),
    ])
  })

  it('riga con la sola quota al progressivo 1 (la quota 0 è stata rimossa): imputazioni[0] la usa comunque', async () => {
    // Caso limite dopo la revisione del Task 5: una richiesta autorevole può
    // lasciare una riga con l'unica quota superstite a un progressivo diverso
    // da 0. imputazioni[0] deve seguirla, non sparire.
    vi.mocked(prisma.invoiceLineAccount.findMany).mockResolvedValue([
      {
        numeroLinea: 1,
        progressivo: 1,
        accountId: 'conto-tovaglioli',
        importo: new Prisma.Decimal(100),
        stato: 'confermata',
        fonte: 'manuale',
        confidence: null,
        motivazioneAi: null,
      },
    ] as never)

    const { request, context } = richiesta()
    const response = await GET(request, context)
    const data = await response.json()

    const riga = data.parsedData.dettaglioLinee[0]
    expect(riga.imputazioni[0]).toEqual(
      expect.objectContaining({ accountId: 'conto-tovaglioli' })
    )
    expect(riga.imputazioni).toHaveLength(1)
  })

  it('riga senza imputazioni: imputazioni è un array vuoto', async () => {
    vi.mocked(prisma.invoiceLineAccount.findMany).mockResolvedValue([] as never)

    const { request, context } = richiesta()
    const response = await GET(request, context)
    const data = await response.json()

    const riga = data.parsedData.dettaglioLinee[0]
    expect(riga.imputazioni).toEqual([])
  })
})

describe('GET /api/invoices/[id]: righe di sistema (bollo, arrotondamento)', () => {
  it('fattura con bollo: righeSistema porta la riga -1 con descrizione e importo', async () => {
    vi.mocked(parseFatturaPA).mockReturnValue({
      dettaglioLinee: [{ numeroLinea: 1, descrizione: 'Detersivi', prezzoTotale: 100 }],
      datiBollo: { importoBollo: 2 },
    } as never)
    vi.mocked(prisma.invoiceLineAccount.findMany).mockResolvedValue([] as never)

    const { request, context } = richiesta()
    const response = await GET(request, context)
    const data = await response.json()

    expect(data.parsedData.righeSistema).toEqual([
      expect.objectContaining({ numeroLinea: -1, descrizione: 'Imposta di bollo', importo: 2 }),
    ])
  })

  it('fattura senza bollo né arrotondamento: righeSistema è un array vuoto', async () => {
    vi.mocked(prisma.invoiceLineAccount.findMany).mockResolvedValue([] as never)

    const { request, context } = richiesta()
    const response = await GET(request, context)
    const data = await response.json()

    expect(data.parsedData.righeSistema).toEqual([])
  })

  it('il conto scelto per il bollo si rilegge: la quota salvata su numeroLinea -1 finisce in imputazioni della riga di sistema', async () => {
    // È l'asimmetria che la task 8 doveva chiudere: la PATCH righe-conti
    // accetta già LINEA_BOLLO in scrittura, ma prima di questo cambiamento
    // la GET non la restituiva mai — il conto si sarebbe salvato ma sarebbe
    // sparito al primo refresh della pagina.
    vi.mocked(parseFatturaPA).mockReturnValue({
      dettaglioLinee: [{ numeroLinea: 1, descrizione: 'Detersivi', prezzoTotale: 100 }],
      datiBollo: { importoBollo: 2 },
    } as never)
    vi.mocked(prisma.invoiceLineAccount.findMany).mockResolvedValue([
      {
        numeroLinea: -1,
        progressivo: 0,
        accountId: 'conto-bollo',
        importo: new Prisma.Decimal(2),
        stato: 'confermata',
        fonte: 'manuale',
        confidence: null,
        motivazioneAi: null,
      },
    ] as never)

    const { request, context } = richiesta()
    const response = await GET(request, context)
    const data = await response.json()

    const rigaBollo = data.parsedData.righeSistema.find((r: { numeroLinea: number }) => r.numeroLinea === -1)
    expect(rigaBollo.imputazioni).toEqual([
      expect.objectContaining({ accountId: 'conto-bollo', stato: 'confermata', importo: 2 }),
    ])
  })
})

describe('GET /api/invoices/[id]: divergenze (Task 10)', () => {
  it('nessuna riconciliazione collegata: divergenze è vuoto e imputazioniDivergenti non viene mai chiamata', async () => {
    vi.mocked(prisma.scheduleReconciliation.findMany).mockResolvedValue([] as never)

    const { request, context } = richiesta()
    const response = await GET(request, context)
    const data = await response.json()

    expect(data.divergenze).toEqual([])
    expect(imputazioniDivergenti).not.toHaveBeenCalled()
  })

  it('un movimento riconciliato senza divergenza: divergenze resta vuoto', async () => {
    vi.mocked(prisma.scheduleReconciliation.findMany).mockResolvedValue([
      { journalEntryId: 'mov-1', journalEntry: { date: new Date('2026-03-31') } },
    ] as never)
    vi.mocked(imputazioniDivergenti).mockResolvedValue({
      divergente: false,
      invoiceId: null,
      modificataIl: null,
    })

    const { request, context } = richiesta()
    const response = await GET(request, context)
    const data = await response.json()

    expect(imputazioniDivergenti).toHaveBeenCalledWith('mov-1')
    expect(data.divergenze).toEqual([])
  })

  it('un movimento divergente per QUESTA fattura: compare in divergenze con la sua data', async () => {
    vi.mocked(prisma.scheduleReconciliation.findMany).mockResolvedValue([
      { journalEntryId: 'mov-1', journalEntry: { date: new Date('2026-03-31') } },
    ] as never)
    vi.mocked(imputazioniDivergenti).mockResolvedValue({
      divergente: true,
      invoiceId: 'fatt-1',
      modificataIl: new Date('2026-08-01'),
    })

    const { request, context } = richiesta()
    const response = await GET(request, context)
    const data = await response.json()

    expect(data.divergenze).toEqual([
      { journalEntryId: 'mov-1', movimentoData: new Date('2026-03-31').toISOString() },
    ])
  })

  it('bonifico cumulativo: la divergenza più recente del movimento appartiene a UN\'ALTRA fattura, e non compare qui', async () => {
    // `imputazioniDivergenti` collassa sulla divergenza più recente di TUTTO
    // il movimento (vedi il docblock in riallineamento.ts): un bonifico che
    // salda anche un'altra fattura, se quella è la più recente a divergere,
    // tornerebbe un invoiceId diverso dal nostro. Mostrarlo qui sarebbe
    // attribuire a questa fattura un problema che non è suo.
    vi.mocked(prisma.scheduleReconciliation.findMany).mockResolvedValue([
      { journalEntryId: 'mov-cumulativo', journalEntry: { date: new Date('2026-03-31') } },
    ] as never)
    vi.mocked(imputazioniDivergenti).mockResolvedValue({
      divergente: true,
      invoiceId: 'fatt-ALTRA',
      modificataIl: new Date('2026-08-01'),
    })

    const { request, context } = richiesta()
    const response = await GET(request, context)
    const data = await response.json()

    expect(data.divergenze).toEqual([])
  })

  it('due riconciliazioni verificate sullo stesso movimento: imputazioniDivergenti viene chiamata una sola volta', async () => {
    // Costo: niente chiamate duplicate per lo stesso journalEntryId, anche se
    // più riconciliazioni verificate di questa fattura puntano allo stesso
    // movimento (rate diverse saldate dallo stesso bonifico).
    vi.mocked(prisma.scheduleReconciliation.findMany).mockResolvedValue([
      { journalEntryId: 'mov-1', journalEntry: { date: new Date('2026-03-31') } },
      { journalEntryId: 'mov-1', journalEntry: { date: new Date('2026-03-31') } },
    ] as never)
    vi.mocked(imputazioniDivergenti).mockResolvedValue({
      divergente: false,
      invoiceId: null,
      modificataIl: null,
    })

    const { request, context } = richiesta()
    await GET(request, context)

    expect(imputazioniDivergenti).toHaveBeenCalledTimes(1)
  })

  it('due movimenti distinti, entrambi divergenti per questa fattura: entrambi compaiono', async () => {
    vi.mocked(prisma.scheduleReconciliation.findMany).mockResolvedValue([
      { journalEntryId: 'mov-1', journalEntry: { date: new Date('2026-03-31') } },
      { journalEntryId: 'mov-2', journalEntry: { date: new Date('2026-05-15') } },
    ] as never)
    vi.mocked(imputazioniDivergenti).mockResolvedValue({
      divergente: true,
      invoiceId: 'fatt-1',
      modificataIl: new Date('2026-08-01'),
    })

    const { request, context } = richiesta()
    const response = await GET(request, context)
    const data = await response.json()

    expect(data.divergenze).toEqual([
      { journalEntryId: 'mov-1', movimentoData: new Date('2026-03-31').toISOString() },
      { journalEntryId: 'mov-2', movimentoData: new Date('2026-05-15').toISOString() },
    ])
  })

  it('interroga scheduleReconciliation filtrando per fattura e stato verificato', async () => {
    vi.mocked(prisma.scheduleReconciliation.findMany).mockResolvedValue([] as never)

    const { request, context } = richiesta()
    await GET(request, context)

    expect(prisma.scheduleReconciliation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: 'VERIFIED', schedule: { invoiceId: 'fatt-1' } },
      })
    )
  })

  it('revisione Important 1: un errore nel calcolo delle divergenze non fa fallire il resto della fattura', async () => {
    // Accessoria quanto il parsing XML poco sopra (che ha lo stesso try/catch
    // con lo stesso principio): un intoppo proprio sulle query più esposte
    // della rotta (1+K, vedi il commento nel codice) non deve trasformare
    // "manca l'avviso" in "manca la fattura".
    vi.mocked(prisma.scheduleReconciliation.findMany).mockRejectedValue(new Error('timeout statement'))

    const { request, context } = richiesta()
    const response = await GET(request, context)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.id).toBe('fatt-1')
    expect(data.divergenze).toEqual([])
  })

  it('revisione Important 1: un errore da imputazioniDivergenti stesso ha la stessa rete', async () => {
    vi.mocked(prisma.scheduleReconciliation.findMany).mockResolvedValue([
      { journalEntryId: 'mov-1', journalEntry: { date: new Date('2026-03-31') } },
    ] as never)
    vi.mocked(imputazioniDivergenti).mockRejectedValue(new Error('pool esaurito'))

    const { request, context } = richiesta()
    const response = await GET(request, context)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.divergenze).toEqual([])
  })
})

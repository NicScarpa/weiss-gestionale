import { describe, it, expect, vi, beforeEach } from 'vitest'
import { generateJournalEntriesFromClosure, deleteJournalEntriesForClosure } from '../closure-journal-entries'

// Mock prisma
vi.mock('../prisma', () => ({
  prisma: {
    journalEntry: {
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    // Letti dall'imputazione: conti di sistema (system_key) e centri di costo
    account: { findUnique: vi.fn(), findMany: vi.fn() },
    costCenter: { findUnique: vi.fn(), findFirst: vi.fn() },
  },
}))

vi.mock('../logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

// Import the mocked prisma after mocking
import { prisma } from '../prisma'
import { logger } from '../logger'

/** Conti di sistema come li vede il codice dopo la migrazione della FASE 3 */
const CONTI_SISTEMA: Record<string, { id: string; isActive: boolean }> = {
  CORRISPETTIVI: { id: 'conto-corrispettivi', isActive: true },
  CASSA: { id: 'conto-cassa', isActive: true },
  BANCA: { id: 'conto-banca', isActive: true },
}

const CENTRO_DEFAULT = { id: 'cc-str', isDefault: true, isActive: true }

/** Piano dei conti v4 già migrato: i conti di sistema esistono e sono attivi */
function conContiDiSistema() {
  vi.mocked(prisma.account.findUnique).mockImplementation(
    ((args: { where: { systemKey: string } }) =>
      Promise.resolve(CONTI_SISTEMA[args.where.systemKey] ?? null)) as never
  )
}

/** Ogni centro richiesto per id esiste ed è attivo */
function conCentriAttivi() {
  vi.mocked(prisma.costCenter.findUnique).mockImplementation(
    ((args: { where: { id: string } }) =>
      Promise.resolve({ id: args.where.id, isActive: true })) as never
  )
}

/** Parte contabile di un movimento generato: quella che non deve mai cambiare */
interface MovimentoGenerato {
  registerType: string
  description: string
  date: Date
  debitAmount: number | null
  creditAmount: number | null
  accountId: string | null
  counterpartId: string | null
  costCenterId: string | null
}

function movimentiGenerati(): MovimentoGenerato[] {
  const [primaChiamata] = vi.mocked(prisma.journalEntry.createMany).mock.calls
  return (primaChiamata?.[0].data ?? []) as unknown as MovimentoGenerato[]
}

describe('generateJournalEntriesFromClosure', () => {
  const userId = 'user-123'
  const baseDate = new Date('2024-03-15')

  beforeEach(() => {
    vi.clearAllMocks()
    // Stato di partenza: produzione prima della FASE 3 — nessun conto di
    // sistema configurato, ma il centro di default esiste.
    vi.mocked(prisma.account.findUnique).mockResolvedValue(null as never)
    vi.mocked(prisma.account.findMany).mockResolvedValue([] as never)
    vi.mocked(prisma.costCenter.findUnique).mockResolvedValue(null as never)
    vi.mocked(prisma.costCenter.findFirst).mockResolvedValue(CENTRO_DEFAULT as never)
  })

  describe('Entry Generation Logic', () => {
    it('should generate cash income entry for cash sales', async () => {
      const closure = {
        id: 'closure-1',
        date: baseDate,
        venueId: 'venue-1',
        bankDeposit: null,
        stations: [
          { cashAmount: 500, posAmount: 0, floatAmount: 114 },
        ],
        expenses: [],
      }

      const result = await generateJournalEntriesFromClosure(closure, userId)

      expect(prisma.journalEntry.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({
            registerType: 'CASH',
            debitAmount: 500,
            creditAmount: null,
          }),
        ]),
      })

      expect(result.entriesCreated).toBeGreaterThan(0)
      expect(result.totalDebits).toBe(500)
    })

    it('should generate POS income entry on BANK register', async () => {
      const closure = {
        id: 'closure-1',
        date: baseDate,
        venueId: 'venue-1',
        bankDeposit: null,
        stations: [
          { cashAmount: 0, posAmount: 300, floatAmount: 114 },
        ],
        expenses: [],
      }

      const result = await generateJournalEntriesFromClosure(closure, userId)

      expect(prisma.journalEntry.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({
            registerType: 'BANK',
            debitAmount: 300,
            creditAmount: null,
          }),
        ]),
      })

      expect(result.totalDebits).toBe(300)
    })

    it('should generate expense entries as credits', async () => {
      const closure = {
        id: 'closure-1',
        date: baseDate,
        venueId: 'venue-1',
        bankDeposit: null,
        stations: [
          { cashAmount: 500, posAmount: 0, floatAmount: 114 },
        ],
        expenses: [
          { amount: 30, payee: 'Fornitore A', description: 'Caffè', documentRef: null, accountId: null },
          { amount: 20, payee: 'Fornitore B', description: null, documentRef: 'FT-123', accountId: 'acc-1' },
        ],
      }

      const result = await generateJournalEntriesFromClosure(closure, userId)

      // Should have expense credits
      expect(prisma.journalEntry.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({
            registerType: 'CASH',
            debitAmount: null,
            creditAmount: 30,
          }),
          expect.objectContaining({
            registerType: 'CASH',
            debitAmount: null,
            creditAmount: 20,
            accountId: 'acc-1',
          }),
        ]),
      })

      expect(result.totalCredits).toBe(50)
    })

    it('should add expenses to cash income (cash income = sales + expenses paid)', async () => {
      const closure = {
        id: 'closure-1',
        date: baseDate,
        venueId: 'venue-1',
        bankDeposit: null,
        stations: [
          { cashAmount: 500, posAmount: 0, floatAmount: 114 },
        ],
        expenses: [
          { amount: 50, payee: 'Test', description: null, documentRef: null, accountId: null },
        ],
      }

      await generateJournalEntriesFromClosure(closure, userId)

      // Cash income should be 500 (cash sales) + 50 (expenses paid) = 550
      expect(prisma.journalEntry.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({
            registerType: 'CASH',
            debitAmount: 550, // Cash sales + expenses
            creditAmount: null,
          }),
        ]),
      })
    })

    it('should generate bank deposit entries (cash out + bank in)', async () => {
      const closure = {
        id: 'closure-1',
        date: baseDate,
        venueId: 'venue-1',
        bankDeposit: 400,
        stations: [
          { cashAmount: 500, posAmount: 0, floatAmount: 114 },
        ],
        expenses: [],
      }

      const result = await generateJournalEntriesFromClosure(closure, userId)

      // Should have cash credit (money out of cash)
      expect(prisma.journalEntry.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({
            registerType: 'CASH',
            debitAmount: null,
            creditAmount: 400,
          }),
        ]),
      })

      // Should have bank debit (money into bank)
      expect(prisma.journalEntry.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({
            registerType: 'BANK',
            debitAmount: 400,
            creditAmount: null,
          }),
        ]),
      })

      // Bank deposit appears twice: credit from cash, debit to bank
      expect(result.totalCredits).toBe(400)
      expect(result.totalDebits).toBeGreaterThanOrEqual(400)
    })
  })

  describe('Complex Scenarios', () => {
    it('should handle complete closure with all components', async () => {
      const closure = {
        id: 'closure-1',
        date: baseDate,
        venueId: 'venue-1',
        bankDeposit: 300,
        stations: [
          { cashAmount: 400, posAmount: 200, floatAmount: 114 },
          { cashAmount: 150, posAmount: 100, floatAmount: 114 },
        ],
        expenses: [
          { amount: 50, payee: 'Fornitore', description: 'Merce', documentRef: null, accountId: null },
        ],
      }

      const result = await generateJournalEntriesFromClosure(closure, userId)

      // Total cash from stations: 400 + 150 = 550
      // Total POS from stations: 200 + 100 = 300
      // Cash income = cash sales + expenses = 550 + 50 = 600

      // Entries expected:
      // 1. Cash income (CASH DEBIT) = 600
      // 2. Expense (CASH CREDIT) = 50
      // 3. POS (BANK DEBIT) = 300
      // 4. Deposit cash out (CASH CREDIT) = 300
      // 5. Deposit bank in (BANK DEBIT) = 300

      expect(result.entriesCreated).toBe(5)
      expect(result.totalDebits).toBe(600 + 300 + 300) // Cash + POS + Deposit to bank
      expect(result.totalCredits).toBe(50 + 300) // Expense + Deposit from cash
    })

    it('should handle closure with no activity', async () => {
      const closure = {
        id: 'closure-1',
        date: baseDate,
        venueId: 'venue-1',
        bankDeposit: null,
        stations: [
          { cashAmount: 0, posAmount: 0, floatAmount: 114 },
        ],
        expenses: [],
      }

      const result = await generateJournalEntriesFromClosure(closure, userId)

      expect(prisma.journalEntry.createMany).not.toHaveBeenCalled()
      expect(result.entriesCreated).toBe(0)
      expect(result.totalDebits).toBe(0)
      expect(result.totalCredits).toBe(0)
    })

    it('should handle closure with only POS sales', async () => {
      const closure = {
        id: 'closure-1',
        date: baseDate,
        venueId: 'venue-1',
        bankDeposit: null,
        stations: [
          { cashAmount: 0, posAmount: 500, floatAmount: 114 },
        ],
        expenses: [],
      }

      const result = await generateJournalEntriesFromClosure(closure, userId)

      // Only POS entry on BANK
      expect(result.entriesCreated).toBe(1)
      expect(result.totalDebits).toBe(500)
      expect(result.totalCredits).toBe(0)
    })

    it('should handle closure with only expenses (returns, etc)', async () => {
      const closure = {
        id: 'closure-1',
        date: baseDate,
        venueId: 'venue-1',
        bankDeposit: null,
        stations: [
          { cashAmount: 100, posAmount: 0, floatAmount: 114 },
        ],
        expenses: [
          { amount: 100, payee: 'Test', description: 'Expense', documentRef: null, accountId: null },
        ],
      }

      const result = await generateJournalEntriesFromClosure(closure, userId)

      // Cash income = 100 (sales) + 100 (expenses) = 200
      // Expense credit = 100
      expect(result.totalDebits).toBe(200)
      expect(result.totalCredits).toBe(100)
    })
  })

  describe('Edge Cases', () => {
    it('should handle null/undefined amounts', async () => {
      const closure = {
        id: 'closure-1',
        date: baseDate,
        venueId: 'venue-1',
        bankDeposit: null,
        stations: [
          { cashAmount: null, posAmount: undefined, floatAmount: 114 },
        ],
        expenses: [],
      }

      const result = await generateJournalEntriesFromClosure(closure, userId)

      expect(result.entriesCreated).toBe(0)
      expect(result.totalDebits).toBe(0)
    })

    it('should skip zero-amount expenses', async () => {
      const closure = {
        id: 'closure-1',
        date: baseDate,
        venueId: 'venue-1',
        bankDeposit: null,
        stations: [
          { cashAmount: 100, posAmount: 0, floatAmount: 114 },
        ],
        expenses: [
          { amount: 0, payee: 'Zero', description: null, documentRef: null, accountId: null },
          { amount: 50, payee: 'Valid', description: null, documentRef: null, accountId: null },
        ],
      }

      const result = await generateJournalEntriesFromClosure(closure, userId)

      // Only the valid expense should create a credit entry
      // Plus cash income entry
      expect(result.totalCredits).toBe(50)
    })

    it('should handle multiple stations', async () => {
      const closure = {
        id: 'closure-1',
        date: baseDate,
        venueId: 'venue-1',
        bankDeposit: null,
        stations: [
          { cashAmount: 100, posAmount: 50, floatAmount: 114 },
          { cashAmount: 200, posAmount: 75, floatAmount: 114 },
          { cashAmount: 150, posAmount: 25, floatAmount: 114 },
        ],
        expenses: [],
      }

      const result = await generateJournalEntriesFromClosure(closure, userId)

      // Total cash: 100 + 200 + 150 = 450
      // Total POS: 50 + 75 + 25 = 150
      expect(result.totalDebits).toBe(450 + 150)
    })

    it('should preserve closureId on all entries', async () => {
      const closureId = 'closure-special-123'
      const closure = {
        id: closureId,
        date: baseDate,
        venueId: 'venue-1',
        bankDeposit: null,
        stations: [
          { cashAmount: 100, posAmount: 0, floatAmount: 114 },
        ],
        expenses: [],
      }

      await generateJournalEntriesFromClosure(closure, userId)

      expect(prisma.journalEntry.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({
            closureId: closureId,
          }),
        ]),
      })
    })

    it('should preserve createdById on all entries', async () => {
      const testUserId = 'special-user-456'
      const closure = {
        id: 'closure-1',
        date: baseDate,
        venueId: 'venue-1',
        bankDeposit: null,
        stations: [
          { cashAmount: 100, posAmount: 0, floatAmount: 114 },
        ],
        expenses: [],
      }

      await generateJournalEntriesFromClosure(closure, testUserId)

      expect(prisma.journalEntry.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({
            createdById: testUserId,
          }),
        ]),
      })
    })
  })

  /**
   * Imputazione: i movimenti generati da una chiusura devono nascere con
   * conto, contropartita e centro di costo. È un'aggiunta, non un cambio: la
   * quadratura della chiusura resta identica (vedi l'invariante in fondo).
   */
  describe('Imputazione (conto, contropartita, centro)', () => {
    const chiusuraCompleta = {
      id: 'closure-1',
      date: baseDate,
      venueId: 'venue-1',
      bankDeposit: 300,
      costCenterId: 'cc-weiss',
      stations: [{ cashAmount: 550, posAmount: 300, floatAmount: 114 }],
      expenses: [
        { amount: 50, payee: 'Fornitore', description: 'Merce', documentRef: null, accountId: 'conto-merci' },
      ],
    }

    it('incasso contanti: corrispettivi con contropartita cassa', async () => {
      conContiDiSistema()
      conCentriAttivi()

      await generateJournalEntriesFromClosure(chiusuraCompleta, userId)

      const incasso = movimentiGenerati().find((m) => m.debitAmount === 600)
      expect(incasso).toMatchObject({
        registerType: 'CASH',
        accountId: 'conto-corrispettivi',
        counterpartId: 'conto-cassa',
      })
    })

    it('incasso POS: corrispettivi con contropartita banca', async () => {
      conContiDiSistema()
      conCentriAttivi()

      await generateJournalEntriesFromClosure(chiusuraCompleta, userId)

      const pos = movimentiGenerati().find(
        (m) => m.registerType === 'BANK' && m.debitAmount === 300 && m.accountId === 'conto-corrispettivi'
      )
      expect(pos).toMatchObject({ counterpartId: 'conto-banca' })
    })

    it('spesa: conto della riga con contropartita cassa', async () => {
      conContiDiSistema()
      conCentriAttivi()

      await generateJournalEntriesFromClosure(chiusuraCompleta, userId)

      const spesa = movimentiGenerati().find((m) => m.creditAmount === 50)
      expect(spesa).toMatchObject({
        registerType: 'CASH',
        accountId: 'conto-merci',
        counterpartId: 'conto-cassa',
      })
    })

    it('versamento: le due gambe portano i patrimoniali incrociati', async () => {
      conContiDiSistema()
      conCentriAttivi()

      await generateJournalEntriesFromClosure(chiusuraCompleta, userId)

      const movimenti = movimentiGenerati()
      const uscitaCassa = movimenti.find((m) => m.registerType === 'CASH' && m.creditAmount === 300)
      const entrataBanca = movimenti.find(
        (m) => m.registerType === 'BANK' && m.debitAmount === 300 && m.accountId === 'conto-banca'
      )

      expect(uscitaCassa).toMatchObject({
        accountId: 'conto-cassa',
        counterpartId: 'conto-banca',
      })
      expect(entrataBanca).toMatchObject({
        accountId: 'conto-banca',
        counterpartId: 'conto-cassa',
      })
    })

    it('CORRISPETTIVI assente (produzione pre-FASE 3): nessun conto sugli incassi, come prima', async () => {
      // Solo i patrimoniali configurati: la voce 10.01 arriva con la migrazione
      vi.mocked(prisma.account.findUnique).mockImplementation(
        ((args: { where: { systemKey: string } }) =>
          Promise.resolve(
            args.where.systemKey === 'CORRISPETTIVI' ? null : CONTI_SISTEMA[args.where.systemKey]
          )) as never
      )
      conCentriAttivi()

      await generateJournalEntriesFromClosure(chiusuraCompleta, userId)

      const movimenti = movimentiGenerati()
      const incasso = movimenti.find((m) => m.debitAmount === 600)
      const pos = movimenti.find((m) => m.registerType === 'BANK' && m.debitAmount === 300)

      expect(incasso?.accountId).toBeNull()
      expect(pos?.accountId).toBeNull()
      // Il centro c'è comunque: è l'unica parte che non dipende dal piano dei conti
      expect(incasso?.costCenterId).toBe('cc-weiss')
      expect(pos?.costCenterId).toBe('cc-weiss')
    })

    it('nessun conto di sistema configurato: i movimenti nascono senza conto né contropartita', async () => {
      conCentriAttivi()

      await generateJournalEntriesFromClosure(chiusuraCompleta, userId)

      for (const movimento of movimentiGenerati()) {
        expect(movimento.counterpartId).toBeNull()
      }
      // La spesa conserva il conto della propria riga: non viene dai conti di sistema
      expect(movimentiGenerati().find((m) => m.creditAmount === 50)?.accountId).toBe('conto-merci')
    })

    it('il centro di testata è applicato a tutti i movimenti generati', async () => {
      conContiDiSistema()
      conCentriAttivi()

      await generateJournalEntriesFromClosure(chiusuraCompleta, userId)

      const movimenti = movimentiGenerati()
      expect(movimenti).toHaveLength(5)
      for (const movimento of movimenti) {
        expect(movimento.costCenterId).toBe('cc-weiss')
      }
    })

    it("l'override di riga vale solo per quella spesa", async () => {
      conContiDiSistema()
      conCentriAttivi()

      await generateJournalEntriesFromClosure(
        {
          ...chiusuraCompleta,
          expenses: [
            { amount: 50, payee: 'Fornitore', description: null, documentRef: null, accountId: 'conto-merci', costCenterId: 'cc-produzione' },
            { amount: 20, payee: 'Altro', description: null, documentRef: null, accountId: 'conto-merci' },
          ],
        },
        userId
      )

      const movimenti = movimentiGenerati()
      expect(movimenti.find((m) => m.creditAmount === 50)?.costCenterId).toBe('cc-produzione')
      // La spesa senza override e tutto il resto restano sulla testata
      expect(movimenti.find((m) => m.creditAmount === 20)?.costCenterId).toBe('cc-weiss')
      expect(movimenti.find((m) => m.registerType === 'BANK' && m.debitAmount === 300)?.costCenterId)
        .toBe('cc-weiss')
    })

    it('chiusura storica senza centro in testata: si usa il centro di default, non WEISS', async () => {
      conContiDiSistema()
      conCentriAttivi()

      const { costCenterId: _testata, ...chiusuraStorica } = chiusuraCompleta
      await generateJournalEntriesFromClosure(chiusuraStorica, userId)

      for (const movimento of movimentiGenerati()) {
        expect(movimento.costCenterId).toBe(CENTRO_DEFAULT.id)
      }
    })

    it('centro disattivato: il movimento nasce senza centro e la chiusura non si blocca', async () => {
      conContiDiSistema()
      vi.mocked(prisma.costCenter.findUnique).mockResolvedValue(
        { id: 'cc-weiss', isActive: false } as never
      )

      const risultato = await generateJournalEntriesFromClosure(chiusuraCompleta, userId)

      expect(risultato.entriesCreated).toBe(5)
      for (const movimento of movimentiGenerati()) {
        expect(movimento.costCenterId).toBeNull()
      }
      expect(logger.warn).toHaveBeenCalled()
    })

    it('anagrafica centri non ancora popolata: si genera lo stesso, senza centro', async () => {
      // risolviCentroDiCosto lancia quando manca il centro di default: la
      // quadratura della chiusura non può dipendere da quell'anagrafica.
      conContiDiSistema()
      vi.mocked(prisma.costCenter.findFirst).mockResolvedValue(null as never)

      const { costCenterId: _testata, ...chiusuraStorica } = chiusuraCompleta
      const risultato = await generateJournalEntriesFromClosure(chiusuraStorica, userId)

      expect(risultato.entriesCreated).toBe(5)
      for (const movimento of movimentiGenerati()) {
        expect(movimento.costCenterId).toBeNull()
      }
      expect(logger.error).toHaveBeenCalled()
    })
  })

  /**
   * L'invariante che protegge il dato contabile: l'imputazione è additiva.
   * Numero di movimenti, registri, importi, date e descrizioni sono quelli di
   * prima del piano dei conti v4, in qualunque stato si trovino conti e centri.
   */
  describe('Invariante di quadratura', () => {
    // Baseline: gli stessi cinque movimenti del caso "complete closure",
    // con gli importi fissati prima dell'introduzione dell'imputazione.
    const QUADRATURA_ATTESA = [
      { registerType: 'CASH', debitAmount: 600, creditAmount: null },
      { registerType: 'CASH', debitAmount: null, creditAmount: 50 },
      { registerType: 'BANK', debitAmount: 300, creditAmount: null },
      { registerType: 'CASH', debitAmount: null, creditAmount: 300 },
      { registerType: 'BANK', debitAmount: 300, creditAmount: null },
    ]

    const chiusura = {
      id: 'closure-1',
      date: baseDate,
      venueId: 'venue-1',
      bankDeposit: 300,
      stations: [
        { cashAmount: 400, posAmount: 200, floatAmount: 114 },
        { cashAmount: 150, posAmount: 100, floatAmount: 114 },
      ],
      expenses: [
        { amount: 50, payee: 'Fornitore', description: 'Merce', documentRef: null, accountId: null },
      ],
    }

    const configurazioni: Array<[string, () => void]> = [
      ['piano dei conti v4 migrato', () => { conContiDiSistema(); conCentriAttivi() }],
      ['CORRISPETTIVI non ancora creata', () => { conCentriAttivi() }],
      ['nessun conto e nessun centro configurato', () => {
        vi.mocked(prisma.costCenter.findFirst).mockResolvedValue(null as never)
      }],
    ]

    it.each(configurazioni)(
      'stessi movimenti e stessi importi con %s',
      async (_nome, configura) => {
        configura()

        const risultato = await generateJournalEntriesFromClosure(
          { ...chiusura, costCenterId: 'cc-weiss' },
          userId
        )

        expect(risultato).toEqual({ entriesCreated: 5, totalDebits: 1200, totalCredits: 350 })
        expect(
          movimentiGenerati().map(({ registerType, debitAmount, creditAmount }) => ({
            registerType,
            debitAmount,
            creditAmount,
          }))
        ).toEqual(QUADRATURA_ATTESA)
      }
    )

    it('la data e le descrizioni non cambiano con l\'imputazione', async () => {
      conContiDiSistema()
      conCentriAttivi()
      await generateJournalEntriesFromClosure({ ...chiusura, costCenterId: 'cc-weiss' }, userId)
      const conImputazione = movimentiGenerati().map((m) => ({ date: m.date, description: m.description }))

      vi.clearAllMocks()
      vi.mocked(prisma.account.findUnique).mockResolvedValue(null as never)
      vi.mocked(prisma.costCenter.findUnique).mockResolvedValue(null as never)
      vi.mocked(prisma.costCenter.findFirst).mockResolvedValue(null as never)
      await generateJournalEntriesFromClosure(chiusura, userId)
      const senzaImputazione = movimentiGenerati().map((m) => ({ date: m.date, description: m.description }))

      expect(conImputazione).toEqual(senzaImputazione)
      for (const movimento of senzaImputazione) {
        expect(movimento.date).toBe(baseDate)
      }
    })
  })
})

describe('deleteJournalEntriesForClosure', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should soft delete entries by closureId', async () => {
    const closureId = 'closure-to-delete'

    vi.mocked(prisma.journalEntry.updateMany).mockResolvedValue({ count: 5 })

    const result = await deleteJournalEntriesForClosure(closureId)

    // Cancellazione logica: le scritture restano tracciabili
    expect(prisma.journalEntry.updateMany).toHaveBeenCalledWith({
      where: { closureId, deletedAt: null },
      data: { deletedAt: expect.any(Date) },
    })
    expect(prisma.journalEntry.deleteMany).not.toHaveBeenCalled()
    expect(result).toBe(5)
  })

  it('should return 0 when no entries found', async () => {
    vi.mocked(prisma.journalEntry.updateMany).mockResolvedValue({ count: 0 })

    const result = await deleteJournalEntriesForClosure('non-existent')

    expect(result).toBe(0)
  })
})

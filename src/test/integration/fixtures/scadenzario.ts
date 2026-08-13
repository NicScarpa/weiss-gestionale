import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { venueDiTest, centroDiCostoDiDefault } from './closures'

/**
 * Fixture per scadenzario, prima nota e fatture.
 *
 * Costruiscono righe vere sul database di test: i vincoli (unicità, foreign
 * key, indici parziali) restano quelli della produzione, così un test che
 * verifica una doppia generazione o una doppia riconciliazione la verifica
 * davvero e non contro un mock compiacente.
 */

function decimal(valore: number): Prisma.Decimal {
  return new Prisma.Decimal(valore.toFixed(2))
}

export interface ScadenzaFixture {
  tipo?: 'attiva' | 'passiva'
  stato?: string
  descrizione?: string
  importoTotale?: number
  importoPagato?: number
  dataScadenza?: Date
  dataPagamento?: Date | null
  supplierId?: string | null
  invoiceId?: string | null
  venueId?: string
  recurrenceId?: string | null
  ricorrenzaParentId?: string | null
  /** Riferimento del documento (es. numero fattura), cercato nella causale. */
  numeroDocumento?: string | null
  /** Ragione sociale della controparte, cercata nella causale. */
  controparteNome?: string | null
  /** IBAN della controparte, cercato nella causale. */
  controparteIban?: string | null
  /** 'bonifico', 'riba', 'sdd', 'carta', 'contanti', 'f24', 'altro' */
  metodoPagamento?: string | null
}

export async function creaScadenza(fixture: ScadenzaFixture = {}) {
  const venueId = fixture.venueId ?? (await venueDiTest()).id

  return prisma.schedule.create({
    data: {
      venueId,
      tipo: fixture.tipo ?? 'passiva',
      stato: fixture.stato ?? 'aperta',
      descrizione: fixture.descrizione ?? 'Fattura fornitore',
      importoTotale: decimal(fixture.importoTotale ?? 100),
      importoPagato: decimal(fixture.importoPagato ?? 0),
      dataScadenza: fixture.dataScadenza ?? new Date('2026-07-31'),
      dataPagamento: fixture.dataPagamento ?? null,
      supplierId: fixture.supplierId ?? null,
      invoiceId: fixture.invoiceId ?? null,
      recurrenceId: fixture.recurrenceId ?? null,
      ricorrenzaParentId: fixture.ricorrenzaParentId ?? null,
      numeroDocumento: fixture.numeroDocumento ?? null,
      controparteNome: fixture.controparteNome ?? null,
      controparteIban: fixture.controparteIban ?? null,
      metodoPagamento: fixture.metodoPagamento ?? null,
    },
  })
}

export interface MovimentoFixture {
  /** Entrata (debitAmount): salda le scadenze attive. */
  entrata?: number
  /** Uscita (creditAmount): salda le scadenze passive. */
  uscita?: number
  /**
   * IVA dichiarata sulla testata. Assente = `null`, che è come nascono i
   * movimenti dei tre percorsi automatici (import bancario, motore delle
   * regole, esecuzione di un pagamento): serve poterla lasciare vuota tanto
   * quanto serve poterla valorizzare.
   */
  iva?: number
  date?: Date
  description?: string
  venueId?: string
  registerType?: 'CASH' | 'BANK'
  closureId?: string | null
  /**
   * Centro di costo del movimento. Di default quello strutturale del seed.
   * Non ammette più `null`: `journal_entries.cost_center_id` è NOT NULL dal
   * 12 ago 2026, quindi un movimento senza centro non è uno scenario da
   * testare — è una riga che il database rifiuta.
   */
  costCenterId?: string
}

export async function creaMovimento(fixture: MovimentoFixture = {}) {
  const venueId = fixture.venueId ?? (await venueDiTest()).id
  const costCenterId = fixture.costCenterId ?? (await centroDiCostoDiDefault())

  return prisma.journalEntry.create({
    data: {
      venueId,
      date: fixture.date ?? new Date('2026-08-03'),
      registerType: fixture.registerType ?? 'BANK',
      description: fixture.description ?? 'Bonifico fornitore',
      debitAmount: fixture.entrata !== undefined ? decimal(fixture.entrata) : null,
      creditAmount: fixture.uscita !== undefined ? decimal(fixture.uscita) : null,
      vatAmount: fixture.iva !== undefined ? decimal(fixture.iva) : null,
      closureId: fixture.closureId ?? null,
      costCenterId,
    },
  })
}

export interface FatturaFixture {
  status?: 'IMPORTED' | 'MATCHED' | 'CATEGORIZED' | 'RECORDED' | 'PAID'
  totalAmount?: number
  invoiceNumber?: string
  invoiceDate?: Date
  supplierVat?: string
  venueId?: string
  journalEntryId?: string | null
  recordedAt?: Date | null
  accountId?: string | null
  supplierId?: string | null
}

export async function creaFattura(fixture: FatturaFixture = {}) {
  const venueId = fixture.venueId ?? (await venueDiTest()).id
  const totale = fixture.totalAmount ?? 200

  return prisma.electronicInvoice.create({
    data: {
      venueId,
      invoiceNumber: fixture.invoiceNumber ?? `FT-${Math.random().toString(36).slice(2, 10)}`,
      invoiceDate: fixture.invoiceDate ?? new Date('2026-07-01'),
      supplierVat: fixture.supplierVat ?? '01234567890',
      supplierName: 'Fornitore di prova',
      totalAmount: decimal(totale),
      vatAmount: decimal(0),
      netAmount: decimal(totale),
      status: fixture.status ?? 'RECORDED',
      journalEntryId: fixture.journalEntryId ?? null,
      recordedAt: fixture.recordedAt ?? null,
      accountId: fixture.accountId ?? null,
      supplierId: fixture.supplierId ?? null,
    },
  })
}

export interface RicorrenzaFixture {
  tipo?: 'attiva' | 'passiva'
  descrizione?: string
  importo?: number
  frequenza?: string
  giornoDelMese?: number | null
  dataInizio?: Date
  dataFine?: Date | null
  prossimaGenerazione?: Date | null
  isActive?: boolean
  venueId?: string
}

export async function creaRicorrenza(fixture: RicorrenzaFixture = {}) {
  const venueId = fixture.venueId ?? (await venueDiTest()).id

  return prisma.recurrence.create({
    data: {
      venueId,
      tipo: fixture.tipo ?? 'passiva',
      descrizione: fixture.descrizione ?? 'Affitto',
      importo: decimal(fixture.importo ?? 1200),
      frequenza: fixture.frequenza ?? 'mensile',
      giornoDelMese: fixture.giornoDelMese ?? 1,
      dataInizio: fixture.dataInizio ?? new Date('2026-01-01'),
      dataFine: fixture.dataFine ?? null,
      prossimaGenerazione: fixture.prossimaGenerazione ?? new Date('2026-09-01'),
      isActive: fixture.isActive ?? true,
    },
  })
}

/** Fornitore del seed, quando al test basta "un fornitore qualsiasi". */
export async function fornitoreDiTest() {
  const supplier = await prisma.supplier.findFirst({ orderBy: { name: 'asc' } })
  if (!supplier) {
    throw new Error('Nessun fornitore nel database di test: il seed non è stato applicato.')
  }
  return supplier
}

/** Rilettura secca della scadenza, senza include: comoda nelle asserzioni. */
export async function rileggiScadenza(id: string) {
  const schedule = await prisma.schedule.findUnique({ where: { id } })
  if (!schedule) throw new Error(`Scadenza ${id} sparita dal database`)
  return {
    ...schedule,
    importoTotaleNum: Number(schedule.importoTotale),
    importoPagatoNum: Number(schedule.importoPagato),
  }
}

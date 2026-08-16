import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/prisma'
import { setupIntegrationDb } from '@/test/integration/db'
import { venueDiTest, centroDiCosto } from '@/test/integration/fixtures/closures'
import { creaMovimento, creaScadenza, fornitoreDiTest, rileggiScadenza } from '@/test/integration/fixtures/scadenzario'
import { promuoviRigaBancaria, scollegaRigaBancaria } from '../promozione-riga-bancaria-service'

setupIntegrationDb()

async function contesto() {
  const venue = await venueDiTest()
  const conto = await prisma.bankAccount.create({ data: { venueId: venue.id, name: 'Weiss', accountType: 'BANK' } })
  const contoCosto = await prisma.account.findFirstOrThrow({ where: { type: 'COSTO', isActive: true, costCenterRule: 'DEFAULT_STR' } })
  return { venueId: venue.id, contoId: conto.id, contoCostoId: contoCosto.id }
}

/** Una riga della banca come la scrive il mapper: testo grezzo, descrizione e causale separate. */
async function rigaBanca(venueId: string, contoId: string, importo: number, extra: { descrizione?: string | null } = {}) {
  return prisma.bankTransaction.create({
    data: {
      venueId,
      bankAccountId: contoId,
      transactionDate: new Date('2026-08-10'),
      description: 'Bonifico tramite Internet Banking *ROSSI SRL FT 12',
      descrizione: extra.descrizione === undefined ? 'ROSSI SRL FT 12' : extra.descrizione,
      causale: 'Bonifico tramite internet banking',
      amount: importo,
      importSource: 'PSD2_GOCARDLESS',
      status: 'PENDING',
    },
  })
}

/** La scrittura come sta sul database, cancellata compresa: il client la filtrerebbe. */
async function scritturaGrezza(id: string) {
  const righe = await prisma.$queryRaw<
    Array<{ deleted_at: Date | null; account_id: string | null; cost_center_id: string; cost_center_source: string | null; verified: boolean; debit_amount: unknown; credit_amount: unknown; description: string; date: Date; entry_type: string | null; register_type: string; counterpart_name: string | null; document_ref: string | null }>
  >`SELECT deleted_at, account_id, cost_center_id, cost_center_source, verified, debit_amount, credit_amount, description, date, entry_type, register_type, counterpart_name, document_ref FROM journal_entries WHERE id = ${id}`
  return righe[0] ?? null
}

async function rigaDopo(id: string) {
  return prisma.bankTransaction.findUniqueOrThrow({ where: { id } })
}

/** Un conto con la regola OBBLIGATORIO: dal seed, o creato apposta se il seed non ne ha. */
async function contoObbligatorio() {
  const dalSeed = await prisma.account.findFirst({ where: { costCenterRule: 'OBBLIGATORIO', isActive: true } })
  if (dalSeed) return dalSeed
  return prisma.account.create({ data: { code: 'PROVA-OBB', name: 'Conto di prova (centro obbligatorio)', type: 'COSTO', costCenterRule: 'OBBLIGATORIO' } })
}

describe('promuoviRigaBancaria', () => {
  it('Categorizza crea la scrittura BANK dalla riga, una sola volta, e la lega', async () => {
    const { venueId, contoId, contoCostoId } = await contesto()
    const centro = await centroDiCosto('WEISS')
    const riga = await rigaBanca(venueId, contoId, -68.93)

    const esito = await promuoviRigaBancaria({
      bankTransactionId: riga.id, venueId, userId: null, origine: 'categorizza',
      imputazione: { accountId: contoCostoId, costCenterId: centro },
    })
    expect(esito.outcome).toBe('ok')
    if (esito.outcome !== 'ok') throw new Error('impossibile')
    expect(esito.creata).toBe(true)
    expect(esito.reconciliationIds).toEqual([])
    expect(esito.residuo).toBe(0)

    const scrittura = await scritturaGrezza(esito.journalEntryId)
    expect(scrittura?.register_type).toBe('BANK')
    expect(scrittura?.entry_type).toBe('USCITA')
    expect(scrittura?.date.toISOString().slice(0, 10)).toBe('2026-08-10')
    expect(Number(scrittura?.credit_amount)).toBe(68.93)
    expect(scrittura?.debit_amount).toBeNull()
    expect(scrittura?.description).toBe('ROSSI SRL FT 12') // descrizione ?? description
    expect(scrittura?.account_id).toBe(contoCostoId)
    expect(scrittura?.cost_center_id).toBe(centro)
    expect(scrittura?.verified).toBe(true)

    const dopo = await rigaDopo(riga.id)
    expect(dopo.matchedEntryId).toBe(esito.journalEntryId)
    expect(dopo.status).toBe('MANUAL')
    expect(dopo.origineScrittura).toBe('CATEGORIZZA')
    expect(Number(dopo.residuoDocumenti)).toBe(0)
    expect(dopo.reconciledAt).not.toBeNull()

    // Una seconda categorizzazione aggiorna la stessa scrittura: non ne nasce un'altra.
    const altroConto = await prisma.account.findFirstOrThrow({ where: { type: 'COSTO', isActive: true, costCenterRule: 'DEFAULT_STR', id: { not: contoCostoId } } })
    const secondo = await promuoviRigaBancaria({
      bankTransactionId: riga.id, venueId, userId: null, origine: 'categorizza', imputazione: { accountId: altroConto.id },
    })
    expect(secondo.outcome).toBe('ok')
    if (secondo.outcome !== 'ok') throw new Error('impossibile')
    expect(secondo.creata).toBe(false)
    expect(secondo.journalEntryId).toBe(esito.journalEntryId)
    expect((await scritturaGrezza(esito.journalEntryId))?.account_id).toBe(altroConto.id)
    expect(await prisma.journalEntry.count({ where: { venueId, registerType: 'BANK' } })).toBe(1)
  })

  it('una seconda categorizzazione senza centro conserva il centro scelto la prima volta', async () => {
    const { venueId, contoId, contoCostoId } = await contesto()
    const centro = await centroDiCosto('WEISS')
    const riga = await rigaBanca(venueId, contoId, -50)

    const primo = await promuoviRigaBancaria({
      bankTransactionId: riga.id, venueId, userId: null, origine: 'categorizza',
      imputazione: { accountId: contoCostoId, costCenterId: centro },
    })
    if (primo.outcome !== 'ok') throw new Error(primo.outcome)
    expect((await scritturaGrezza(primo.journalEntryId))?.cost_center_source).toBe('scelto')

    // Il conto cambia, il centro no: la regola del conto nuovo (DEFAULT_STR →
    // STR) non può disfare una scelta umana.
    const altroConto = await prisma.account.findFirstOrThrow({ where: { type: 'COSTO', isActive: true, costCenterRule: 'DEFAULT_STR', id: { not: contoCostoId } } })
    const secondo = await promuoviRigaBancaria({
      bankTransactionId: riga.id, venueId, userId: null, origine: 'categorizza', imputazione: { accountId: altroConto.id },
    })
    if (secondo.outcome !== 'ok') throw new Error(secondo.outcome)

    const scrittura = await scritturaGrezza(secondo.journalEntryId)
    expect(scrittura?.account_id).toBe(altroConto.id)
    expect(scrittura?.cost_center_id).toBe(centro)
    expect(scrittura?.cost_center_source).toBe('scelto')
  })

  it('senza descrizione letta la scrittura prende il testo grezzo della banca', async () => {
    const { venueId, contoId, contoCostoId } = await contesto()
    const riga = await rigaBanca(venueId, contoId, 250, { descrizione: null })
    const esito = await promuoviRigaBancaria({ bankTransactionId: riga.id, venueId, userId: null, origine: 'categorizza', imputazione: { accountId: contoCostoId } })
    if (esito.outcome !== 'ok') throw new Error(esito.outcome)
    const scrittura = await scritturaGrezza(esito.journalEntryId)
    expect(scrittura?.description).toBe('Bonifico tramite Internet Banking *ROSSI SRL FT 12')
    expect(scrittura?.entry_type).toBe('INCASSO')
    expect(Number(scrittura?.debit_amount)).toBe(250)
  })

  it('Collega con una scadenza intera: conto dal fornitore, riconciliazione, pagamento, scadenza pagata, residuo zero', async () => {
    const { venueId, contoId, contoCostoId } = await contesto()
    const fornitore = await fornitoreDiTest()
    await prisma.supplier.update({ where: { id: fornitore.id }, data: { defaultAccountId: contoCostoId } })
    const scadenza = await creaScadenza({ importoTotale: 100, supplierId: fornitore.id, numeroDocumento: 'FT 12' })
    const riga = await rigaBanca(venueId, contoId, -100)

    const esito = await promuoviRigaBancaria({
      bankTransactionId: riga.id, venueId, userId: null, origine: 'collega',
      scadenze: [{ scheduleId: scadenza.id, amount: 100 }],
    })
    expect(esito.outcome).toBe('ok')
    if (esito.outcome !== 'ok') throw new Error('impossibile')
    expect(esito.creata).toBe(true)
    expect(esito.reconciliationIds).toHaveLength(1)
    expect(esito.residuo).toBe(0)

    const scrittura = await scritturaGrezza(esito.journalEntryId)
    expect(scrittura?.account_id).toBe(contoCostoId)
    expect(scrittura?.document_ref).toBe('FT 12')
    expect(scrittura?.counterpart_name).toBe(fornitore.name)

    const riconciliazione = await prisma.scheduleReconciliation.findUniqueOrThrow({ where: { id: esito.reconciliationIds[0] } })
    expect(riconciliazione.source).toBe('MANUAL')
    expect(Number(riconciliazione.amount)).toBe(100)
    expect(riconciliazione.paymentId).not.toBeNull()

    expect((await rileggiScadenza(scadenza.id)).stato).toBe('pagata')
    const dopo = await rigaDopo(riga.id)
    expect(dopo.origineScrittura).toBe('COLLEGA')
    expect(dopo.status).toBe('MANUAL')
    expect(Number(dopo.residuoDocumenti)).toBe(0)
  })

  it('Collega parziale: due scadenze che non coprono la riga lasciano il residuo', async () => {
    const { venueId, contoId } = await contesto()
    const s1 = await creaScadenza({ importoTotale: 60 })
    const s2 = await creaScadenza({ importoTotale: 30 })
    const riga = await rigaBanca(venueId, contoId, -100)

    const esito = await promuoviRigaBancaria({
      bankTransactionId: riga.id, venueId, userId: null, origine: 'collega',
      scadenze: [{ scheduleId: s1.id, amount: 60 }, { scheduleId: s2.id, amount: 30 }],
    })
    if (esito.outcome !== 'ok') throw new Error(esito.outcome)
    expect(esito.reconciliationIds).toHaveLength(2)
    expect(esito.residuo).toBe(10)
    expect(Number((await rigaDopo(riga.id)).residuoDocumenti)).toBe(10)
    // Nessuna imputazione e nessun fornitore: la scrittura nasce senza conto,
    // col centro operativo supposto, e resta da verificare.
    const scrittura = await scritturaGrezza(esito.journalEntryId)
    expect(scrittura?.account_id).toBeNull()
    expect(scrittura?.verified).toBe(false)
  })

  it('importo eccedente: l\'esito porta il residuo e non si scrive nulla', async () => {
    const { venueId, contoId } = await contesto()
    const s1 = await creaScadenza({ importoTotale: 80 })
    const s2 = await creaScadenza({ importoTotale: 30 })
    const riga = await rigaBanca(venueId, contoId, -100)

    const esito = await promuoviRigaBancaria({
      bankTransactionId: riga.id, venueId, userId: null, origine: 'collega',
      scadenze: [{ scheduleId: s1.id, amount: 80 }, { scheduleId: s2.id, amount: 30 }],
    })
    expect(esito).toEqual({ outcome: 'importo_eccedente', residuo: 100 })
    expect(await prisma.journalEntry.count({ where: { venueId, registerType: 'BANK' } })).toBe(0)
    expect(await prisma.scheduleReconciliation.count()).toBe(0)
    expect((await rigaDopo(riga.id)).matchedEntryId).toBeNull()
  })

  it('una scadenza già pagata fa cadere tutta la promozione', async () => {
    const { venueId, contoId } = await contesto()
    const aperta = await creaScadenza({ importoTotale: 40 })
    const pagata = await creaScadenza({ importoTotale: 40, stato: 'pagata', importoPagato: 40 })
    const riga = await rigaBanca(venueId, contoId, -100)

    const esito = await promuoviRigaBancaria({
      bankTransactionId: riga.id, venueId, userId: null, origine: 'collega',
      scadenze: [{ scheduleId: aperta.id, amount: 40 }, { scheduleId: pagata.id, amount: 40 }],
    })
    expect(esito.outcome).toBe('riconciliazione_rifiutata')
    if (esito.outcome !== 'riconciliazione_rifiutata') throw new Error('impossibile')
    expect(esito.scheduleId).toBe(pagata.id)
    // Rollback intero: nemmeno la prima gamba resta scritta.
    expect(await prisma.scheduleReconciliation.count()).toBe(0)
    expect(await prisma.journalEntry.count({ where: { venueId, registerType: 'BANK' } })).toBe(0)
    expect((await rigaDopo(riga.id)).status).toBe('PENDING')
  })

  it('la R4 lega una scrittura che esiste già, senza crearne una', async () => {
    const { venueId, contoId } = await contesto()
    const esistente = await creaMovimento({ uscita: 100, description: 'Incasso POS' })
    const riga = await rigaBanca(venueId, contoId, -100)

    const esito = await promuoviRigaBancaria({ bankTransactionId: riga.id, venueId, userId: null, origine: 'collega', scritturaEsistenteId: esistente.id })
    if (esito.outcome !== 'ok') throw new Error(esito.outcome)
    expect(esito.creata).toBe(false)
    expect(esito.journalEntryId).toBe(esistente.id)
    const dopo = await rigaDopo(riga.id)
    expect(dopo.matchedEntryId).toBe(esistente.id)
    expect(dopo.origineScrittura).toBeNull()
    expect(dopo.status).toBe('MANUAL')
    expect(await prisma.journalEntry.count({ where: { venueId, registerType: 'BANK' } })).toBe(1)
  })

  it('la R4 lega anche una scrittura di importo diverso, e il residuo lo dicono i documenti', async () => {
    const { venueId, contoId } = await contesto()
    // Il piano lo dice: la R4 accosta una scrittura che esiste già, e non
    // pretende che valga quanto la riga. Quanto resta scoperto lo dicono i
    // documenti riconciliati, non la differenza fra i due importi.
    const esistente = await creaMovimento({ uscita: 80 })
    const riga = await rigaBanca(venueId, contoId, -100)

    const esito = await promuoviRigaBancaria({ bankTransactionId: riga.id, venueId, userId: null, origine: 'collega', scritturaEsistenteId: esistente.id })
    if (esito.outcome !== 'ok') throw new Error(esito.outcome)
    expect(esito.creata).toBe(false)
    expect(esito.journalEntryId).toBe(esistente.id)
    expect(esito.residuo).toBe(0)

    const dopo = await rigaDopo(riga.id)
    expect(dopo.matchedEntryId).toBe(esistente.id)
    expect(Number(dopo.residuoDocumenti)).toBe(0)
  })

  it('Categorizza su una riga promossa con le fette si rifiuta', async () => {
    const { venueId, contoId, contoCostoId } = await contesto()
    const riga = await rigaBanca(venueId, contoId, -100)
    const primo = await promuoviRigaBancaria({
      bankTransactionId: riga.id, venueId, userId: null, origine: 'categorizza', imputazione: { accountId: contoCostoId },
    })
    if (primo.outcome !== 'ok') throw new Error(primo.outcome)

    // Con le fette il conto lo governa la suddivisione: riscriverlo da qui
    // darebbe un conto che nessuna fetta sostiene.
    await prisma.journalEntryAllocation.create({
      data: { journalEntryId: primo.journalEntryId, accountId: contoCostoId, importo: 10, origine: 'manuale' },
    })

    const altroConto = await prisma.account.findFirstOrThrow({ where: { type: 'COSTO', isActive: true, costCenterRule: 'DEFAULT_STR', id: { not: contoCostoId } } })
    const secondo = await promuoviRigaBancaria({
      bankTransactionId: riga.id, venueId, userId: null, origine: 'categorizza', imputazione: { accountId: altroConto.id },
    })
    expect(secondo.outcome).toBe('imputazione_non_valida')
    if (secondo.outcome !== 'imputazione_non_valida') throw new Error('impossibile')
    expect(secondo.motivo).toContain('ripartita')
    expect((await scritturaGrezza(primo.journalEntryId))?.account_id).toBe(contoCostoId)
  })

  it('una scrittura del verso opposto non si lega', async () => {
    const { venueId, contoId } = await contesto()
    const entrata = await creaMovimento({ entrata: 100 })
    const riga = await rigaBanca(venueId, contoId, -100)
    const esito = await promuoviRigaBancaria({ bankTransactionId: riga.id, venueId, userId: null, origine: 'collega', scritturaEsistenteId: entrata.id })
    expect(esito.outcome).toBe('imputazione_non_valida')
  })

  it('una scrittura già legata a un\'altra riga si rifiuta', async () => {
    const { venueId, contoId } = await contesto()
    const esistente = await creaMovimento({ uscita: 100 })
    const prima = await rigaBanca(venueId, contoId, -100)
    const seconda = await rigaBanca(venueId, contoId, -100)
    await promuoviRigaBancaria({ bankTransactionId: prima.id, venueId, userId: null, origine: 'collega', scritturaEsistenteId: esistente.id })

    const esito = await promuoviRigaBancaria({ bankTransactionId: seconda.id, venueId, userId: null, origine: 'collega', scritturaEsistenteId: esistente.id })
    expect(esito).toEqual({ outcome: 'scrittura_gia_collegata_ad_altra_riga' })
    expect((await rigaDopo(seconda.id)).matchedEntryId).toBeNull()
  })

  it('una riga nel Cestino non si promuove; una riga inesistente nemmeno', async () => {
    const { venueId, contoId, contoCostoId } = await contesto()
    const riga = await rigaBanca(venueId, contoId, -10)
    await prisma.bankTransaction.update({ where: { id: riga.id }, data: { deletedAt: new Date() } })
    expect(await promuoviRigaBancaria({ bankTransactionId: riga.id, venueId, userId: null, origine: 'categorizza', imputazione: { accountId: contoCostoId } })).toEqual({ outcome: 'riga_nel_cestino' })
    expect(await promuoviRigaBancaria({ bankTransactionId: 'non-esiste', venueId, userId: null, origine: 'categorizza', imputazione: { accountId: contoCostoId } })).toEqual({ outcome: 'riga_non_trovata' })
  })

  it('la proposta approvata scrive MATCHED sulla riga e PROPOSAL con la confidenza sulla riconciliazione', async () => {
    const { venueId, contoId } = await contesto()
    const scadenza = await creaScadenza({ importoTotale: 100 })
    const riga = await rigaBanca(venueId, contoId, -100)
    const esito = await promuoviRigaBancaria({
      bankTransactionId: riga.id, venueId, userId: null, origine: 'proposta',
      scadenze: [{ scheduleId: scadenza.id, amount: 100 }], confidence: 0.98,
    })
    if (esito.outcome !== 'ok') throw new Error(esito.outcome)
    const dopo = await rigaDopo(riga.id)
    expect(dopo.status).toBe('MATCHED')
    expect(dopo.origineScrittura).toBe('PROPOSTA')
    expect(Number(dopo.matchConfidence)).toBe(0.98)
    const riconciliazione = await prisma.scheduleReconciliation.findUniqueOrThrow({ where: { id: esito.reconciliationIds[0] } })
    expect(riconciliazione.source).toBe('PROPOSAL')
    expect(Number(riconciliazione.confidence)).toBe(0.98)
  })

  it('un conto con centro obbligatorio senza centro si rifiuta col codice, e non crea nulla', async () => {
    const { venueId, contoId } = await contesto()
    const conto = await contoObbligatorio()
    const riga = await rigaBanca(venueId, contoId, -10)
    const esito = await promuoviRigaBancaria({ bankTransactionId: riga.id, venueId, userId: null, origine: 'categorizza', imputazione: { accountId: conto.id } })
    expect(esito.outcome).toBe('imputazione_non_valida')
    if (esito.outcome !== 'imputazione_non_valida') throw new Error('impossibile')
    expect(esito.code).toBe('CENTRO_DI_COSTO_OBBLIGATORIO')
    expect((await rigaDopo(riga.id)).matchedEntryId).toBeNull()
  })

  it('un conto inesistente si rifiuta come imputazione non valida', async () => {
    const { venueId, contoId } = await contesto()
    const riga = await rigaBanca(venueId, contoId, -10)
    const esito = await promuoviRigaBancaria({ bankTransactionId: riga.id, venueId, userId: null, origine: 'categorizza', imputazione: { accountId: 'non-esiste' } })
    expect(esito.outcome).toBe('imputazione_non_valida')
  })
})

describe('scollegaRigaBancaria', () => {
  it('su una riga promossa con documenti ritira riconciliazioni, pagamenti e scrittura; la scadenza torna aperta', async () => {
    const { venueId, contoId } = await contesto()
    const scadenza = await creaScadenza({ importoTotale: 100 })
    const riga = await rigaBanca(venueId, contoId, -100)
    const promossa = await promuoviRigaBancaria({
      bankTransactionId: riga.id, venueId, userId: null, origine: 'collega',
      scadenze: [{ scheduleId: scadenza.id, amount: 100 }],
    })
    if (promossa.outcome !== 'ok') throw new Error(promossa.outcome)
    expect((await rileggiScadenza(scadenza.id)).stato).toBe('pagata')

    const esito = await scollegaRigaBancaria({ bankTransactionId: riga.id, venueId, userId: null })
    expect(esito).toEqual({ outcome: 'ok', scritturaRitirata: true, riconciliazioniAnnullate: 1 })

    expect(await prisma.scheduleReconciliation.count({ where: { journalEntryId: promossa.journalEntryId } })).toBe(0)
    expect(await prisma.schedulePayment.count({ where: { scheduleId: scadenza.id } })).toBe(0)
    const dopoScadenza = await rileggiScadenza(scadenza.id)
    expect(dopoScadenza.stato).toBe('aperta')
    expect(dopoScadenza.importoPagatoNum).toBe(0)
    // Ritirata, non cancellata: la riga esiste ancora, con deleted_at.
    expect((await scritturaGrezza(promossa.journalEntryId))?.deleted_at).not.toBeNull()

    const dopo = await rigaDopo(riga.id)
    expect(dopo.matchedEntryId).toBeNull()
    expect(dopo.origineScrittura).toBeNull()
    expect(dopo.status).toBe('PENDING')
    expect(dopo.residuoDocumenti).toBeNull()
    expect(dopo.reconciledAt).toBeNull()
  })

  it('su una R4 slega e basta: la scrittura resta in prima nota con le sue riconciliazioni', async () => {
    const { venueId, contoId } = await contesto()
    const scadenza = await creaScadenza({ importoTotale: 100 })
    const esistente = await creaMovimento({ uscita: 100 })
    // La scrittura era già riconciliata dallo scadenzario, prima del legame.
    const { reconcileScheduleWithEntry } = await import('@/lib/services/schedule-reconciliation-service')
    const ric = await reconcileScheduleWithEntry({ scheduleId: scadenza.id, journalEntryId: esistente.id, venueId, userId: null })
    expect(ric.outcome).toBe('ok')
    const riga = await rigaBanca(venueId, contoId, -100)
    await promuoviRigaBancaria({ bankTransactionId: riga.id, venueId, userId: null, origine: 'collega', scritturaEsistenteId: esistente.id })
    expect(Number((await rigaDopo(riga.id)).residuoDocumenti)).toBe(0)

    const esito = await scollegaRigaBancaria({ bankTransactionId: riga.id, venueId, userId: null })
    expect(esito).toEqual({ outcome: 'ok', scritturaRitirata: false, riconciliazioniAnnullate: 0 })
    expect((await scritturaGrezza(esistente.id))?.deleted_at).toBeNull()
    expect(await prisma.scheduleReconciliation.count({ where: { journalEntryId: esistente.id } })).toBe(1)
    expect((await rigaDopo(riga.id)).matchedEntryId).toBeNull()
  })

  it('su una riga categorizzata ritira la scrittura, senza riconciliazioni da annullare', async () => {
    const { venueId, contoId, contoCostoId } = await contesto()
    const riga = await rigaBanca(venueId, contoId, -0.75)
    const promossa = await promuoviRigaBancaria({ bankTransactionId: riga.id, venueId, userId: null, origine: 'categorizza', imputazione: { accountId: contoCostoId } })
    if (promossa.outcome !== 'ok') throw new Error(promossa.outcome)
    const esito = await scollegaRigaBancaria({ bankTransactionId: riga.id, venueId, userId: null })
    expect(esito).toEqual({ outcome: 'ok', scritturaRitirata: true, riconciliazioniAnnullate: 0 })
    expect((await scritturaGrezza(promossa.journalEntryId))?.deleted_at).not.toBeNull()
    // Dopo lo scollegamento la riga si può promuovere di nuovo, e nasce una scrittura nuova.
    const di_nuovo = await promuoviRigaBancaria({ bankTransactionId: riga.id, venueId, userId: null, origine: 'categorizza', imputazione: { accountId: contoCostoId } })
    if (di_nuovo.outcome !== 'ok') throw new Error(di_nuovo.outcome)
    expect(di_nuovo.creata).toBe(true)
    expect(di_nuovo.journalEntryId).not.toBe(promossa.journalEntryId)
  })

  it('su una riga non collegata riporta lo stato a PENDING senza errore; su una riga inesistente risponde riga_non_trovata', async () => {
    const { venueId, contoId } = await contesto()
    const riga = await rigaBanca(venueId, contoId, -10)
    await prisma.bankTransaction.update({ where: { id: riga.id }, data: { status: 'MATCHED' } })
    expect(await scollegaRigaBancaria({ bankTransactionId: riga.id, venueId, userId: null })).toEqual({ outcome: 'ok', scritturaRitirata: false, riconciliazioniAnnullate: 0 })
    expect((await rigaDopo(riga.id)).status).toBe('PENDING')
    expect(await scollegaRigaBancaria({ bankTransactionId: 'non-esiste', venueId, userId: null })).toEqual({ outcome: 'riga_non_trovata' })
  })
})

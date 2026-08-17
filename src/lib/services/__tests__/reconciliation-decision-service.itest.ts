import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/prisma'
import { setupIntegrationDb } from '@/test/integration/db'
import { venueDiTest } from '@/test/integration/fixtures/closures'
import {
  creaMovimento,
  creaScadenza,
  fornitoreDiTest,
  rileggiScadenza,
} from '@/test/integration/fixtures/scadenzario'
import { saldiAlGiorno } from '@/lib/saldi'
import { approvaProposta, scartaProposta } from '../reconciliation-decision-service'
import { generaLotto } from '../reconciliation-batch-service'

/**
 * L'approvazione di una proposta, su database vero.
 *
 * L'invariante del 15 agosto vista dall'altro capo: un documento fiscale non
 * genera denaro, ma una riga dell'estratto conto **è** denaro già mosso — è la
 * banca a dirlo — e la prima nota deve seguirlo. Approvare una proposta è
 * quindi l'unico gesto della riconciliazione che ha il diritto di far nascere
 * una scrittura.
 *
 * Spec: docs/superpowers/specs/2026-08-16-riconciliazione-a2-primo-taglio-design.md
 * (decisione 3) e la spec madre del 13 agosto, «Cosa succede approvando».
 */
setupIntegrationDb()

/** Un utente vero del seed: `decisoDaId` è una foreign key, non una stringa. */
async function utenteDiTest() {
  return prisma.user.findFirstOrThrow({
    where: { role: { name: 'admin' }, isActive: true },
    orderBy: { username: 'asc' },
  })
}

async function contoBancario(venueId: string) {
  return prisma.bankAccount.create({
    data: { venueId, name: 'Banca Della Marca', accountType: 'BANK' },
  })
}

/** Una riga dell'estratto conto come la scrive il mapper della sincronizzazione. */
async function rigaBanca(venueId: string, bankAccountId: string, importo: number) {
  return prisma.bankTransaction.create({
    data: {
      venueId,
      bankAccountId,
      transactionDate: new Date('2026-08-10'),
      description: 'Bonifico tramite Internet Banking *ROSSI SRL FT 12',
      descrizione: 'ROSSI SRL FT 12',
      causale: 'Bonifico tramite internet banking',
      amount: -importo,
      importSource: 'PSD2_GOCARDLESS',
      status: 'PENDING',
    },
  })
}

/**
 * Tre scadenze già pagate dello stesso fornitore, con dieci giorni di ritardo
 * ciascuna: è il campione minimo che `stimaRitardoFornitore` pretende
 * (`STIMA_MIN_CAMPIONE = 3`) perché una stima esista. Senza, il ricalcolo
 * girerebbe a vuoto e non lascerebbe traccia da osservare.
 */
async function storiaDiPagamenti(venueId: string, supplierId: string) {
  for (const mese of ['04', '05', '06']) {
    await creaScadenza({
      venueId,
      supplierId,
      tipo: 'passiva',
      stato: 'pagata',
      importoTotale: 50,
      importoPagato: 50,
      dataScadenza: new Date(`2026-${mese}-01`),
      dataPagamento: new Date(`2026-${mese}-11`),
    })
  }
}

/**
 * Un lotto con una proposta R1 pronta da approvare.
 *
 * Le righe si scrivono a mano perché non esiste una fixture: `generaLotto`
 * produrrebbe proposte solo se il motore trovasse davvero l'abbinamento, e
 * legare questi test al punteggio significherebbe vederli rossi al primo
 * ritocco dei pesi.
 *
 * Il fornitore porta una storia di pagamenti e una seconda scadenza aperta
 * («sorella»): servono a rendere osservabile ciò che accade **fuori** dalla
 * transazione, cioè `dopoLaRiconciliazione`.
 */
async function lottoConUnaProposta(importo = 120) {
  const venue = await venueDiTest()
  const fornitore = await fornitoreDiTest()
  const conto = await contoBancario(venue.id)
  const movimento = await rigaBanca(venue.id, conto.id, importo)
  await storiaDiPagamenti(venue.id, fornitore.id)
  const scadenza = await creaScadenza({
    venueId: venue.id,
    tipo: 'passiva',
    importoTotale: importo,
    supplierId: fornitore.id,
    numeroDocumento: 'FT 12',
    controparteNome: 'ROSSI SRL',
    dataScadenza: new Date('2026-08-09'),
  })
  // Aperta, dello stesso fornitore, senza alcuna data attesa: è la scadenza su
  // cui si vedrà passare il ricalcolo delle stime.
  const sorella = await creaScadenza({
    venueId: venue.id,
    tipo: 'passiva',
    importoTotale: 90,
    supplierId: fornitore.id,
    dataScadenza: new Date('2026-09-30'),
  })
  const lotto = await prisma.reconciliationBatch.create({
    data: {
      venueId: venue.id,
      dateFrom: new Date('2026-08-01'),
      dateTo: new Date('2026-08-31'),
      regoleUsate: ['R1'],
      contaProposte: 1,
    },
  })
  const proposta = await prisma.reconciliationProposal.create({
    data: {
      batchId: lotto.id,
      regola: 'R1',
      punteggio: 92,
      fattori: {},
      motivazioni: [],
      bankTransactionId: movimento.id,
      gambe: { create: [{ scheduleId: scadenza.id, importo }] },
    },
  })

  return { venue, fornitore, movimento, scadenza, sorella, lotto, proposta, importo }
}

async function rileggiProposta(id: string) {
  return prisma.reconciliationProposal.findUniqueOrThrow({ where: { id } })
}

async function rileggiRiga(id: string) {
  return prisma.bankTransaction.findUniqueOrThrow({ where: { id } })
}

describe('approvaProposta', () => {
  it('crea il movimento di prima nota dalla riga bancaria e lo riconcilia', async () => {
    const { venue, movimento, scadenza, proposta, importo } = await lottoConUnaProposta()
    const utente = await utenteDiTest()

    const esito = await approvaProposta({
      proposalId: proposta.id,
      venueId: venue.id,
      userId: utente.id,
    })

    expect(esito.outcome).toBe('ok')
    if (esito.outcome !== 'ok') throw new Error(esito.outcome)

    // La scrittura porta la data e l'importo della banca: è la banca la fonte.
    const scrittura = await prisma.journalEntry.findUniqueOrThrow({ where: { id: esito.journalEntryId } })
    expect(scrittura.registerType).toBe('BANK')
    expect(scrittura.entryType).toBe('USCITA')
    expect(scrittura.date.toISOString().slice(0, 10)).toBe('2026-08-10')
    expect(Number(scrittura.creditAmount)).toBe(importo)
    expect(scrittura.debitAmount).toBeNull()

    const rata = await rileggiScadenza(scadenza.id)
    expect(rata.stato).toBe('pagata')
    expect(rata.importoPagatoNum).toBe(importo)

    // Il legame fra le due parti, e la traccia di chi l'ha prodotto.
    const riga = await rileggiRiga(movimento.id)
    expect(riga.matchedEntryId).toBe(esito.journalEntryId)
    expect(riga.status).toBe('MATCHED')
    expect(riga.origineScrittura).toBe('PROPOSTA')
    expect(Number(riga.matchConfidence)).toBe(0.92)

    expect(esito.reconciliationIds).toHaveLength(1)
    const riconciliazione = await prisma.scheduleReconciliation.findUniqueOrThrow({
      where: { id: esito.reconciliationIds[0] },
    })
    expect(riconciliazione.source).toBe('PROPOSAL')
    expect(riconciliazione.journalEntryId).toBe(esito.journalEntryId)
    // La riconciliazione ha generato il pagamento della scadenza (lo scrive
    // `riconciliaInTransazione`, dentro la transazione).
    expect(riconciliazione.paymentId).not.toBeNull()
  })

  it('esegue le code fuori dalla transazione: le stime del fornitore si aggiornano', async () => {
    const { venue, proposta, sorella } = await lottoConUnaProposta()
    const utente = await utenteDiTest()

    // Prima: nessuna data attesa, quindi il previsionale usa la contrattuale.
    const prima = await rileggiScadenza(sorella.id)
    expect(prima.dataAttesa).toBeNull()
    expect(prima.dataAttesaSource).toBeNull()

    await approvaProposta({ proposalId: proposta.id, venueId: venue.id, userId: utente.id })

    // Dopo: il fornitore ha appena saldato un'altra fattura, e le sue scadenze
    // ancora aperte portano la stima del ritardo tipico (dieci giorni, dalla
    // storia costruita nel fixture). A scriverla è `ricalcolaStimeFornitore`,
    // che gira **solo** dentro `dopoLaRiconciliazione`: se il ciclo dei
    // `seguiti` sparisse, questa asserzione sarebbe l'unica ad accorgersene.
    const dopo = await rileggiScadenza(sorella.id)
    expect(dopo.dataAttesaSource).toBe('stima')
    expect(dopo.dataAttesa?.toISOString().slice(0, 10)).toBe('2026-10-10')
  })

  it('la proposta passa a «approvata» e porta chi e quando', async () => {
    const { venue, lotto, proposta } = await lottoConUnaProposta()
    const utente = await utenteDiTest()
    const prima = Date.now()

    await approvaProposta({ proposalId: proposta.id, venueId: venue.id, userId: utente.id })

    const dopo = await rileggiProposta(proposta.id)
    expect(dopo.stato).toBe('approvata')
    expect(dopo.decisoDaId).toBe(utente.id)
    expect(dopo.decisoAt).not.toBeNull()
    expect(dopo.decisoAt!.getTime()).toBeGreaterThanOrEqual(prima - 1000)

    const lottoDopo = await prisma.reconciliationBatch.findUniqueOrThrow({ where: { id: lotto.id } })
    expect(lottoDopo.contaApprovate).toBe(1)
  })

  it('una proposta già decisa non si approva due volte', async () => {
    const { venue, proposta } = await lottoConUnaProposta()
    const utente = await utenteDiTest()

    const primo = await approvaProposta({ proposalId: proposta.id, venueId: venue.id, userId: utente.id })
    expect(primo.outcome).toBe('ok')

    const secondo = await approvaProposta({ proposalId: proposta.id, venueId: venue.id, userId: utente.id })
    expect(secondo).toEqual({ outcome: 'gia_decisa', stato: 'approvata' })

    // Il punto della seconda chiamata: non nasce una seconda scrittura, e la
    // scadenza non risulta pagata due volte.
    expect(await prisma.journalEntry.count({ where: { venueId: venue.id, registerType: 'BANK' } })).toBe(1)
    expect(await prisma.scheduleReconciliation.count({ where: { status: 'VERIFIED' } })).toBe(1)
  })

  it('se la scadenza nel frattempo è stata saldata altrove, la proposta si marca superata e non scrive nulla', async () => {
    const { venue, movimento, scadenza, lotto, proposta, importo } = await lottoConUnaProposta()
    const utente = await utenteDiTest()

    // Qualcuno ha pagato in contanti dallo scadenzario: la proposta è vecchia
    // e non lo sa. Ricontrollarlo qui, dentro la transazione, è ciò che impedisce
    // il doppio pagamento fra la lettura della coda e il clic su «Approva».
    await prisma.schedule.update({
      where: { id: scadenza.id },
      data: { stato: 'pagata', importoPagato: importo },
    })

    const esito = await approvaProposta({ proposalId: proposta.id, venueId: venue.id, userId: utente.id })

    expect(esito.outcome).toBe('superata')
    if (esito.outcome !== 'superata') throw new Error(esito.outcome)
    expect(esito.motivo).toContain('pagata')

    const dopo = await rileggiProposta(proposta.id)
    expect(dopo.stato).toBe('superata')
    expect(dopo.decisoAt).toBeNull()

    expect(await prisma.journalEntry.count({ where: { venueId: venue.id } })).toBe(0)
    const riga = await rileggiRiga(movimento.id)
    expect(riga.matchedEntryId).toBeNull()
    expect(riga.status).toBe('PENDING')

    const lottoDopo = await prisma.reconciliationBatch.findUniqueOrThrow({ where: { id: lotto.id } })
    expect(lottoDopo.contaSuperate).toBe(1)
    expect(lottoDopo.contaApprovate).toBe(0)
  })

  it('il saldo banca si muove esattamente dell\'importo del movimento', async () => {
    const { venue, proposta, importo } = await lottoConUnaProposta()
    const utente = await utenteDiTest()
    const prima = await saldiAlGiorno(venue.id, '2026-12-31')

    await approvaProposta({ proposalId: proposta.id, venueId: venue.id, userId: utente.id })

    // È l'invariante del 15 agosto vista dall'altro capo: qui il denaro c'è
    // davvero — è la banca a dirlo — e la prima nota deve seguirlo.
    const dopo = await saldiAlGiorno(venue.id, '2026-12-31')
    expect(dopo.bankBalance).toBe(prima.bankBalance - importo)
    expect(dopo.cashBalance).toBe(prima.cashBalance)
  })

  it('le altre proposte in attesa sullo stesso movimento diventano superate', async () => {
    const { venue, movimento, lotto, proposta } = await lottoConUnaProposta()
    const utente = await utenteDiTest()
    const altraScadenza = await creaScadenza({ venueId: venue.id, tipo: 'passiva', importoTotale: 120 })
    const rivale = await prisma.reconciliationProposal.create({
      data: {
        batchId: lotto.id,
        regola: 'R1',
        punteggio: 61,
        fattori: {},
        motivazioni: [],
        bankTransactionId: movimento.id,
        gambe: { create: [{ scheduleId: altraScadenza.id, importo: 120 }] },
      },
    })

    await approvaProposta({ proposalId: proposta.id, venueId: venue.id, userId: utente.id })

    // Lo stesso denaro non può saldare due scadenze diverse: la rivale muore
    // qui, e dice per mano di chi (spec madre, «Cosa succede approvando», 5).
    const dopo = await rileggiProposta(rivale.id)
    expect(dopo.stato).toBe('superata')
    expect(dopo.supersededByProposalId).toBe(proposta.id)

    const lottoDopo = await prisma.reconciliationBatch.findUniqueOrThrow({ where: { id: lotto.id } })
    expect(lottoDopo.contaSuperate).toBe(1)
  })

  it('se la promozione rifiuta, la transazione cade per intero', async () => {
    const { venue, movimento, fornitore, lotto } = await lottoConUnaProposta()
    const utente = await utenteDiTest()
    // Gamba da 200 su una riga bancaria da 120: la freschezza non ha nulla da
    // ridire (il residuo della scadenza copre la gamba), è la promozione a
    // fermarsi sul tetto dell'importo della riga.
    const troppoGrande = await creaScadenza({
      venueId: venue.id,
      tipo: 'passiva',
      importoTotale: 200,
      supplierId: fornitore.id,
    })
    const proposta = await prisma.reconciliationProposal.create({
      data: {
        batchId: lotto.id,
        regola: 'R1',
        punteggio: 71,
        fattori: {},
        motivazioni: [],
        bankTransactionId: movimento.id,
        gambe: { create: [{ scheduleId: troppoGrande.id, importo: 200 }] },
      },
    })

    const esito = await approvaProposta({ proposalId: proposta.id, venueId: venue.id, userId: utente.id })

    expect(esito.outcome).toBe('riconciliazione_rifiutata')
    if (esito.outcome !== 'riconciliazione_rifiutata') throw new Error(esito.outcome)
    expect(esito.motivo).toContain('superano il residuo')

    // L'invariante dichiarata in cima al modulo: mai una proposta segnata
    // approvata sopra una scrittura che non esiste. Qui non esiste nulla.
    expect((await rileggiProposta(proposta.id)).stato).toBe('in_attesa')
    expect(await prisma.journalEntry.count({ where: { venueId: venue.id } })).toBe(0)
    expect(await prisma.scheduleReconciliation.count()).toBe(0)
    const riga = await rileggiRiga(movimento.id)
    expect(riga.status).toBe('PENDING')
    expect(riga.matchedEntryId).toBeNull()
    const lottoDopo = await prisma.reconciliationBatch.findUniqueOrThrow({ where: { id: lotto.id } })
    expect(lottoDopo.contaApprovate).toBe(0)
    expect(lottoDopo.contaSuperate).toBe(0)
  })

  it('una proposta R4 conferma la scrittura che indica, senza crearne un\'altra', async () => {
    const { venue, movimento, lotto } = await lottoConUnaProposta()
    const utente = await utenteDiTest()
    // La R4 è banca ↔ prima nota: il movimento contabile esiste già — un
    // versamento, uno stipendio — e approvare significa solo abbinarlo.
    const scrittura = await creaMovimento({ venueId: venue.id, uscita: 120, registerType: 'BANK' })
    const r4 = await prisma.reconciliationProposal.create({
      data: {
        batchId: lotto.id,
        regola: 'R4',
        punteggio: 80,
        fattori: {},
        motivazioni: [],
        bankTransactionId: movimento.id,
        journalEntryId: scrittura.id,
      },
    })

    const esito = await approvaProposta({ proposalId: r4.id, venueId: venue.id, userId: utente.id })

    expect(esito.outcome).toBe('ok')
    if (esito.outcome !== 'ok') throw new Error(esito.outcome)
    expect(esito.journalEntryId).toBe(scrittura.id)
    expect(esito.reconciliationIds).toEqual([])
    expect(await prisma.journalEntry.count({ where: { venueId: venue.id, registerType: 'BANK' } })).toBe(1)

    const riga = await rileggiRiga(movimento.id)
    expect(riga.matchedEntryId).toBe(scrittura.id)
    expect(riga.status).toBe('MATCHED')
    // La scrittura non l'abbiamo creata noi: scollegando la riga non va
    // ritirata, ed è `origineScrittura` a dirlo.
    expect(riga.origineScrittura).toBeNull()
  })

  it('una proposta di giroconto (R5) non è ancora approvabile, e non tocca nulla', async () => {
    const { venue, movimento, lotto } = await lottoConUnaProposta()
    const utente = await utenteDiTest()
    const conto = await contoBancario(venue.id)
    const controparte = await rigaBanca(venue.id, conto.id, -120)
    const giroconto = await prisma.reconciliationProposal.create({
      data: {
        batchId: lotto.id,
        regola: 'R5',
        punteggio: 88,
        fattori: {},
        motivazioni: [],
        bankTransactionId: movimento.id,
        gambe: { create: [{ peerBankTransactionId: controparte.id, importo: 120 }] },
      },
    })

    const esito = await approvaProposta({ proposalId: giroconto.id, venueId: venue.id, userId: utente.id })

    expect(esito.outcome).toBe('riconciliazione_rifiutata')
    if (esito.outcome !== 'riconciliazione_rifiutata') throw new Error(esito.outcome)
    expect(esito.motivo).toContain('R5')

    // Rifiutata, non decisa: resta in coda per quando la R5 arriverà.
    expect((await rileggiProposta(giroconto.id)).stato).toBe('in_attesa')
    expect(await prisma.journalEntry.count({ where: { venueId: venue.id } })).toBe(0)
    expect((await rileggiRiga(movimento.id)).status).toBe('PENDING')
  })

  it('una proposta di un\'altra sede non si trova', async () => {
    const { proposta } = await lottoConUnaProposta()
    const utente = await utenteDiTest()

    const esito = await approvaProposta({
      proposalId: proposta.id,
      venueId: 'sede-di-qualcun-altro',
      userId: utente.id,
    })

    expect(esito).toEqual({ outcome: 'proposta_non_trovata' })
    expect((await rileggiProposta(proposta.id)).stato).toBe('in_attesa')
  })
})

/**
 * Lo scarto di una proposta, su database vero.
 *
 * Spec: docs/superpowers/specs/2026-08-13-riconciliazione-assistita-design.md,
 * «Lo scarto ha due porte». *Salta per ora* segna la proposta e basta; *non
 * propormelo mai più* scrive anche la coppia in `ReconciliationExclusion`, che
 * è ciò che impedisce a un lotto rigenerato di riproporre lo stesso falso
 * positivo.
 */
describe('scartaProposta', () => {
  it('«salta per ora» marca la proposta scartata e non scrive esclusioni', async () => {
    const { venue, lotto, proposta } = await lottoConUnaProposta()
    const utente = await utenteDiTest()
    const prima = Date.now()

    const esito = await scartaProposta({
      proposalId: proposta.id,
      venueId: venue.id,
      userId: utente.id,
      perSempre: false,
    })

    expect(esito).toEqual({ outcome: 'ok' })

    const dopo = await rileggiProposta(proposta.id)
    expect(dopo.stato).toBe('scartata')
    expect(dopo.decisoDaId).toBe(utente.id)
    expect(dopo.decisoAt).not.toBeNull()
    expect(dopo.decisoAt!.getTime()).toBeGreaterThanOrEqual(prima - 1000)

    const lottoDopo = await prisma.reconciliationBatch.findUniqueOrThrow({ where: { id: lotto.id } })
    expect(lottoDopo.contaScartate).toBe(1)

    // «Salta per ora»: non è la seconda porta, e non deve lasciare traccia in
    // ReconciliationExclusion.
    expect(await prisma.reconciliationExclusion.count({ where: { venueId: venue.id } })).toBe(0)
  })

  it('«non propormelo mai più» scrive anche la coppia in ReconciliationExclusion', async () => {
    const { venue, movimento, scadenza, proposta } = await lottoConUnaProposta()
    const utente = await utenteDiTest()

    const esito = await scartaProposta({
      proposalId: proposta.id,
      venueId: venue.id,
      userId: utente.id,
      perSempre: true,
      motivo: 'Non è mai questo fornitore su questo conto',
    })

    expect(esito).toEqual({ outcome: 'ok' })

    const dopo = await rileggiProposta(proposta.id)
    expect(dopo.stato).toBe('scartata')

    const esclusioni = await prisma.reconciliationExclusion.findMany({ where: { venueId: venue.id } })
    expect(esclusioni).toHaveLength(1)
    expect(esclusioni[0].bankTransactionId).toBe(movimento.id)
    expect(esclusioni[0].scheduleId).toBe(scadenza.id)
    expect(esclusioni[0].motivo).toBe('Non è mai questo fornitore su questo conto')
    expect(esclusioni[0].createdById).toBe(utente.id)
  })

  it('la coppia esclusa non ricompare in un lotto rigenerato', async () => {
    // Senza questo, ogni rilancio ripropone gli stessi falsi positivi ed è il
    // motivo per cui la seconda porta esiste. A differenza degli altri test di
    // questo file, qui la proposta nasce da `generaLotto` per davvero — è
    // l'unico modo di provare che il motore la rilegge, non solo che
    // `scartaProposta` scrive la riga giusta.
    const venue = await venueDiTest()
    const fornitore = await fornitoreDiTest()
    const conto = await contoBancario(venue.id)
    const movimento = await rigaBanca(venue.id, conto.id, 120)
    await creaScadenza({
      venueId: venue.id,
      tipo: 'passiva',
      importoTotale: 120,
      supplierId: fornitore.id,
      numeroDocumento: 'FT 12',
      controparteNome: 'ROSSI SRL',
      dataScadenza: new Date('2026-08-09'),
    })
    const utente = await utenteDiTest()
    const periodo = { dateFrom: new Date('2026-08-01'), dateTo: new Date('2026-08-31') }

    const primoLotto = await generaLotto({ venueId: venue.id, regole: ['R1', 'R2', 'R3'], userId: null, ...periodo })
    expect(primoLotto.contaProposte).toBe(1)
    const [propostaGenerata] = await prisma.reconciliationProposal.findMany({
      where: { batchId: primoLotto.batchId },
    })

    const esito = await scartaProposta({
      proposalId: propostaGenerata.id,
      venueId: venue.id,
      userId: utente.id,
      perSempre: true,
    })
    expect(esito).toEqual({ outcome: 'ok' })

    const secondoLotto = await generaLotto({ venueId: venue.id, regole: ['R1', 'R2', 'R3'], userId: null, ...periodo })

    expect(secondoLotto.contaProposte).toBe(0)
    expect(
      await prisma.reconciliationProposal.count({
        where: { batchId: secondoLotto.batchId, bankTransactionId: movimento.id },
      })
    ).toBe(0)
  })

  it('un\'esclusione identica già scritta non fa fallire lo scarto, e non duplica la riga', async () => {
    // Non esiste un vincolo di unicità su `reconciliation_exclusions`
    // (schema, `@@index` non `@@unique`): l'idempotenza la garantisce il
    // servizio, verificando prima di scrivere.
    const { venue, movimento, scadenza, proposta } = await lottoConUnaProposta()
    const utente = await utenteDiTest()
    await prisma.reconciliationExclusion.create({
      data: { venueId: venue.id, bankTransactionId: movimento.id, scheduleId: scadenza.id, createdById: utente.id },
    })

    const esito = await scartaProposta({
      proposalId: proposta.id,
      venueId: venue.id,
      userId: utente.id,
      perSempre: true,
    })

    expect(esito).toEqual({ outcome: 'ok' })
    expect(
      await prisma.reconciliationExclusion.count({
        where: { venueId: venue.id, bankTransactionId: movimento.id, scheduleId: scadenza.id },
      })
    ).toBe(1)
  })

  it('una proposta già decisa non si scarta due volte', async () => {
    const { venue, proposta } = await lottoConUnaProposta()
    const utente = await utenteDiTest()

    const primo = await scartaProposta({
      proposalId: proposta.id,
      venueId: venue.id,
      userId: utente.id,
      perSempre: false,
    })
    expect(primo).toEqual({ outcome: 'ok' })

    const secondo = await scartaProposta({
      proposalId: proposta.id,
      venueId: venue.id,
      userId: utente.id,
      perSempre: false,
    })
    expect(secondo).toEqual({ outcome: 'gia_decisa', stato: 'scartata' })

    const lottoDopo = await prisma.reconciliationBatch.findUniqueOrThrow({ where: { id: (await rileggiProposta(proposta.id)).batchId } })
    // La seconda chiamata non deve incrementare di nuovo il contatore.
    expect(lottoDopo.contaScartate).toBe(1)
  })

  it('una proposta di un\'altra sede non si trova', async () => {
    const { proposta } = await lottoConUnaProposta()
    const utente = await utenteDiTest()

    const esito = await scartaProposta({
      proposalId: proposta.id,
      venueId: 'sede-di-qualcun-altro',
      userId: utente.id,
      perSempre: false,
    })

    expect(esito).toEqual({ outcome: 'proposta_non_trovata' })
    expect((await rileggiProposta(proposta.id)).stato).toBe('in_attesa')
  })
})

import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/prisma'
import { romeDateKey, toDateOnlyUtc } from '@/lib/timezone'
import { saldiAlGiorno, giornoCorrente } from '@/lib/saldi'
import { setupIntegrationDb } from '@/test/integration/db'
import { loginAs } from '@/test/integration/auth-mock'
import { jsonRequest, callRoute } from '@/test/integration/api'
import { venueDiTest } from '@/test/integration/fixtures/closures'
import { creaScadenza } from '@/test/integration/fixtures/scadenzario'
import { POST as creaMovimento } from '../route'
import { DELETE as cancellaMovimento } from '../[id]/route'

/**
 * Un trasferimento non crea né distrugge denaro.
 *
 * Versamento, prelievo e giroconto spostano contante fra la cassa e la banca:
 * il denaro cambia posto, il totale resta quello di prima. In partita doppia
 * sono quindi due righe — l'uscita da un registro e l'entrata nell'altro — e
 * scriverne una sola muove la liquidità complessiva dell'intero importo.
 *
 * Il registro manuale ne scriveva una sola. La chiusura di cassa, che genera i
 * versamenti per la via automatica, le ha sempre scritte entrambe: il difetto
 * viveva solo qui, dove il registro si compila a mano.
 *
 * I saldi si leggono da `@/lib/saldi`, la sola definizione di "quanti soldi
 * abbiamo": ricalcolarli qui sommando le righe verificherebbe l'aritmetica del
 * test, non quella dell'applicazione.
 */
setupIntegrationDb()

const ANNO = Number(romeDateKey(new Date()).slice(0, 4))
const OGGI = giornoCorrente()

const CASSA_INIZIALE = 1000
const BANCA_INIZIALE = 5000
const LIQUIDITA_INIZIALE = 6000

const IMPORTO = 500

async function statoDiPartenza() {
  const venue = await venueDiTest()

  await prisma.initialBalance.create({
    data: {
      venueId: venue.id,
      year: ANNO,
      cashBalance: CASSA_INIZIALE,
      bankBalance: BANCA_INIZIALE,
    },
  })

  return venue
}

interface CorpoMovimento {
  registerType?: string
  entryType: string
  counterRegisterType?: string
  amount?: number
  description?: string
}

async function registra(corpo: CorpoMovimento) {
  return callRoute<{ error?: string }>(
    creaMovimento,
    jsonRequest('/api/prima-nota', {
      method: 'POST',
      body: {
        date: toDateOnlyUtc(OGGI).toISOString(),
        amount: IMPORTO,
        description: 'Movimento registrato a mano',
        ...corpo,
      },
    })
  )
}

/**
 * Le righe scritte in prima nota. Non si ordinano per registro: `registerType`
 * è un enum di Postgres e l'ordinamento segue l'ordine di dichiarazione, non
 * l'alfabeto. Chi cerca un registro preciso usa `rigaDi`.
 */
async function righeScritte(venueId: string) {
  return prisma.journalEntry.findMany({
    where: { venueId },
    select: {
      registerType: true,
      debitAmount: true,
      creditAmount: true,
      description: true,
    },
  })
}

async function rigaDi(venueId: string, registerType: 'CASH' | 'BANK') {
  const righe = await righeScritte(venueId)
  const riga = righe.find((r) => r.registerType === registerType)
  if (!riga) {
    throw new Error(
      `Nessuna riga sul registro ${registerType}: ne sono state scritte ${righe.length}.`
    )
  }
  return riga
}

describe('POST /api/prima-nota, movimenti che trasferiscono denaro', () => {
  it('un versamento di 500 € svuota la cassa e riempie la banca senza toccare il totale', async () => {
    await loginAs('admin')
    const venue = await statoDiPartenza()

    const prima = await saldiAlGiorno(venue.id, OGGI)
    expect(prima.cashBalance).toBe(CASSA_INIZIALE)
    expect(prima.bankBalance).toBe(BANCA_INIZIALE)
    expect(prima.totalAvailable).toBe(LIQUIDITA_INIZIALE)

    const risposta = await registra({ registerType: 'CASH', entryType: 'VERSAMENTO' })
    expect(risposta.status).toBe(201)

    const dopo = await saldiAlGiorno(venue.id, OGGI)
    expect(dopo.cashBalance).toBe(CASSA_INIZIALE - IMPORTO)
    expect(dopo.bankBalance).toBe(BANCA_INIZIALE + IMPORTO)
    expect(dopo.totalAvailable).toBe(LIQUIDITA_INIZIALE)
  })

  it('il versamento scrive due righe: avere in cassa e dare in banca', async () => {
    await loginAs('admin')
    const venue = await statoDiPartenza()

    await registra({ registerType: 'CASH', entryType: 'VERSAMENTO' })

    expect(await righeScritte(venue.id)).toHaveLength(2)

    const cassa = await rigaDi(venue.id, 'CASH')
    expect(Number(cassa.creditAmount)).toBe(IMPORTO)
    expect(cassa.debitAmount).toBeNull()

    const banca = await rigaDi(venue.id, 'BANK')
    expect(Number(banca.debitAmount)).toBe(IMPORTO)
    expect(banca.creditAmount).toBeNull()
  })

  // Il versamento va dalla cassa alla banca per definizione. Se il client manda
  // il registro sbagliato la direzione resta quella giusta: sono i due lati di
  // un'operazione sola, non una scelta dell'utente.
  it('il versamento va dalla cassa alla banca anche se il client dichiara BANK', async () => {
    await loginAs('admin')
    const venue = await statoDiPartenza()

    const risposta = await registra({ registerType: 'BANK', entryType: 'VERSAMENTO' })
    expect(risposta.status).toBe(201)

    const dopo = await saldiAlGiorno(venue.id, OGGI)
    expect(dopo.cashBalance).toBe(CASSA_INIZIALE - IMPORTO)
    expect(dopo.bankBalance).toBe(BANCA_INIZIALE + IMPORTO)
    expect(dopo.totalAvailable).toBe(LIQUIDITA_INIZIALE)
  })

  it('un prelievo di 500 € svuota la banca e riempie la cassa senza toccare il totale', async () => {
    await loginAs('admin')
    const venue = await statoDiPartenza()

    const risposta = await registra({ registerType: 'BANK', entryType: 'PRELIEVO' })
    expect(risposta.status).toBe(201)

    const dopo = await saldiAlGiorno(venue.id, OGGI)
    expect(dopo.cashBalance).toBe(CASSA_INIZIALE + IMPORTO)
    expect(dopo.bankBalance).toBe(BANCA_INIZIALE - IMPORTO)
    expect(dopo.totalAvailable).toBe(LIQUIDITA_INIZIALE)
    expect(await righeScritte(venue.id)).toHaveLength(2)
  })

  // Il giroconto non ha una direzione implicita nel nome: chi lo registra deve
  // dire da dove a dove. Senza destinazione la richiesta va rifiutata, non
  // indovinata: la riga sola che ne usciva faceva comparire denaro dal nulla.
  it('un giroconto senza registro di destinazione viene rifiutato', async () => {
    await loginAs('admin')
    const venue = await statoDiPartenza()

    const risposta = await registra({ registerType: 'CASH', entryType: 'GIROCONTO' })
    expect(risposta.status).toBe(400)

    expect(await righeScritte(venue.id)).toHaveLength(0)
    expect((await saldiAlGiorno(venue.id, OGGI)).totalAvailable).toBe(LIQUIDITA_INIZIALE)
  })

  it('un giroconto verso lo stesso registro di partenza viene rifiutato', async () => {
    await loginAs('admin')
    const venue = await statoDiPartenza()

    const risposta = await registra({
      registerType: 'CASH',
      entryType: 'GIROCONTO',
      counterRegisterType: 'CASH',
    })
    expect(risposta.status).toBe(400)

    expect(await righeScritte(venue.id)).toHaveLength(0)
  })

  it('un giroconto da banca a cassa sposta il denaro senza toccare il totale', async () => {
    await loginAs('admin')
    const venue = await statoDiPartenza()

    const risposta = await registra({
      registerType: 'BANK',
      entryType: 'GIROCONTO',
      counterRegisterType: 'CASH',
    })
    expect(risposta.status).toBe(201)

    const dopo = await saldiAlGiorno(venue.id, OGGI)
    expect(dopo.cashBalance).toBe(CASSA_INIZIALE + IMPORTO)
    expect(dopo.bankBalance).toBe(BANCA_INIZIALE - IMPORTO)
    expect(dopo.totalAvailable).toBe(LIQUIDITA_INIZIALE)
    expect(await righeScritte(venue.id)).toHaveLength(2)
  })
})

/**
 * Cancellare un trasferimento è cancellare un'operazione sola.
 *
 * Le due righe si registrano insieme e vanno via insieme: eliminarne una
 * lascerebbe il denaro uscito da un registro senza essere entrato nell'altro,
 * cioè lo stesso sbilanciamento chiuso qui sopra, raggiunto da un'altra porta.
 */
describe('DELETE /api/prima-nota/[id], un lato di un trasferimento', () => {
  async function versamentoRegistrato(venueId: string) {
    const risposta = await registra({ registerType: 'CASH', entryType: 'VERSAMENTO' })
    expect(risposta.status).toBe(201)

    const righe = await prisma.journalEntry.findMany({
      where: { venueId },
      select: { id: true, registerType: true },
    })
    expect(righe).toHaveLength(2)

    return righe
  }

  async function cancella(id: string) {
    return callRoute<{ error?: string }>(
      cancellaMovimento,
      jsonRequest(`/api/prima-nota/${id}`, { method: 'DELETE' }),
      { id }
    )
  }

  it.each(['CASH', 'BANK'] as const)(
    'cancellare la riga di %s porta via anche l\'altra e lascia il totale fermo',
    async (registro) => {
      await loginAs('admin')
      const venue = await statoDiPartenza()
      const righe = await versamentoRegistrato(venue.id)
      const daCancellare = righe.find((r) => r.registerType === registro)!

      const esito = await cancella(daCancellare.id)
      expect(esito.status).toBe(200)

      const dopo = await saldiAlGiorno(venue.id, OGGI)
      expect(dopo.cashBalance).toBe(CASSA_INIZIALE)
      expect(dopo.bankBalance).toBe(BANCA_INIZIALE)
      expect(dopo.totalAvailable).toBe(LIQUIDITA_INIZIALE)
    }
  )

  // La cancellazione è logica: le scritture contabili restano tracciabili.
  it('entrambe le righe restano nel database, marcate come cancellate', async () => {
    await loginAs('admin')
    const venue = await statoDiPartenza()
    const righe = await versamentoRegistrato(venue.id)

    await cancella(righe[0].id)

    const cancellate = await prisma.journalEntry.count({
      where: { venueId: venue.id, deletedAt: { not: null } },
    })
    expect(cancellate).toBe(2)
  })

  // Il blocco vale per l'operazione intera: se è l'altra riga a essere agganciata
  // a una scadenza, cancellare questa se la porterebbe via lo stesso.
  it('non si cancella se è l\'altra riga a essere riconciliata con una scadenza', async () => {
    const sessione = await loginAs('admin')
    const venue = await statoDiPartenza()
    const righe = await versamentoRegistrato(venue.id)
    const banca = righe.find((r) => r.registerType === 'BANK')!
    const cassa = righe.find((r) => r.registerType === 'CASH')!

    const scadenza = await creaScadenza({
      venueId: venue.id,
      importoTotale: IMPORTO,
      dataScadenza: toDateOnlyUtc(OGGI),
      descrizione: 'Scadenza abbinata alla riga di banca',
    })

    await prisma.scheduleReconciliation.create({
      data: {
        scheduleId: scadenza.id,
        journalEntryId: banca.id,
        amount: IMPORTO,
        status: 'VERIFIED',
        createdById: sessione.user.id,
      },
    })

    const esito = await cancella(cassa.id)
    expect(esito.status).toBe(409)

    expect(
      await prisma.journalEntry.count({ where: { venueId: venue.id, deletedAt: null } })
    ).toBe(2)
    expect((await saldiAlGiorno(venue.id, OGGI)).totalAvailable).toBe(LIQUIDITA_INIZIALE)
  })

  it('un movimento a riga singola si cancella da solo, senza portarsi dietro nulla', async () => {
    await loginAs('admin')
    const venue = await statoDiPartenza()

    await registra({ registerType: 'CASH', entryType: 'INCASSO' })
    const incasso = await prisma.journalEntry.findFirstOrThrow({
      where: { venueId: venue.id },
      select: { id: true },
    })

    const esito = await cancella(incasso.id)
    expect(esito.status).toBe(200)

    expect((await saldiAlGiorno(venue.id, OGGI)).totalAvailable).toBe(LIQUIDITA_INIZIALE)
  })
})

describe('POST /api/prima-nota, movimenti che entrano ed escono davvero', () => {
  it('un incasso in cassa resta una riga sola e alza la liquidità', async () => {
    await loginAs('admin')
    const venue = await statoDiPartenza()

    const risposta = await registra({ registerType: 'CASH', entryType: 'INCASSO' })
    expect(risposta.status).toBe(201)

    const dopo = await saldiAlGiorno(venue.id, OGGI)
    expect(dopo.cashBalance).toBe(CASSA_INIZIALE + IMPORTO)
    expect(dopo.bankBalance).toBe(BANCA_INIZIALE)
    expect(dopo.totalAvailable).toBe(LIQUIDITA_INIZIALE + IMPORTO)
    expect(await righeScritte(venue.id)).toHaveLength(1)
  })

  it('una uscita dalla banca resta una riga sola e abbassa la liquidità', async () => {
    await loginAs('admin')
    const venue = await statoDiPartenza()

    const risposta = await registra({ registerType: 'BANK', entryType: 'USCITA' })
    expect(risposta.status).toBe(201)

    const dopo = await saldiAlGiorno(venue.id, OGGI)
    expect(dopo.cashBalance).toBe(CASSA_INIZIALE)
    expect(dopo.bankBalance).toBe(BANCA_INIZIALE - IMPORTO)
    expect(dopo.totalAvailable).toBe(LIQUIDITA_INIZIALE - IMPORTO)
    expect(await righeScritte(venue.id)).toHaveLength(1)
  })
})

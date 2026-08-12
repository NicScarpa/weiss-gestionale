import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/prisma'
import { toDateOnlyUtc } from '@/lib/timezone'
import { giornoCorrente } from '@/lib/saldi'
import { setupIntegrationDb } from '@/test/integration/db'
import { entraCome } from '@/test/integration/auth-mock'
import { jsonRequest, callRoute } from '@/test/integration/api'
import { venueDiTest, centroDiCostoDiDefault } from '@/test/integration/fixtures/closures'
import { creaScadenza, creaRicorrenza } from '@/test/integration/fixtures/scadenzario'
import { GET as getForecast } from '@/app/api/dashboard/forecast/route'
import { GET as getSaldoScalare } from '@/app/api/scadenzario/saldo-scalare/route'
import { GET as getProjection } from '@/app/api/cashflow/projection/route'

/**
 * Le tre proiezioni di cassa rispondono alla stessa domanda con lo stesso
 * numero.
 *
 * Era «il rischio maggiore» dichiarato dal piano dell'onda 1: `/dashboard/forecast`,
 * `/scadenzario/saldo-scalare` e `/cashflow/projection` proiettavano il saldo
 * futuro da tre basi diverse — spese ricorrenti, scadenze, movimenti — e sulla
 * stessa finestra davano tre numeri diversi. Ora leggono tutte da
 * `serieProiettata`/`leggiFlussi`, e questo test è la rete che impedisce alle
 * tre di riprendere strade separate.
 *
 * ## Perché non basta confrontarle fra loro
 *
 * L'asserzione «A = B = C» da sola è debole, e vale la pena dire perché: le tre
 * rotte leggono la stessa funzione, quindi un difetto *dentro* quella funzione
 * — per esempio la deduplica che smette di funzionare — sposta tutte e tre
 * insieme. Resterebbero uguali fra loro, e sbagliate all'unisono.
 *
 * Per questo il test fissa anche il **valore atteso**, calcolato a mano dai
 * dati seminati qui sotto. È quella seconda asserzione a cogliere il doppio
 * conteggio, ed è costruita per poter fallire: fra i dati ci sono le due
 * gemelle «Affitto», una `Recurrence` e una `RecurringExpense` con lo stesso
 * nome, lo stesso importo e la stessa frequenza — i due modelli disgiunti che
 * erano la causa originale della divergenza. Se l'euristica di soppressione si
 * rompe, l'affitto viene contato due volte e il saldo finale scende di 1.200.
 *
 * ## Perché le tre finestre non sono identiche
 *
 * Non possono esserlo, e non è un difetto: `/dashboard/forecast` parte sempre
 * da **domani** (il saldo di partenza è quello di oggi, che i movimenti di oggi
 * li contiene già), mentre `saldo-scalare` accetta un'ancora che non può
 * superare oggi (`da` è limitato a [-365, 0]). Le tre finestre condividono
 * quindi il giorno finale ma non il primo. I dati sono seminati in modo che
 * nessun flusso cada **oggi**: così le tre finestre contengono esattamente gli
 * stessi flussi e i saldi finali devono coincidere. Un flusso datato oggi
 * entrerebbe legittimamente in due curve su tre, e la divergenza sarebbe
 * corretta invece che rivelatrice.
 */
setupIntegrationDb()

const OGGI = giornoCorrente()
const ANNO = Number(OGGI.slice(0, 4))

/** Giorno civile a `n` giorni da oggi, in avanti se positivo. */
function giorno(n: number): string {
  const data = toDateOnlyUtc(OGGI)
  data.setUTCDate(data.getUTCDate() + n)
  return data.toISOString().slice(0, 10)
}

/**
 * La finestra di prova. 25 giorni: abbastanza da contenere l'unica occorrenza
 * mensile dell'affitto, non tanto da contenerne una seconda.
 */
const ORIZZONTE = 25

const SALDO_APERTURA = 10_000
const USCITA_GIA_REGISTRATA = 500
const SCADENZA_PASSIVA = 800
const SCADENZA_ATTIVA = 500
const AFFITTO = 1_200

/**
 * Il saldo che tutte e tre devono dare all'ultimo giorno della finestra.
 *
 * 10.000 di apertura − 500 già usciti (movimento nel passato, dentro il saldo
 * reale ma fuori da ogni finestra) − 800 di scadenza passiva + 500 di scadenza
 * attiva − 1.200 di affitto **contato una volta sola**.
 */
const SALDO_ATTESO = SALDO_APERTURA - USCITA_GIA_REGISTRATA - SCADENZA_PASSIVA + SCADENZA_ATTIVA - AFFITTO

/** Quanto darebbe se le due gemelle «Affitto» tornassero a contare entrambe. */
const SALDO_COL_DOPPIO_CONTEGGIO = SALDO_ATTESO - AFFITTO

async function seminaScenario() {
  const venue = await venueDiTest()
  const autore = await prisma.user.findFirstOrThrow({ where: { role: { name: 'admin' } } })

  await prisma.initialBalance.create({
    data: { venueId: venue.id, year: ANNO, cashBalance: 0, bankBalance: SALDO_APERTURA },
  })

  // Movimento reale, nel passato: sta dentro `saldiAlGiorno` ma fuori da tutte
  // e tre le finestre. Serve a che il saldo di partenza non sia il solo
  // `InitialBalance` — le tre rotte lo derivano in due modi diversi (forecast
  // dal saldo di oggi, le altre due all'indietro dal saldo di fine finestra) e
  // un'apertura fatta di sole costanti non distinguerebbe i due percorsi.
  await prisma.journalEntry.create({
    data: {
      venueId: venue.id,
      date: toDateOnlyUtc(giorno(-5)),
      registerType: 'BANK',
      description: 'Uscita gia registrata',
      creditAmount: USCITA_GIA_REGISTRATA,
      costCenterId: await centroDiCostoDiDefault(),
    },
  })

  await creaScadenza({
    venueId: venue.id,
    tipo: 'passiva',
    stato: 'aperta',
    descrizione: 'Fornitore da pagare',
    importoTotale: SCADENZA_PASSIVA,
    dataScadenza: toDateOnlyUtc(giorno(10)),
  })

  await creaScadenza({
    venueId: venue.id,
    tipo: 'attiva',
    stato: 'aperta',
    descrizione: 'Cliente da incassare',
    importoTotale: SCADENZA_ATTIVA,
    dataScadenza: toDateOnlyUtc(giorno(15)),
  })

  // Le due gemelle, a 20 giorni da oggi. Stesso nome, stesso importo, stessa
  // frequenza: sono la condizione esatta dell'euristica di soppressione in
  // `leggiFlussi`. La `Recurrence` vince e la `RecurringExpense` non viene
  // emessa affatto.
  const giornoAffitto = giorno(20)
  const numeroDelMese = Number(giornoAffitto.slice(8, 10))

  await creaRicorrenza({
    venueId: venue.id,
    tipo: 'passiva',
    descrizione: 'Affitto',
    importo: AFFITTO,
    frequenza: 'mensile',
    giornoDelMese: numeroDelMese,
    dataInizio: toDateOnlyUtc(giorno(-30)),
    prossimaGenerazione: toDateOnlyUtc(giornoAffitto),
    isActive: true,
  })

  await prisma.recurringExpense.create({
    data: {
      venueId: venue.id,
      name: 'Affitto',
      amount: AFFITTO,
      frequency: 'MONTHLY',
      dayOfMonth: numeroDelMese,
      startDate: toDateOnlyUtc(giorno(-30)),
      isActive: true,
      createdBy: autore.id,
    },
  })

  return venue
}

interface RispostaForecast {
  forecast: Array<{ date: string; projectedBalance: number }>
}

/** Ultimo punto della curva del cruscotto. Finestra: [oggi+1, oggi+ORIZZONTE]. */
async function saldoFinaleForecast(): Promise<number> {
  const risposta = await callRoute<RispostaForecast>(
    getForecast,
    jsonRequest('/api/dashboard/forecast', { searchParams: { days: String(ORIZZONTE) } })
  )

  expect(risposta.status).toBe(200)
  const ultimo = risposta.body.forecast.at(-1)
  expect(ultimo?.date).toBe(giorno(ORIZZONTE))
  return ultimo!.projectedBalance
}

/** `saldoFinale` dichiarato dallo scadenzario. Finestra: [oggi, oggi+ORIZZONTE]. */
async function saldoFinaleScadenzario(): Promise<number> {
  const risposta = await callRoute<{ saldoFinale: number }>(
    getSaldoScalare,
    jsonRequest('/api/scadenzario/saldo-scalare', {
      searchParams: { da: '0', range: String(ORIZZONTE) },
    })
  )

  expect(risposta.status).toBe(200)
  return risposta.body.saldoFinale
}

/**
 * Ultimo punto della curva del cash flow. Finestra: [oggi+1, oggi+ORIZZONTE].
 *
 * Questa rotta serve una curva **sparsa**: tiene solo i giorni con almeno un
 * flusso (`route.ts:85`), mentre le altre due sono dense. È un contratto
 * preesistente, fissato da un suo test, e non va confuso con una divergenza
 * del previsionale: l'ultimo punto servito è l'ultimo giorno in cui *succede*
 * qualcosa, e da lì a fine finestra il saldo resta piatto per costruzione.
 * Quindi il saldo dell'ultimo punto sparso È il saldo di fine finestra —
 * asserire che la data sia `giorno(ORIZZONTE)` pretenderebbe invece un punto
 * che la rotta non ha mai promesso di servire.
 */
async function saldoFinaleCashFlow(): Promise<number> {
  const risposta = await callRoute<Array<{ data: string; saldo: number }>>(
    getProjection,
    jsonRequest('/api/cashflow/projection', {
      searchParams: { from: giorno(1), days: String(ORIZZONTE - 1) },
    })
  )

  expect(risposta.status).toBe(200)
  const ultimo = risposta.body.at(-1)
  expect(ultimo).toBeDefined()
  // La curva è sparsa ma resta dentro la finestra concordata, e il suo ultimo
  // punto è il giorno dell'affitto: l'ultima cosa che succede nella finestra.
  expect(ultimo!.data <= giorno(ORIZZONTE)).toBe(true)
  expect(ultimo!.data).toBe(giorno(20))
  return ultimo!.saldo
}

describe('le tre proiezioni di cassa', () => {
  it('danno lo stesso saldo finale sulla stessa finestra, e conta l uscita ricorrente una volta sola', async () => {
    await entraCome('admin')
    await seminaScenario()

    const [cruscotto, scadenzario, cashFlow] = await Promise.all([
      saldoFinaleForecast(),
      saldoFinaleScadenzario(),
      saldoFinaleCashFlow(),
    ])

    // 1. Le tre coincidono: nessuna ha ripreso una base propria.
    expect(scadenzario).toBe(cruscotto)
    expect(cashFlow).toBe(cruscotto)

    // 2. E il numero su cui coincidono è quello giusto. Senza questa seconda
    //    asserzione un doppio conteggio dentro la fonte comune passerebbe
    //    inosservato, perché sposterebbe tutte e tre insieme.
    expect(cruscotto).toBe(SALDO_ATTESO)

    // Guardia esplicita sul difetto originale, per chi legge il rosso: se
    // questo test fallisce con SALDO_COL_DOPPIO_CONTEGGIO, l'euristica di
    // soppressione fra `Recurrence` e `RecurringExpense` ha smesso di agganciare.
    expect(cruscotto).not.toBe(SALDO_COL_DOPPIO_CONTEGGIO)
  })

  it('la soppressione dell affitto e attiva, non fortuita: senza la ricorrenza la spesa emette il suo flusso', async () => {
    await entraCome('admin')
    const venue = await seminaScenario()

    // Tolta la `Recurrence`, la `RecurringExpense` non ha più nulla che la
    // sopprima e deve tornare a pesare: è la prova che il flusso esisteva ed
    // era soppresso, non che non fosse mai stato generato.
    await prisma.recurrence.deleteMany({ where: { venueId: venue.id } })

    const cruscotto = await saldoFinaleForecast()

    expect(cruscotto).toBe(SALDO_ATTESO)
  })
})

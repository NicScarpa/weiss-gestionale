import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { toDateOnlyUtc } from '@/lib/timezone'
import { giornoCorrente, giornoIndietro } from '@/lib/saldi'
import { setupIntegrationDb } from '@/test/integration/db'
import { loginAs } from '@/test/integration/auth-mock'
import { creaScadenza, creaRicorrenza, creaMovimento } from '@/test/integration/fixtures/scadenzario'
import { getVenueId } from '@/lib/venue'
import { leggiFlussi, serieProiettata } from '../leggi'

/**
 * Il test che conta è l'ultimo: la scadenza generata da una ricorrenza e la
 * ricorrenza stessa non devono produrre due flussi per lo stesso giorno.
 */
setupIntegrationDb()

beforeEach(async () => {
  await loginAs('admin')
})

describe('leggiFlussi', () => {
  it('legge le scadenze aperte come flussi con segno corretto', async () => {
    const venueId = await getVenueId()
    await creaScadenza({
      importoTotale: 300,
      tipo: 'passiva',
      dataScadenza: new Date('2026-09-10'),
    })

    const flussi = await leggiFlussi(venueId, '2026-09-01', '2026-09-30')
    const scadenze = flussi.filter((f) => f.fonte === 'scadenza')

    expect(scadenze).toHaveLength(1)
    expect(scadenze[0].importo).toBe(-300)
    expect(scadenze[0].giorno).toBe('2026-09-10')
  })

  it('usa la data attesa quando diverge dalla contrattuale', async () => {
    const venueId = await getVenueId()
    await creaScadenza({
      importoTotale: 300,
      tipo: 'passiva',
      dataScadenza: new Date('2026-09-10'),
      dataAttesa: new Date('2026-09-20'),
    })

    const flussi = await leggiFlussi(venueId, '2026-09-01', '2026-09-30')

    expect(flussi.find((f) => f.fonte === 'scadenza')?.giorno).toBe('2026-09-20')
  })

  it('la scadenza da ricorrenza porta la chiave della ricorrenza', async () => {
    const venueId = await getVenueId()
    const ricorrenza = await creaRicorrenza({ importo: 800, tipo: 'passiva' })
    await creaScadenza({
      importoTotale: 800,
      tipo: 'passiva',
      dataScadenza: new Date('2026-09-10'),
      recurrenceId: ricorrenza.id,
    })

    const flussi = await leggiFlussi(venueId, '2026-09-01', '2026-09-30')
    const scadenza = flussi.find((f) => f.fonte === 'scadenza')

    expect(scadenza?.chiave).toBe(`ricorrenza:${ricorrenza.id}`)
  })

  it('la scadenza generata batte la ricorrente sullo stesso giorno', async () => {
    const venueId = await getVenueId()
    const ricorrenza = await creaRicorrenza({
      importo: 800,
      tipo: 'passiva',
      giornoDelMese: 10,
    })
    await creaScadenza({
      importoTotale: 800,
      tipo: 'passiva',
      dataScadenza: new Date('2026-09-10'),
      recurrenceId: ricorrenza.id,
    })

    const flussi = await leggiFlussi(venueId, '2026-09-01', '2026-09-30')
    const del10 = flussi.filter((f) => f.giorno === '2026-09-10')

    // Entrambi i flussi esistono con la stessa chiave: sarà `proietta` a
    // scartarne uno. Qui si verifica che la chiave li leghi.
    const chiavi = new Set(del10.map((f) => f.chiave))
    expect(chiavi.size).toBe(1)
    expect([...chiavi][0]).toBe(`ricorrenza:${ricorrenza.id}`)
  })

  // Questo è il test che dà senso all'intero task: una `RecurringExpense` e
  // una `Recurrence` sono due modelli disgiunti dello stesso concetto, e
  // l'euristica (nome normalizzato + importo) le aggancia. Se entrambe
  // emettessero un'occorrenza sullo stesso giorno — stessa chiave, stessa
  // fonte `ricorrente` — `proietta` non le deduplicherebbe (due flussi della
  // stessa fonte non si escludono mai a vicenda, per costruzione): l'uscita
  // verrebbe contata due volte, esattamente il difetto che il modulo esiste
  // per chiudere.
  it('la spesa ricorrente agganciata per euristica a una ricorrenza attiva non emette una propria occorrenza', async () => {
    const venueId = await getVenueId()
    const sessione = await loginAs('admin')

    const ricorrenza = await creaRicorrenza({
      descrizione: 'Canone software',
      importo: 90,
      tipo: 'passiva',
      giornoDelMese: 12,
    })

    await prisma.recurringExpense.create({
      data: {
        venueId,
        name: 'Canone software',
        amount: 90,
        frequency: 'MONTHLY',
        dayOfMonth: 12,
        createdBy: sessione.user.id,
      },
    })

    const flussi = await leggiFlussi(venueId, '2026-09-01', '2026-09-30')
    const delGiorno12 = flussi.filter((f) => f.giorno === '2026-09-12' && f.fonte === 'ricorrente')

    // Un solo flusso: quello della `Recurrence`, la fonte autorevole. La
    // `RecurringExpense` agganciata non ne produce uno proprio.
    expect(delGiorno12).toHaveLength(1)
    expect(delGiorno12[0].chiave).toBe(`ricorrenza:${ricorrenza.id}`)
  })

  // Il bug che la card «Saldo Attuale» segnalava: /cash-flow chiede di
  // default una finestra che parte 90 giorni fa. Se scadenze, spese
  // ricorrenti e ricorrenze si proiettassero anche nel passato, l'ultima
  // uscita di una spesa già pagata comparirebbe due volte — una come
  // movimento reale, una come occorrenza proiettata sullo stesso giorno — e
  // una scadenza scaduta ma non pagata sottrarrebbe denaro mai uscito. Il
  // passato deve raccontarlo solo `movimento`.
  it('una finestra interamente nel passato riceve solo movimenti reali', async () => {
    const venueId = await getVenueId()
    const sessione = await loginAs('admin')
    const oggi = giornoCorrente()
    const dal = giornoIndietro(oggi, 60)
    const al = giornoIndietro(oggi, 30)
    const giornoMovimento = giornoIndietro(oggi, 45)

    // Scaduta ma non pagata: senza il taglio comparirebbe come uscita mai
    // avvenuta, proiettata su un giorno già passato.
    await creaScadenza({
      importoTotale: 300,
      tipo: 'passiva',
      dataScadenza: toDateOnlyUtc(giornoIndietro(oggi, 40)),
    })

    // Giornaliera: senza il taglio emetterebbe un'occorrenza per ognuno dei
    // 31 giorni della finestra, sommandosi al movimento che l'ha già pagata.
    await prisma.recurringExpense.create({
      data: {
        venueId,
        name: 'Canone',
        amount: 50,
        frequency: 'DAILY',
        createdBy: sessione.user.id,
      },
    })

    await creaMovimento({ venueId, uscita: 80, date: toDateOnlyUtc(giornoMovimento) })

    const flussi = await leggiFlussi(venueId, dal, al)

    expect(flussi).toHaveLength(1)
    expect(flussi[0].fonte).toBe('movimento')
    expect(flussi[0].importo).toBe(-80)
  })

  // L'apertura della serie sottrae dal saldo di fine finestra **solo** i
  // movimenti reali, non la variazione netta di tutte le fonti insieme: una
  // scadenza futura è un impegno non ancora avvenuto, non ha mai spostato un
  // euro reale, e sottrarla dall'apertura farebbe partire la curva già
  // gonfiata del suo importo — con l'ultimo punto che torna sempre al saldo
  // di oggi qualunque cosa ci sia da pagare, cioè esattamente il difetto che
  // il modulo esiste per chiudere, spostato all'inizio della curva.
  //
  // `serie.at(-1)?.saldo === saldiAlGiorno(al)` da solo non basterebbe: con
  // la formula sbagliata vale comunque, per costruzione, qualunque sia il
  // saldo iniziale scelto (apertura + variazione netta = saldo di fine
  // finestra sempre). Il test vero fissa entrambi i capi della curva.
  it("l'apertura sottrae solo i movimenti reali, non gli impegni futuri", async () => {
    const venueId = await getVenueId()
    await loginAs('admin')
    const oggi = giornoCorrente()
    const anno = Number(oggi.slice(0, 4))

    await prisma.initialBalance.create({
      data: { venueId, year: anno, cashBalance: 1000, bankBalance: 1500 },
    })
    // Fra dieci giorni, tipo passiva: un impegno preso ma non ancora onorato.
    await creaScadenza({
      importoTotale: 1000,
      tipo: 'passiva',
      dataScadenza: toDateOnlyUtc(giornoIndietro(oggi, -10)),
    })

    const al = giornoIndietro(oggi, -30)
    const serie = await serieProiettata(venueId, oggi, al)

    // Oggi: la scadenza non ha ancora spostato nulla, è il saldo reale.
    expect(serie[0].saldo).toBe(2500)
    // Fra dieci giorni la scadenza scade: il saldo previsto scende di 1.000.
    expect(serie.at(-1)?.saldo).toBe(1500)
  })

  // Il pagamento parziale: movimento e residuo non sono lo stesso denaro,
  // uno è già uscito e l'altro no. Ereditare la chiave della scadenza sul
  // movimento farebbe vincere il movimento più affidabile e cancellerebbe il
  // residuo ancora da pagare — per questo i movimenti non portano più
  // nessuna chiave.
  it('il pagamento parziale non fa sparire il residuo: movimento e scadenza restano entrambi', async () => {
    const venueId = await getVenueId()
    const sessione = await loginAs('admin')

    const ricorrenza = await creaRicorrenza({ importo: 1000, tipo: 'passiva' })
    const scadenza = await creaScadenza({
      importoTotale: 1000,
      importoPagato: 400,
      tipo: 'passiva',
      stato: 'parzialmente_pagata',
      dataScadenza: new Date('2026-09-10'),
      recurrenceId: ricorrenza.id,
    })
    const movimento = await creaMovimento({
      venueId,
      uscita: 400,
      date: new Date('2026-09-10'),
    })
    await prisma.scheduleReconciliation.create({
      data: {
        scheduleId: scadenza.id,
        journalEntryId: movimento.id,
        amount: 400,
        status: 'VERIFIED',
        createdById: sessione.user.id,
      },
    })

    const flussi = await leggiFlussi(venueId, '2026-09-01', '2026-09-30')
    const del10 = flussi.filter((f) => f.giorno === '2026-09-10')

    const flussoMovimento = del10.find((f) => f.fonte === 'movimento')
    const flussoScadenza = del10.find((f) => f.fonte === 'scadenza')

    expect(flussoMovimento?.importo).toBe(-400)
    expect(flussoMovimento?.chiave).toBeUndefined()
    expect(flussoScadenza?.importo).toBe(-600)
  })

  // L'euristica non basta più a "nome e importo uguali": la frequenza fa
  // parte della corrispondenza. Una ricorrenza annuale non sopprime una
  // spesa mensile solo perché si chiamano allo stesso modo e costano
  // uguale.
  it("l'euristica non aggancia contro una ricorrenza di frequenza diversa: la spesa mensile continua a emettere", async () => {
    const venueId = await getVenueId()
    const sessione = await loginAs('admin')

    await creaRicorrenza({
      descrizione: 'Assicurazione',
      importo: 500,
      tipo: 'passiva',
      frequenza: 'annuale',
      giornoDelMese: 10,
      // Fuori dalla finestra: qui interessa solo l'euristica, non
      // un'occorrenza propria della ricorrenza.
      dataFine: new Date('2026-08-01'),
    })
    const spesa = await prisma.recurringExpense.create({
      data: {
        venueId,
        name: 'Assicurazione',
        amount: 500,
        frequency: 'MONTHLY',
        dayOfMonth: 10,
        createdBy: sessione.user.id,
      },
    })

    const flussi = await leggiFlussi(venueId, '2026-09-01', '2026-09-30')
    const delGiorno10 = flussi.filter((f) => f.giorno === '2026-09-10' && f.fonte === 'ricorrente')

    expect(delGiorno10).toHaveLength(1)
    expect(delGiorno10[0].chiave).toBe(`spesa:${spesa.id}`)
  })

  // Il confine d'anno: se l'apertura si chiedesse a `giornoIndietro(dal, 1)`,
  // una finestra che si apre il 1° gennaio la chiederebbe al 31 dicembre
  // dell'anno prima — un anno per cui qui non esiste nessun `InitialBalance`,
  // nemmeno per fallback (`aperturaPerAnno` scenderebbe a vuoto e conterebbe
  // tutti i movimenti mai registrati come apertura). `al` resta invece
  // sempre nell'anno per cui l'`InitialBalance` esiste.
  it("la finestra che si apre il 1° gennaio non regredisce sul confine d'anno", async () => {
    const venueId = await getVenueId()
    await loginAs('admin')

    await prisma.initialBalance.create({
      data: { venueId, year: 2027, cashBalance: 1000, bankBalance: 4000 },
    })
    await creaMovimento({ venueId, entrata: 200, date: new Date('2027-01-05') })

    const serie = await serieProiettata(venueId, '2027-01-01', '2027-01-10')

    expect(serie[0].saldo).toBe(5000)
    expect(serie.find((p) => p.giorno === '2027-01-05')?.saldo).toBe(5200)
    expect(serie.at(-1)?.saldo).toBe(5200)
  })
})

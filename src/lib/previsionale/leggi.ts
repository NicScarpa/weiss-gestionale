import { prisma } from '@/lib/prisma'
import { money, toApi, type Money } from '@/lib/money'
import { toDateOnlyUtc } from '@/lib/timezone'
import { saldiAlGiorno, giornoIndietro } from '@/lib/saldi'
import { calcolaDataDallaRicorrenza, calcolaProssimaGenerazione } from '@/lib/recurrence-utils'
import { proietta, type FlussoPrevisto, type PuntoSerie } from './proietta'

/**
 * Le fonti reali da cui `proietta` costruisce la serie: chi legge i dati dal
 * database e li traduce in `FlussoPrevisto`. La funzione pura sta in
 * `proietta.ts`; qui vive tutto ciò che tocca Prisma.
 *
 * ## La chiave di sovrapposizione, fonte per fonte
 *
 * 1. Una `Schedule` generata da una `Recurrence` porta `chiave =
 *    'ricorrenza:' + recurrenceId` — legame esplicito in colonna, affidabile.
 *    Una `Schedule` manuale non porta chiave: non c'è nulla con cui
 *    confrontarla.
 * 2. Un `JournalEntry` nato da una riconciliazione eredita la chiave della
 *    scadenza che ha saldato — quindi la stessa regola del punto 1, vista dal
 *    lato del movimento.
 * 3. Una `RecurringExpense` non ha un legame esplicito con una `Recurrence`:
 *    sono due modelli disgiunti (vedi il commento in testa a `proietta.ts`).
 *    Il confronto è un'euristica dichiarata — nome normalizzato e importo
 *    uguali — e va usata così com'è, senza estenderla ad altri campi: un
 *    falso positivo qui fa sparire un'uscita vera dalla proiezione. Quando
 *    l'euristica trova una `Recurrence` corrispondente, la `RecurringExpense`
 *    non emette proprio nessuna occorrenza: è la `Recurrence` a essere la
 *    fonte autorevole (genera `Schedule` vere, riconciliabili), e la spesa è
 *    la sua copia nell'altro modello. Emetterle entrambe con la stessa fonte
 *    `ricorrente` non verrebbe deduplicato — due flussi della stessa fonte
 *    non si escludono mai a vicenda, per costruzione — e l'uscita si
 *    conterebbe due volte.
 */

/** Limite di sicurezza contro una `frequenza` che non fa avanzare la data. */
const LIMITE_OCCORRENZE_RICORRENZA = 1000

/** Elenco dei giorni civili fra `dal` e `al`, estremi compresi. */
function elencoGiorni(dal: string, al: string): string[] {
  const giorni: string[] = []
  const cursore = new Date(toDateOnlyUtc(dal))
  const fine = toDateOnlyUtc(al)

  while (cursore <= fine) {
    giorni.push(cursore.toISOString().slice(0, 10))
    cursore.setUTCDate(cursore.getUTCDate() + 1)
  }

  return giorni
}

/** Nome comparabile fra `RecurringExpense.name` e `Recurrence.descrizione`. */
function normalizzaNome(testo: string): string {
  return testo.trim().toLowerCase().replace(/\s+/g, ' ')
}

/**
 * I movimenti registrati nella finestra, con la chiave ereditata dalla
 * scadenza che hanno saldato quando la riconciliazione esiste ed è ancora
 * valida (una riconciliazione `REJECTED` non lega più nulla).
 */
async function leggiMovimenti(venueId: string, dal: string, al: string): Promise<FlussoPrevisto[]> {
  const movimenti = await prisma.journalEntry.findMany({
    where: {
      venueId,
      hiddenAt: null,
      date: { gte: toDateOnlyUtc(dal), lte: toDateOnlyUtc(al) },
    },
    select: {
      date: true,
      description: true,
      debitAmount: true,
      creditAmount: true,
      scheduleReconciliations: {
        where: { status: 'VERIFIED' },
        select: { schedule: { select: { recurrenceId: true } } },
      },
    },
  })

  return movimenti.map((movimento) => {
    const recurrenceId = movimento.scheduleReconciliations
      .map((riconciliazione) => riconciliazione.schedule.recurrenceId)
      .find((id): id is string => Boolean(id))

    const importo = money(movimento.debitAmount).minus(money(movimento.creditAmount))

    return {
      giorno: movimento.date.toISOString().slice(0, 10),
      importo: toApi(importo),
      fonte: 'movimento',
      descrizione: movimento.description,
      chiave: recurrenceId ? `ricorrenza:${recurrenceId}` : undefined,
    }
  })
}

/**
 * Le scadenze aperte nella finestra, sulla data attesa di cassa quando
 * diverge dalla contrattuale — stesso `OR` di
 * `src/app/api/scadenzario/saldo-scalare/route.ts`, copiato tale e quale.
 */
async function leggiScadenze(venueId: string, dal: string, al: string): Promise<FlussoPrevisto[]> {
  const finestra = { gte: toDateOnlyUtc(dal), lte: toDateOnlyUtc(al) }

  const scadenze = await prisma.schedule.findMany({
    where: {
      venueId,
      stato: { notIn: ['annullata', 'pagata'] },
      OR: [
        { dataAttesa: finestra },
        { dataAttesa: null, dataScadenza: finestra },
      ],
    },
    select: {
      tipo: true,
      descrizione: true,
      importoTotale: true,
      importoPagato: true,
      dataScadenza: true,
      dataAttesa: true,
      recurrenceId: true,
    },
  })

  return scadenze.map((scadenza) => {
    const residuo = money(scadenza.importoTotale).minus(money(scadenza.importoPagato))
    const importo = scadenza.tipo === 'passiva' ? residuo.negated() : residuo
    const giorno = (scadenza.dataAttesa ?? scadenza.dataScadenza).toISOString().slice(0, 10)

    return {
      giorno,
      importo: toApi(importo),
      fonte: 'scadenza',
      descrizione: scadenza.descrizione,
      chiave: scadenza.recurrenceId ? `ricorrenza:${scadenza.recurrenceId}` : undefined,
    }
  })
}

interface SpesaRicorrente {
  id: string
  name: string
  amount: Money
  frequency: string
  dayOfMonth: number | null
  dayOfWeek: number | null
  startDate: Date | null
  endDate: Date | null
}

/**
 * Il mese (0-11) su cui ancorare una ricorrenza lunga: quello da cui la spesa
 * è attiva. Le date `@db.Date` sono mezzanotte UTC del giorno civile, quindi
 * il mese si legge in UTC — con l'ora locale una spesa attiva dal 1° del mese
 * finirebbe nel mese precedente.
 *
 * Spostata da `src/app/api/dashboard/forecast/route.ts` insieme al resto
 * della logica di `calculateExpectedExpenses`: viveva in un calcolo
 * parallelo che non vedeva scadenze e ricorrenze, ed è la causa del doppio
 * conteggio descritto in `proietta.ts`.
 */
function meseDiPartenza(startDate: Date | null, predefinito: number): number {
  return startDate ? startDate.getUTCMonth() : predefinito
}

/** La spesa ricorrente cade nel giorno indicato? Stessa logica di prima, immutata. */
function spesaRicorrenteAppare(data: Date, spesa: SpesaRicorrente): boolean {
  if (spesa.startDate && data < spesa.startDate) return false
  if (spesa.endDate && data > spesa.endDate) return false

  const dayOfMonth = data.getUTCDate()
  const dayOfWeek = data.getUTCDay()
  const month = data.getUTCMonth()

  switch (spesa.frequency) {
    case 'DAILY':
      return true

    case 'WEEKLY':
      return spesa.dayOfWeek === dayOfWeek

    case 'BIWEEKLY':
      // Ogni due settimane - semplificato: 1° e 15° del mese
      return (
        spesa.dayOfWeek === dayOfWeek &&
        (dayOfMonth <= 7 || (dayOfMonth >= 15 && dayOfMonth <= 21))
      )

    case 'MONTHLY':
      return spesa.dayOfMonth === dayOfMonth

    case 'QUARTERLY':
      // Ogni tre mesi a partire dal mese in cui la spesa è entrata in vigore.
      return (
        spesa.dayOfMonth === dayOfMonth &&
        (month - meseDiPartenza(spesa.startDate, 0) + 12) % 3 === 0
      )

    case 'YEARLY':
      // Nel mese in cui la spesa è entrata in vigore, non a gennaio.
      return spesa.dayOfMonth === dayOfMonth && month === meseDiPartenza(spesa.startDate, 0)

    default:
      return false
  }
}

/**
 * Le occorrenze delle `RecurringExpense` attive nella finestra, **tranne**
 * quelle agganciate per euristica a una `Recurrence`: in quel caso la
 * `Recurrence` è la fonte autorevole (genera `Schedule` vere, riconciliabili,
 * con data attesa stimabile) e la spesa ricorrente è la sua copia sbiadita
 * nell'altro modello. Emetterle entrambe con la stessa chiave e la stessa
 * fonte `ricorrente` le farebbe sopravvivere entrambe a `proietta` — che non
 * deduplica due flussi della stessa fonte, per costruzione — e l'uscita
 * verrebbe contata due volte: esattamente il difetto che questo modulo esiste
 * per chiudere.
 */
function generaFlussiSpeseRicorrenti(
  spese: SpesaRicorrente[],
  indiceRicorrenze: Set<string>,
  giorni: string[]
): FlussoPrevisto[] {
  const flussi: FlussoPrevisto[] = []

  for (const spesa of spese) {
    const agganciata = indiceRicorrenze.has(
      `${normalizzaNome(spesa.name)}::${spesa.amount.toFixed(2)}`
    )
    if (agganciata) continue

    const chiave = `spesa:${spesa.id}`

    for (const giorno of giorni) {
      const data = toDateOnlyUtc(giorno)
      if (!spesaRicorrenteAppare(data, spesa)) continue

      flussi.push({
        giorno,
        importo: toApi(spesa.amount.negated()),
        fonte: 'ricorrente',
        descrizione: spesa.name,
        chiave,
      })
    }
  }

  return flussi
}

interface RicorrenzaAttiva {
  id: string
  tipo: string
  descrizione: string
  importo: Money
  frequenza: string
  giornoDelMese: number | null
  giornoDellSettimana: number | null
  dataInizio: Date
  dataFine: Date | null
  prossimaGenerazione: Date | null
}

/**
 * Le occorrenze future delle `Recurrence` attive, oltre l'ultima `Schedule`
 * già generata: `prossimaGenerazione` è proprio quel punto, perché
 * `/api/scadenzario/ricorrenze/[id]/genera` la avanza a ogni generazione.
 */
function generaFlussiRicorrenze(ricorrenze: RicorrenzaAttiva[], dal: string, al: string): FlussoPrevisto[] {
  const inizioFinestra = toDateOnlyUtc(dal)
  const fineFinestra = toDateOnlyUtc(al)
  const flussi: FlussoPrevisto[] = []

  for (const ricorrenza of ricorrenze) {
    if (ricorrenza.dataFine && ricorrenza.dataFine < inizioFinestra) continue

    let baseDate = ricorrenza.prossimaGenerazione ?? ricorrenza.dataInizio

    for (let i = 0; i < LIMITE_OCCORRENZE_RICORRENZA; i++) {
      const dataOccorrenza = calcolaDataDallaRicorrenza(
        ricorrenza.frequenza,
        ricorrenza.giornoDelMese,
        ricorrenza.giornoDellSettimana,
        baseDate
      )

      if (dataOccorrenza > fineFinestra) break
      if (ricorrenza.dataFine && dataOccorrenza > ricorrenza.dataFine) break

      if (dataOccorrenza >= inizioFinestra) {
        const importo = ricorrenza.tipo === 'passiva' ? ricorrenza.importo.negated() : ricorrenza.importo

        flussi.push({
          giorno: dataOccorrenza.toISOString().slice(0, 10),
          importo: toApi(importo),
          fonte: 'ricorrente',
          descrizione: ricorrenza.descrizione,
          chiave: `ricorrenza:${ricorrenza.id}`,
        })
      }

      const prossima = calcolaProssimaGenerazione(dataOccorrenza, ricorrenza.frequenza)
      // Frequenza sconosciuta: `calcolaProssimaGenerazione` non avanza e il
      // ciclo non finirebbe mai da solo.
      if (prossima.getTime() === baseDate.getTime()) break
      baseDate = prossima
    }
  }

  return flussi
}

/**
 * Tutti i flussi previsti nella finestra `[dal, al]`, dalle quattro fonti:
 * movimenti registrati, scadenze aperte, spese ricorrenti e ricorrenze non
 * ancora scadenzate. Non risolve le sovrapposizioni — è compito di `proietta`.
 */
export async function leggiFlussi(venueId: string, dal: string, al: string): Promise<FlussoPrevisto[]> {
  const [movimenti, scadenze, speseRicorrenti, ricorrenze] = await Promise.all([
    leggiMovimenti(venueId, dal, al),
    leggiScadenze(venueId, dal, al),
    prisma.recurringExpense.findMany({
      where: {
        venueId,
        isActive: true,
        OR: [{ endDate: null }, { endDate: { gte: toDateOnlyUtc(dal) } }],
      },
      select: {
        id: true,
        name: true,
        amount: true,
        frequency: true,
        dayOfMonth: true,
        dayOfWeek: true,
        startDate: true,
        endDate: true,
      },
    }),
    prisma.recurrence.findMany({
      where: { venueId },
      select: {
        id: true,
        tipo: true,
        descrizione: true,
        importo: true,
        frequenza: true,
        giornoDelMese: true,
        giornoDellSettimana: true,
        dataInizio: true,
        dataFine: true,
        prossimaGenerazione: true,
        isActive: true,
      },
    }),
  ])

  // L'euristica di corrispondenza gioca su tutte le ricorrenze della sede,
  // non solo su quelle attive: una Recurrence disattivata ha comunque potuto
  // generare Schedule che sono ancora nella finestra, e la spesa deve cedere
  // il passo (cioè non emettere affatto la propria occorrenza) anche a
  // quelle.
  const indiceRicorrenze = new Set(
    ricorrenze.map(
      (ricorrenza) => `${normalizzaNome(ricorrenza.descrizione)}::${money(ricorrenza.importo).toFixed(2)}`
    )
  )

  const giorni = elencoGiorni(dal, al)

  const flussiSpeseRicorrenti = generaFlussiSpeseRicorrenti(
    speseRicorrenti.map((spesa) => ({ ...spesa, amount: money(spesa.amount) })),
    indiceRicorrenze,
    giorni
  )

  const flussiRicorrenze = generaFlussiRicorrenze(
    ricorrenze
      .filter((ricorrenza) => ricorrenza.isActive)
      .map((ricorrenza) => ({ ...ricorrenza, importo: money(ricorrenza.importo) })),
    dal,
    al
  )

  return [...movimenti, ...scadenze, ...flussiSpeseRicorrenti, ...flussiRicorrenze]
}

/** La serie del saldo proiettato fra `dal` e `al`, dalle fonti reali. */
export async function serieProiettata(venueId: string, dal: string, al: string): Promise<PuntoSerie[]> {
  const [saldi, flussi] = await Promise.all([
    saldiAlGiorno(venueId, giornoIndietro(dal, 1)),
    leggiFlussi(venueId, dal, al),
  ])

  return proietta({ saldoIniziale: saldi.totalAvailable, dal, al, flussi })
}

import type { Prisma, RegisterType } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { money, toApi, type Money } from '@/lib/money'
import { romeDateKey, toDateOnlyUtc } from '@/lib/timezone'

/**
 * I saldi dei registri: quanti soldi ci sono, a una certa data.
 *
 * È l'unica risposta a quella domanda. Prima ce n'erano quattro — la prima
 * nota, il suo storico, il budget e il cash flow ne avevano ciascuna una
 * propria — e differivano non per arrotondamenti ma per definizione: chi
 * partiva dal saldo iniziale dell'anno e chi da zero, chi sommava anche i
 * movimenti datati nel futuro, chi leggeva una tabella di appoggio che nessun
 * codice ha mai popolato. Qualunque nuovo consumatore passa da qui: una
 * seconda formula, per quanto scritta bene, ricrea il problema.
 *
 * ## La definizione
 *
 * **Saldo a una data = saldo iniziale dell'anno + movimenti dal 1° gennaio di
 * quell'anno fino a quella data compresa.**
 *
 * Le tre parti della definizione rispondono ad altrettanti modi di sbagliare:
 *
 * - *dal 1° gennaio*, perché il saldo iniziale dell'anno è già il risultato
 *   degli anni precedenti: sommargli anche i loro movimenti conta due volte la
 *   stessa storia;
 * - *fino a quella data*, perché le regole dello scadenzario registrano le
 *   scritture al giorno in cui il denaro si muoverà, non a oggi: una fattura da
 *   pagare il mese prossimo non è denaro già uscito;
 * - *saldo iniziale dell'anno*, con una precisazione: se per l'anno richiesto
 *   non esiste (a gennaio la riga nuova non c'è ancora), si prende il più
 *   recente disponibile e si contano i movimenti dal 1° gennaio di *quell'*
 *   anno. Il riporto viene così calcolato invece di sparire.
 *
 * ## Cosa non entra nei saldi
 *
 * I movimenti cancellati (`deletedAt`) sono esclusi dal client Prisma per tutti.
 * I movimenti **nascosti** (`hiddenAt`) vengono esclusi qui: nascondere un
 * movimento serve a toglierlo dai conti, e lasciarlo pesare sui totali mentre
 * sparisce dalla lista era il modo più diretto per far dire due cose diverse a
 * due schermate. Il cash flow li escludeva già dalle proiezioni.
 */

/** I registri che contengono denaro liquido. */
export const REGISTRI: readonly RegisterType[] = ['CASH', 'BANK'] as const

export interface SaldoRegistro {
  registerType: RegisterType
  /** Saldo iniziale da cui il conteggio parte. */
  openingBalance: number
  /** Somma dei dare (entrate) nel periodo. */
  totalDebits: number
  /** Somma degli avere (uscite) nel periodo. */
  totalCredits: number
  /** `openingBalance + totalDebits − totalCredits`. */
  closingBalance: number
}

export interface Saldi {
  venueId: string
  /** Giorno civile italiano a cui i saldi si riferiscono ('yyyy-MM-dd'). */
  al: string
  /**
   * Primo giorno dei movimenti conteggiati ('yyyy-MM-dd'), oppure `null` quando
   * non esiste alcun saldo iniziale e si conta tutta la storia registrata.
   */
  dal: string | null
  /** Anno del saldo iniziale usato come apertura; `null` se non ne esiste alcuno. */
  annoApertura: number | null
  cashBalance: number
  bankBalance: number
  /** Cassa + banca: la liquidità disponibile. */
  totalAvailable: number
  registers: Record<RegisterType, SaldoRegistro>
}

/**
 * Condizione comune a ogni lettura dei movimenti che concorre a un saldo.
 * Averla in un posto solo è ciò che rende vera la promessa di questo modulo:
 * se domani un'altra colonna dovesse escludere un movimento dai conti, si
 * aggiunge qui e vale per tutti i consumatori insieme.
 */
function movimentiChePesano(venueId: string): Prisma.JournalEntryWhereInput {
  return { venueId, hiddenAt: null }
}

/** Il giorno civile italiano di adesso. */
export function giornoCorrente(): string {
  return romeDateKey(new Date())
}

/**
 * Saldo iniziale da cui far partire il conteggio per l'anno richiesto.
 *
 * Se manca la riga dell'anno si scende all'anno più recente che ce l'ha: il
 * conteggio partirà da più lontano e comprenderà più movimenti, arrivando allo
 * stesso numero. Senza alcuna riga l'apertura vale zero e si contano tutti i
 * movimenti registrati.
 */
async function aperturaPerAnno(
  venueId: string,
  anno: number
): Promise<{ anno: number | null; saldi: Record<RegisterType, Money> }> {
  const iniziale = await prisma.initialBalance.findFirst({
    where: { venueId, year: { lte: anno } },
    orderBy: { year: 'desc' },
  })

  if (!iniziale) {
    return { anno: null, saldi: { CASH: money(0), BANK: money(0) } }
  }

  return {
    anno: iniziale.year,
    saldi: {
      CASH: money(iniziale.cashBalance),
      BANK: money(iniziale.bankBalance),
    },
  }
}

interface Totali {
  dare: Money
  avere: Money
}

function totaliVuoti(): Record<RegisterType, Totali> {
  return {
    CASH: { dare: money(0), avere: money(0) },
    BANK: { dare: money(0), avere: money(0) },
  }
}

/**
 * Dare e avere per registro fino al giorno `al` compreso, a partire da `dal` se
 * indicato.
 *
 * La somma la fa PostgreSQL su colonne `Decimal`: caricare i movimenti e
 * sommarli in JavaScript rileggerebbe l'intera prima nota a ogni schermata e
 * riporterebbe il denaro nella virgola mobile.
 */
async function movimentiNellaFinestra(
  venueId: string,
  dal: string | null,
  al: string
): Promise<Record<RegisterType, Totali>> {
  const righe = await prisma.journalEntry.groupBy({
    by: ['registerType'],
    where: {
      ...movimentiChePesano(venueId),
      date: {
        ...(dal ? { gte: toDateOnlyUtc(dal) } : {}),
        lte: toDateOnlyUtc(al),
      },
    },
    _sum: { debitAmount: true, creditAmount: true },
  })

  const totali = totaliVuoti()

  for (const riga of righe) {
    totali[riga.registerType] = {
      dare: money(riga._sum.debitAmount),
      avere: money(riga._sum.creditAmount),
    }
  }

  return totali
}

/**
 * Saldi dei registri a un giorno civile italiano ('yyyy-MM-dd'), compreso.
 * Senza argomento: a oggi.
 */
export async function saldiAlGiorno(venueId: string, giorno?: string): Promise<Saldi> {
  const al = giorno ?? giornoCorrente()
  const apertura = await aperturaPerAnno(venueId, Number(al.slice(0, 4)))

  // Le colonne `date` sono `@db.Date`: Prisma le rappresenta come mezzanotte
  // UTC del giorno civile, ed è così che vanno confrontate. Usare gli estremi
  // della giornata italiana le sposterebbe di un giorno.
  const dal = apertura.anno === null ? null : `${apertura.anno}-01-01`
  const movimenti = await movimentiNellaFinestra(venueId, dal, al)

  const registers = Object.fromEntries(
    REGISTRI.map((registerType) => {
      const openingBalance = apertura.saldi[registerType]
      const { dare, avere } = movimenti[registerType]

      return [
        registerType,
        {
          registerType,
          openingBalance: toApi(openingBalance),
          totalDebits: toApi(dare),
          totalCredits: toApi(avere),
          closingBalance: toApi(openingBalance.plus(dare).minus(avere)),
        } satisfies SaldoRegistro,
      ]
    })
  ) as Record<RegisterType, SaldoRegistro>

  const cashBalance = registers.CASH.closingBalance
  const bankBalance = registers.BANK.closingBalance

  return {
    venueId,
    al,
    dal,
    annoApertura: apertura.anno,
    cashBalance,
    bankBalance,
    totalAvailable: toApi(money(cashBalance).plus(money(bankBalance))),
    registers,
  }
}

/**
 * La liquidità disponibile (cassa + banca) a un giorno. È la cifra che compare
 * come "saldo attuale" nel cash flow e come "liquidità" nel budget: chiamando
 * questa funzione le due schermate non possono più discordare.
 */
export async function liquiditaAlGiorno(venueId: string, giorno?: string): Promise<number> {
  return (await saldiAlGiorno(venueId, giorno)).totalAvailable
}

/** Il giorno civile italiano che precede di `giorni` quello indicato. */
export function giornoIndietro(giorno: string, giorni: number): string {
  const spostato = new Date(toDateOnlyUtc(giorno).getTime() - giorni * 24 * 60 * 60 * 1000)
  return spostato.toISOString().slice(0, 10)
}

/**
 * Il giorno del primo movimento registrato, `null` se la prima nota è vuota.
 * Serve a dare un inizio sensato alle serie storiche di chi non ha ancora un
 * saldo iniziale da cui partire.
 */
export async function primoGiornoConMovimenti(venueId: string): Promise<string | null> {
  const estremi = await prisma.journalEntry.aggregate({
    where: movimentiChePesano(venueId),
    _min: { date: true },
  })

  return estremi._min.date ? estremi._min.date.toISOString().slice(0, 10) : null
}

export interface MovimentiDelGiorno {
  /** Giorno civile ('yyyy-MM-dd'). */
  giorno: string
  registerType: RegisterType
  dare: Money
  avere: Money
  movimenti: number
}

/**
 * Movimenti aggregati per giorno e registro nella finestra indicata, estremi
 * compresi. Serve a chi deve disegnare una serie storica: il saldo progressivo
 * si costruisce sommando questi totali all'apertura restituita da
 * `saldiAlGiorno` sul giorno che precede la finestra.
 */
export async function movimentiPerGiorno(
  venueId: string,
  opzioni: { dal: string; al: string; registerType?: RegisterType }
): Promise<MovimentiDelGiorno[]> {
  const righe = await prisma.journalEntry.groupBy({
    by: ['date', 'registerType'],
    where: {
      ...movimentiChePesano(venueId),
      ...(opzioni.registerType ? { registerType: opzioni.registerType } : {}),
      date: { gte: toDateOnlyUtc(opzioni.dal), lte: toDateOnlyUtc(opzioni.al) },
    },
    _sum: { debitAmount: true, creditAmount: true },
    _count: { _all: true },
    orderBy: { date: 'asc' },
  })

  return righe.map((riga) => ({
    giorno: riga.date.toISOString().slice(0, 10),
    registerType: riga.registerType,
    dare: money(riga._sum.debitAmount),
    avere: money(riga._sum.creditAmount),
    movimenti: riga._count._all,
  }))
}

/**
 * Movimento netto medio per **giorno di calendario** nella finestra indicata.
 *
 * Il divisore sono i giorni, non i movimenti: una media per movimento non si
 * può moltiplicare per trenta e chiamarla previsione a trenta giorni, perché
 * dice quanto vale un movimento e non quanti ne capitano al giorno.
 */
export async function nettoMedioGiornaliero(
  venueId: string,
  opzioni: { dal: string; al: string }
): Promise<Money> {
  const totali = await prisma.journalEntry.aggregate({
    where: {
      ...movimentiChePesano(venueId),
      date: { gte: toDateOnlyUtc(opzioni.dal), lte: toDateOnlyUtc(opzioni.al) },
    },
    _sum: { debitAmount: true, creditAmount: true },
  })

  const giorni = Math.max(
    1,
    Math.round(
      (toDateOnlyUtc(opzioni.al).getTime() - toDateOnlyUtc(opzioni.dal).getTime()) /
        (24 * 60 * 60 * 1000)
    ) + 1
  )

  return money(totali._sum.debitAmount)
    .minus(money(totali._sum.creditAmount))
    .dividedBy(giorni)
}

export interface MovimentiPerConto {
  /** Conto del piano dei conti; `null` per i movimenti non imputati. */
  accountId: string | null
  /** Mese civile, da 1 a 12. */
  mese: number
  dare: Money
  avere: Money
}

/**
 * Movimenti di un anno raggruppati per conto e mese.
 *
 * È la materia prima degli actual di budget. Il raggruppamento è per conto e
 * non per categoria di budget perché la categoria si deriva dal conto
 * (`AccountBudgetMapping`): partire dal conto significa che una rimappatura si
 * riflette subito sugli actual, senza dover ritoccare i movimenti già scritti.
 */
export async function movimentiPerContoEMese(
  venueId: string,
  anno: number
): Promise<MovimentiPerConto[]> {
  const righe = await prisma.journalEntry.groupBy({
    by: ['accountId', 'date'],
    where: {
      ...movimentiChePesano(venueId),
      date: {
        gte: toDateOnlyUtc(`${anno}-01-01`),
        lte: toDateOnlyUtc(`${anno}-12-31`),
      },
    },
    _sum: { debitAmount: true, creditAmount: true },
  })

  const perContoEMese = new Map<string, MovimentiPerConto>()

  const aggiungi = (
    accountId: string | null,
    mese: number,
    dare: ReturnType<typeof money>,
    avere: ReturnType<typeof money>
  ) => {
    const chiave = `${accountId ?? ''}|${mese}`
    const corrente =
      perContoEMese.get(chiave) ?? { accountId, mese, dare: money(0), avere: money(0) }

    perContoEMese.set(chiave, {
      ...corrente,
      dare: corrente.dare.plus(dare),
      avere: corrente.avere.plus(avere),
    })
  }

  for (const riga of righe) {
    // `date` è `@db.Date`, cioè mezzanotte UTC: il mese si legge in UTC, o le
    // scritture del primo giorno del mese finirebbero in quello precedente.
    aggiungi(
      riga.accountId,
      riga.date.getUTCMonth() + 1,
      money(riga._sum.debitAmount),
      money(riga._sum.creditAmount)
    )
  }

  // Le suddivisioni spostano l'importo sui conti delle fette.
  //
  // Fino all'8 agosto 2026 le fette non erano lette da nessun report: il
  // titolare divideva un pagamento da 1.000 € in 700 «Alimentari» e 300
  // «Pulizie», vedeva il badge «Suddiviso (2)», e nel confronto budget
  // Alimentari mostrava 1.000 e Pulizie 0. L'unico effetto reale della
  // suddivisione era di spostare il movimento intero sul conto della fetta più
  // grossa. La distanza fra ciò che credeva di aver fatto e i numeri era
  // l'intero importo del movimento.
  //
  // Si sottrae dal conto principale solo la SOMMA delle fette, non l'importo
  // intero: una suddivisione parziale lascia il resto dov'era. E il totale del
  // mese non cambia mai — l'importo si sposta, non si crea e non si perde.
  const fette = await prisma.journalEntryAllocation.findMany({
    where: {
      journalEntry: {
        ...movimentiChePesano(venueId),
        date: {
          gte: toDateOnlyUtc(`${anno}-01-01`),
          lte: toDateOnlyUtc(`${anno}-12-31`),
        },
      },
    },
    select: {
      accountId: true,
      importo: true,
      journalEntry: {
        select: { id: true, accountId: true, date: true, debitAmount: true, creditAmount: true },
      },
    },
  })

  const fettePerMovimento = new Map<string, typeof fette>()
  for (const fetta of fette) {
    const elenco = fettePerMovimento.get(fetta.journalEntry.id) ?? []
    elenco.push(fetta)
    fettePerMovimento.set(fetta.journalEntry.id, elenco)
  }

  for (const elenco of fettePerMovimento.values()) {
    const movimento = elenco[0].journalEntry
    const mese = movimento.date.getUTCMonth() + 1
    // Il verso della fetta è quello del movimento che la contiene: una
    // suddivisione non cambia il segno di ciò che è stato pagato o incassato.
    const inDare = money(movimento.debitAmount).greaterThan(0)

    for (const fetta of elenco) {
      const importo = money(fetta.importo)
      // Via dal conto principale…
      aggiungi(
        movimento.accountId,
        mese,
        inDare ? importo.negated() : money(0),
        inDare ? money(0) : importo.negated()
      )
      // …e sul conto della fetta.
      aggiungi(
        fetta.accountId,
        mese,
        inDare ? importo : money(0),
        inDare ? money(0) : importo
      )
    }
  }

  return Array.from(perContoEMese.values())
}

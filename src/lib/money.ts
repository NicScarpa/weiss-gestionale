import Decimal from 'decimal.js'
import { Prisma } from '@prisma/client'

/**
 * Aritmetica del denaro.
 *
 * È l'unico modulo che importa `decimal.js`: la configurazione della precisione
 * vive qui e non va replicata altrove, perché due configurazioni diverse dello
 * stesso oggetto globale sono un arrotondamento che cambia a seconda di quale
 * modulo è stato importato per primo.
 *
 * La regola d'uso è una sola: **un importo non diventa mai `number` nei
 * passaggi intermedi**. Si legge dal database come `Prisma.Decimal`, si somma e
 * si confronta come `Money`, e torna `number` solo all'ultimo passo, quando
 * esce verso la UI (`toApi`) o rientra in una colonna (`toDb`). Ogni conversione
 * anticipata reintroduce l'errore della virgola mobile che questo file esiste
 * per evitare.
 */

// Precisione ampia per i passaggi intermedi (le divisioni pro-quota ne hanno
// bisogno) e arrotondamento commerciale: il mezzo centesimo va per eccesso,
// come si fa in contabilità e come pretendono le colonne Decimal(_, 2).
Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP })

/** Un importo. Immutabile: ogni operazione restituisce un nuovo valore. */
export type Money = Decimal

/**
 * Tutto ciò che nel progetto rappresenta un importo prima di essere
 * normalizzato: numeri e stringhe che arrivano dalle richieste HTTP, `Decimal`
 * letti da Prisma, e l'assenza di valore delle colonne opzionali.
 */
export type MoneyInput = number | string | Decimal | Prisma.Decimal | null | undefined

/** Decimali delle colonne monetarie: `@db.Decimal(_, 2)`. */
const DECIMALI = 2

/**
 * Scarto entro cui una posizione si considera chiusa. Mezzo centesimo è la
 * dimensione dell'errore di arrotondamento, non di un debito: sotto questa
 * soglia il residuo è rumore.
 */
const TOLLERANZA_SALDO = new Decimal('0.005')

const ZERO = new Decimal(0)

class ImportoNonValidoError extends Error {
  constructor(valore: unknown) {
    super(`Importo non valido: ${JSON.stringify(valore) ?? String(valore)}`)
    this.name = 'ImportoNonValidoError'
  }
}

/**
 * Normalizza un importo. Un valore assente vale zero — è la colonna opzionale
 * che non è stata compilata — ma un valore *sbagliato* solleva un errore invece
 * di diventare zero di nascosto: un NaN che entra in contabilità come 0 è un
 * ammanco che nessuno vede.
 */
export function money(value: MoneyInput): Money {
  if (value === null || value === undefined) return ZERO

  if (value instanceof Decimal) return value

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new ImportoNonValidoError(value)
    return new Decimal(value)
  }

  // Stringhe e `Prisma.Decimal`, che è una copia separata di decimal.js e non
  // supera `instanceof`: la rappresentazione decimale è il passaggio comune
  // esatto fra le due copie.
  const testo = typeof value === 'string' ? value.trim() : String(value)
  if (testo.length === 0) throw new ImportoNonValidoError(value)

  let importo: Decimal
  try {
    importo = new Decimal(testo)
  } catch {
    throw new ImportoNonValidoError(value)
  }

  if (!importo.isFinite()) throw new ImportoNonValidoError(value)
  return importo
}

/** Arrotonda ai centesimi, per eccesso sul mezzo centesimo. */
export function round2(value: MoneyInput): Money {
  return money(value).toDecimalPlaces(DECIMALI, Decimal.ROUND_HALF_UP)
}

/**
 * Somma una serie di importi. Accetta sia un elenco di argomenti sia un array,
 * perché i chiamanti hanno l'uno o l'altro e lo spread di mille elementi è solo
 * rumore alla lettura.
 */
export function sumMoney(values: MoneyInput[]): Money
export function sumMoney(...values: MoneyInput[]): Money
export function sumMoney(...args: (MoneyInput | MoneyInput[])[]): Money {
  let totale = ZERO

  for (const arg of args) {
    if (Array.isArray(arg)) {
      for (const value of arg) totale = totale.plus(money(value))
    } else {
      totale = totale.plus(money(arg))
    }
  }

  return totale
}

/**
 * Valore da scrivere in una colonna monetaria. L'arrotondamento avviene qui,
 * una volta sola: PostgreSQL arrotonderebbe comunque, ma silenziosamente e con
 * regole sue.
 */
export function toDb(value: MoneyInput): Prisma.Decimal {
  return new Prisma.Decimal(round2(value).toFixed(DECIMALI))
}

/**
 * Valore da mandare alla UI. È l'unico punto in cui un importo diventa
 * `number`: dopo questa chiamata la precisione non è più garantita, quindi non
 * ci si fanno altri conti.
 */
export function toApi(value: MoneyInput): number {
  return round2(value).toNumber()
}

/**
 * Una posizione è saldata quando il residuo non supera il mezzo centesimo.
 * Il confronto secco `pagato >= totale` lascerebbe aperte per sempre le
 * scadenze chiuse con un riparto che non torna all'ultimo decimale.
 */
export function isSettled(pagato: MoneyInput, totale: MoneyInput): boolean {
  return money(totale).minus(money(pagato)).lessThanOrEqualTo(TOLLERANZA_SALDO)
}

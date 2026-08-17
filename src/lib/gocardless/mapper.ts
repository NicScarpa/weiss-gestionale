/**
 * Da movimento GoCardless a riga di `bank_transactions`.
 *
 * Puro di proposito: niente Prisma, niente rete, niente data corrente. Tutte
 * le decisioni discutibili di questa integrazione passano di qui, e qui si
 * possono verificare in millisecondi.
 */
import { separaCausale } from '@/lib/banca/separa-causale'
import type { Movimento, RispostaMovimenti } from './types'

/** `BankTransaction.description` è `VarChar(500)`. */
export const LUNGHEZZA_MASSIMA_CAUSALE = 500

export interface MovimentoDaSalvare {
  /**
   * L'identificativo della banca. **Non** finisce in `bankReference`: quel
   * campo ha un indice unico su `(venue_id, bank_reference)` che non contiene
   * il conto, e l'identificativo di GoCardless è un contatore per giorno *e
   * per conto* — `20260810-6` esiste su ogni conto. Scriverlo lì farebbe
   * scartare come duplicati dei movimenti veri. Vedi il difetto 2 della spec.
   */
  providerTransactionId: string
  transactionDate: Date
  valueDate: Date | null
  /** Il testo grezzo della banca, com'è arrivato: non si modifica mai. */
  description: string
  /** Tipo di operazione e dettagli, separati con `separaCausale`. */
  causale: string | null
  descrizione: string
  /** Stringa fino a PostgreSQL: vedi la nota su `importoSchema`. */
  amount: string
  bankTransactionCode: string | null
}

/**
 * `2026-08-10` → mezzanotte UTC.
 *
 * La colonna è `@db.Date`, senza fuso: costruire la data con il costruttore
 * locale la sposterebbe di un giorno per chi lavora a est di Greenwich, che
 * è esattamente il nostro caso da fine marzo a fine ottobre.
 */
function dataDaGiorno(giorno: string): Date {
  return new Date(`${giorno}T00:00:00.000Z`)
}

function testoGrezzo(m: Movimento): string {
  const testo =
    m.remittanceInformationUnstructured?.trim() ||
    m.remittanceInformationUnstructuredArray?.join(' ').trim() ||
    ''

  if (testo === '') return '(movimento senza causale)'
  if (testo.length <= LUNGHEZZA_MASSIMA_CAUSALE) return testo
  // Troncare è meglio che far fallire l'inserimento dell'intero blocco, ma il
  // taglio deve restare visibile: una causale che finisce a metà senza dirlo
  // sembra un dato della banca, e qualcuno ci costruirebbe sopra una regola.
  return testo.slice(0, LUNGHEZZA_MASSIMA_CAUSALE - 1) + '…'
}

export function mappaMovimento(grezzo: Movimento): MovimentoDaSalvare {
  const description = testoGrezzo(grezzo)
  const codice = grezzo.proprietaryBankTransactionCode ?? null
  const separata = separaCausale(description, codice)
  return {
    providerTransactionId: grezzo.transactionId,
    transactionDate: dataDaGiorno(grezzo.bookingDate),
    valueDate: grezzo.valueDate ? dataDaGiorno(grezzo.valueDate) : null,
    description,
    causale: separata.causale,
    descrizione: separata.descrizione,
    amount: grezzo.transactionAmount.amount,
    bankTransactionCode: codice,
  }
}

/**
 * Solo i movimenti **contabilizzati**.
 *
 * I provvisori si scartano di proposito (decisione 1 della spec della Fase 3):
 * quando si consolidano cambiano identificativo e spesso importo — la mancia su
 * un pagamento con carta, l'arrotondamento del cambio — quindi tenerli
 * richiederebbe la logica che riconosce il provvisorio diventato definitivo, su
 * due campi che possono cambiare entrambi. È il punto in cui nascono i doppioni.
 *
 * Oggi la lista è comunque vuota: questa banca non manda `pending`, e per questo
 * il campo ha `.default([])` nello schema. Il filtro vale per il giorno in cui un
 * altro istituto li mandasse, o questo cambiasse comportamento senza dirlo.
 */
export function mappaMovimenti(risposta: RispostaMovimenti): MovimentoDaSalvare[] {
  return risposta.transactions.booked.map(mappaMovimento)
}

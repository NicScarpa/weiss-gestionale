import { format, parseISO } from 'date-fns'
import { it } from 'date-fns/locale'

/**
 * Etichette e date delle comunicazioni aziendali, condivise tra la bacheca del
 * portale e la pagina di chi le pubblica: la stessa comunicazione deve leggersi
 * uguale da entrambe le parti.
 */

export type PrioritaComunicazione = 'NORMAL' | 'IMPORTANT' | 'URGENT'

export const PRIORITA_OPZIONI: Array<{
  value: PrioritaComunicazione
  label: string
}> = [
  { value: 'NORMAL', label: 'Normale' },
  { value: 'IMPORTANT', label: 'Importante' },
  { value: 'URGENT', label: 'Urgente' },
]

export function etichettaPriorita(priorita: PrioritaComunicazione): string {
  return (
    PRIORITA_OPZIONI.find((opzione) => opzione.value === priorita)?.label ??
    'Normale'
  )
}

/**
 * Il giorno civile di una data che arriva dall'API.
 *
 * `eventDate` è una colonna data (mezzanotte UTC), `expiresAt` un istante: la
 * scadenza è salvata come inizio del giorno successivo — "scade il 10" vuol
 * dire che il 10 si legge ancora — quindi un millisecondo indietro riporta al
 * giorno che l'utente ha scritto.
 */
export function giornoDiScadenza(expiresAt: string): string {
  return new Date(new Date(expiresAt).getTime() - 1).toISOString().slice(0, 10)
}

/** `2026-08-10` letto da un umano: "10 agosto 2026". */
export function formattaGiorno(data: string): string {
  return format(parseISO(data.slice(0, 10)), 'd MMMM yyyy', { locale: it })
}

/**
 * Il giorno di un istante — `createdAt`, non una colonna data — nel fuso di
 * chi guarda: tagliarne la stringa ISO sposterebbe al giorno prima le
 * comunicazioni scritte a tarda sera.
 */
export function formattaIstante(istante: string): string {
  return format(new Date(istante), 'd MMMM yyyy', { locale: it })
}

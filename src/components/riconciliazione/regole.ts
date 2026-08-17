/**
 * Le regole del motore, con sigla e descrizione.
 *
 * Servono a due cose che sembrano diverse e sono la stessa: lo stato di attesa
 * della pagina d'ingresso — al posto di un'illustrazione, l'elenco di cosa il
 * motore sta per cercare — e l'etichetta sulla scheda, che dice da quale regola
 * viene la proposta che si sta guardando. Occupano con una spiegazione lo
 * spazio in cui chi guarda ha una domanda e nessuna risposta.
 *
 * Sono qui e non nella rotta perché il testo è materiale della schermata; la
 * lista di ciò che il motore sa davvero fare sta in cima a
 * `src/app/api/riconciliazione-assistita/lotti/route.ts`, e le due devono
 * restare d'accordo: `REGOLE_ATTIVE` elenca solo R1, R2 e R3, che è ciò che il
 * POST accetta oggi.
 */

export interface RegolaSpiegata {
  sigla: string
  titolo: string
  descrizione: string
}

/** Le tre regole che il primo taglio calcola davvero. */
export const REGOLE_ATTIVE: RegolaSpiegata[] = [
  {
    sigla: 'R1',
    titolo: 'Banca ↔ Fattura fornitore',
    descrizione: 'Un\'uscita dal conto che salda una o più rate di fatture passive.',
  },
  {
    sigla: 'R2',
    titolo: 'Banca ↔ Fattura cliente',
    descrizione: 'Un\'entrata sul conto che incassa una o più rate attive.',
  },
  {
    sigla: 'R3',
    titolo: 'Banca ↔ Scadenza senza fattura',
    descrizione: 'Affitto, F24, utenze: scadenze che non hanno dietro una fattura elettronica.',
  },
]

/** Le sigle da mandare al POST che genera il lotto. */
export const SIGLE_ATTIVE = REGOLE_ATTIVE.map((r) => r.sigla)

/** Il titolo della regola, o la sigla nuda se è una che la schermata non conosce ancora. */
export function titoloRegola(sigla: string): string {
  return REGOLE_ATTIVE.find((r) => r.sigla === sigla)?.titolo ?? sigla
}

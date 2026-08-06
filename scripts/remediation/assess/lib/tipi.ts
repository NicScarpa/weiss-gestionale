/**
 * Tipi condivisi fra i quattro censimenti e il comando che li esegue tutti.
 */

import type { SolaLettura } from './db'

export interface Opzioni {
  /** Quante righe di esempio mostrare a schermo per ogni raggruppamento. */
  esempi: number
  /** Cartella in cui depositare i file JSON del rapporto. */
  cartellaRapporti: string
  /** Marcatore temporale condiviso da tutti i file di una stessa esecuzione. */
  esecuzione: string
  /** Se falso, il censimento stampa soltanto e non scrive alcun file. */
  scriviJson: boolean
}

export interface Esito {
  /** Righe già formattate del rapporto a schermo. */
  testo: string[]
  /**
   * Quante anomalie sono state trovate: guida il riepilogo finale e il codice
   * di uscita informativo del comando.
   */
  anomalie: number
  /**
   * Struttura destinata agli script di bonifica che verranno dopo: contiene
   * gli identificativi delle righe da correggere, mai un dato sensibile.
   */
  dati: Record<string, unknown>
}

export interface Censimento {
  /** Lettera della corruzione secondo il piano di bonifica. */
  lettera: 'a' | 'b' | 'c' | 'd'
  /** Usato per il nome del file JSON. */
  nome: string
  titolo: string
  /** Cosa censisce, in una riga: compare in testa al rapporto. */
  descrizione: string
  esegui(db: SolaLettura, opzioni: Opzioni): Promise<Esito>
}

import { TOLLERANZA, type ScadenzaCandidata } from './punteggio'

/**
 * I pagamenti cumulativi: un movimento che salda più scadenze insieme.
 *
 * Modulo puro. La ricerca è deliberatamente stretta — stessa controparte,
 * al massimo quattro gambe, somma che torna al centesimo — perché senza
 * questi limiti comincia a proporre somme che quadrano per caso, e una somma
 * casuale che quadra sembra un abbinamento giusto. È il modo peggiore di
 * sbagliare.
 */

/** Oltre quattro documenti in un bonifico solo è raro, e il costo esplode. */
export const MAX_GAMBE = 4

/** Oltre questo numero di candidate si rinuncia invece di rallentare. */
const MAX_CANDIDATE = 40

export interface OpzioniCombinazioni {
  maxGambe?: number
  tolleranza?: number
}

/**
 * Chiave d'identità della controparte: l'id se c'è, altrimenti il nome.
 *
 * Va chiamata solo dopo aver scartato le scadenze prive di entrambi (vedi
 * `haControparteIdentificabile`): senza id né nome non c'è prova che due
 * scadenze siano collegate, e l'unica cosa che le unirebbe sarebbe
 * l'aritmetica — precisamente la «somma che quadra per caso» che questo
 * modulo esiste per non produrre.
 */
function chiaveControparte(scadenza: ScadenzaCandidata): string {
  return (scadenza.supplierId ?? scadenza.controparteNome) as string
}

/** Vedi il commento su `chiaveControparte`: senza questi due, niente prova. */
function haControparteIdentificabile(scadenza: ScadenzaCandidata): boolean {
  return scadenza.supplierId !== null || scadenza.controparteNome !== null
}

/**
 * Le combinazioni di scadenze la cui somma dei residui pareggia l'importo.
 *
 * Restituisce solo combinazioni di **almeno due** gambe: quelle di una gamba
 * sola sono già valutate coppia per coppia, e ripeterle qui produrrebbe
 * proposte doppie.
 */
export function trovaCombinazioni(
  importo: number,
  candidate: ScadenzaCandidata[],
  opzioni: OpzioniCombinazioni = {}
): ScadenzaCandidata[][] {
  const maxGambe = opzioni.maxGambe ?? MAX_GAMBE
  const tolleranza = opzioni.tolleranza ?? TOLLERANZA

  const perControparte = new Map<string, ScadenzaCandidata[]>()
  for (const scadenza of candidate) {
    if (scadenza.residuo <= tolleranza) continue
    if (!haControparteIdentificabile(scadenza)) continue
    const chiave = chiaveControparte(scadenza)
    const gruppo = perControparte.get(chiave)
    if (gruppo) gruppo.push(scadenza)
    else perControparte.set(chiave, [scadenza])
  }

  const risultati: ScadenzaCandidata[][] = []

  for (const gruppo of perControparte.values()) {
    if (gruppo.length < 2) continue

    // Le più grandi per prime, così la potatura sul residuo morde subito.
    // Il taglio a MAX_CANDIDATE è una rinuncia dichiarata, non un dettaglio
    // di prestazioni: scarta le candidate più piccole del gruppo, e fra
    // quelle scartate potrebbe esserci la combinazione giusta.
    const ordinate = [...gruppo]
      .sort((a, b) => b.residuo - a.residuo)
      .slice(0, MAX_CANDIDATE)

    const corrente: ScadenzaCandidata[] = []

    const esplora = (da: number, somma: number) => {
      if (somma - importo > tolleranza) return
      if (corrente.length >= 2 && Math.abs(somma - importo) <= tolleranza) {
        risultati.push([...corrente])
        return
      }
      if (corrente.length >= maxGambe) return

      for (let i = da; i < ordinate.length; i++) {
        corrente.push(ordinate[i])
        esplora(i + 1, somma + ordinate[i].residuo)
        corrente.pop()
      }
    }

    esplora(0, 0)
  }

  return risultati
}

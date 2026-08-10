/**
 * Formattazione del rapporto a schermo. Nessun accesso al database.
 *
 * Il destinatario del testo prodotto qui è il titolare, non uno sviluppatore:
 * le tabelle hanno intestazioni in italiano, gli importi sono in euro e le
 * date in formato italiano.
 */

export type Allineamento = 'sx' | 'dx'

export interface Colonna<R> {
  etichetta: string
  /** Estrae dalla riga il testo già formattato per questa colonna. */
  valore: (riga: R) => string
  allinea?: Allineamento
  /** Tronca il contenuto oltre questa lunghezza, con carattere di continuazione. */
  massimo?: number
}

const LARGHEZZA_RIGA = 100

export function titolo(testo: string): string[] {
  return ['', '═'.repeat(LARGHEZZA_RIGA), testo.toUpperCase(), '═'.repeat(LARGHEZZA_RIGA)]
}

export function sezione(testo: string): string[] {
  return ['', testo, '─'.repeat(Math.min(LARGHEZZA_RIGA, Math.max(testo.length, 20)))]
}

/** Riga di dettaglio "etichetta: valore" allineata sulle etichette più lunghe. */
export function voci(coppie: Array<[string, string]>): string[] {
  const larghezza = coppie.reduce((massimo, [etichetta]) => Math.max(massimo, etichetta.length), 0)
  return coppie.map(([etichetta, valore]) => `  ${etichetta.padEnd(larghezza)}  ${valore}`)
}

export function tabella<R>(colonne: Array<Colonna<R>>, righe: R[]): string[] {
  if (righe.length === 0) return ['  (nessuna riga)']

  const celle = righe.map((riga) =>
    colonne.map((colonna) => tronca(colonna.valore(riga), colonna.massimo))
  )

  const larghezze = colonne.map((colonna, indice) =>
    celle.reduce(
      (massimo, riga) => Math.max(massimo, riga[indice].length),
      colonna.etichetta.length
    )
  )

  const intestazione = colonne
    .map((colonna, indice) => allinea(colonna.etichetta, larghezze[indice], colonna.allinea))
    .join('  ')
  const separatore = larghezze.map((larghezza) => '─'.repeat(larghezza)).join('  ')
  const corpo = celle.map((riga) =>
    riga.map((cella, indice) => allinea(cella, larghezze[indice], colonne[indice].allinea)).join('  ')
  )

  return [`  ${intestazione}`, `  ${separatore}`, ...corpo.map((riga) => `  ${riga}`)]
}

function allinea(testo: string, larghezza: number, verso: Allineamento = 'sx'): string {
  return verso === 'dx' ? testo.padStart(larghezza) : testo.padEnd(larghezza)
}

function tronca(testo: string, massimo?: number): string {
  if (!massimo || testo.length <= massimo) return testo
  return `${testo.slice(0, Math.max(1, massimo - 1))}…`
}

export function euro(valore: string | number | null | undefined): string {
  if (valore === null || valore === undefined) return '—'
  const numero = typeof valore === 'number' ? valore : Number(valore)
  if (!Number.isFinite(numero)) return String(valore)
  return numero.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })
}

export function intero(valore: string | number | null | undefined): string {
  if (valore === null || valore === undefined) return '—'
  const numero = typeof valore === 'number' ? valore : Number(valore)
  if (!Number.isFinite(numero)) return String(valore)
  return numero.toLocaleString('it-IT')
}

/**
 * Le date arrivano dal database già come testo `AAAA-MM-GG`: si convertono
 * senza passare da `Date`, così nessun fuso orario può spostarle di un giorno.
 */
export function data(valore: string | null | undefined): string {
  if (!valore) return '—'
  const corrispondenza = valore.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!corrispondenza) return valore
  return `${corrispondenza[3]}/${corrispondenza[2]}/${corrispondenza[1]}`
}

export function siNo(valore: boolean | null | undefined): string {
  if (valore === null || valore === undefined) return '—'
  return valore ? 'sì' : 'no'
}

export function testo(valore: string | null | undefined): string {
  if (valore === null || valore === undefined || valore === '') return '—'
  return valore.replace(/\s+/g, ' ').trim()
}

/**
 * Un dato sensibile non va mostrato nemmeno parzialmente: se ne dichiara solo
 * la presenza. Vale per gli IBAN, che oltretutto sono cifrati a riposo e qui
 * non vengono mai nemmeno selezionati.
 */
export function presenza(valore: boolean | null | undefined): string {
  return valore ? 'presente' : 'assente'
}

export function pluraleRighe(quantita: number): string {
  return quantita === 1 ? '1 riga' : `${intero(quantita)} righe`
}

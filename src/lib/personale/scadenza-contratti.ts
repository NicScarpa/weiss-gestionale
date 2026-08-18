/**
 * I contratti a termine che stanno per scadere.
 *
 * La data di fine non è anagrafica ornamentale: esiste per farsi avvisare in
 * tempo, parlare con la persona e decidere del rinnovo. Senza l'avviso, il
 * dato sarebbe solo una casella in più da compilare.
 *
 * **Modulo puro, senza import**: prende un elenco e una data, restituisce chi
 * segnalare. Chi legge il database e chi manda gli avvisi sta altrove, e può
 * essere provato senza toccare né l'uno né gli altri.
 */

/**
 * Quanti giorni prima far scattare l'avviso.
 *
 * Quindici: sotto, la conversazione sul rinnovo arriva quando la decisione
 * è già presa dai fatti — la persona si è organizzata altrove, o il termine è
 * passato e il rapporto prosegue senza che nessuno l'abbia deciso.
 */
export const GIORNI_DI_PREAVVISO = 15

/** Il solo contratto la cui fine è fissata dal contratto stesso. */
const CONTRATTI_A_TERMINE = ['TEMPO_DETERMINATO'] as const

export interface DipendenteConContratto {
  id: string
  firstName: string
  lastName: string
  email: string | null
  contractType: string | null
  contractEndDate: Date | null
  isActive: boolean
}

export interface ContrattoInScadenza extends DipendenteConContratto {
  contractEndDate: Date
  /** Negativo se il termine è già passato. */
  giorniMancanti: number
  giaScaduto: boolean
}

/**
 * Il tipo di contratto pretende una data di fine?
 *
 * Solo il tempo determinato. Intermittente, occasionale e libero
 * professionista possono benissimo finire, ma non è il contratto a dettarne il
 * giorno: pretenderla vorrebbe dire farsi inventare una data, e una data
 * inventata fa scattare avvisi che non servono a nessuno.
 */
export function richiedeDataFine(contractType: string | null | undefined): boolean {
  return CONTRATTI_A_TERMINE.includes(contractType as (typeof CONTRATTI_A_TERMINE)[number])
}

/** Mezzanotte UTC del giorno civile: le date del contratto sono giorni, non istanti. */
function giornoCivile(data: Date): number {
  return Date.UTC(data.getUTCFullYear(), data.getUTCMonth(), data.getUTCDate())
}

const UN_GIORNO = 24 * 60 * 60 * 1000

/**
 * Quanti giorni mancano alla scadenza.
 *
 * Zero il giorno stesso: il contratto è in corso per tutto il suo ultimo
 * giorno, e dire «scaduto» la mattina del 31 a un contratto che finisce il 31
 * sarebbe sbagliato. Il conto è fra giorni civili, non fra istanti: sulle ore,
 * un contratto sarebbe scaduto a mezzanotte del giorno prima per chi guarda
 * dall'Italia.
 */
export function giorniAllaScadenza(scadenza: Date, oggi: Date): number {
  return Math.round((giornoCivile(scadenza) - giornoCivile(oggi)) / UN_GIORNO)
}

/**
 * Chi va segnalato oggi, dal più urgente al meno urgente.
 *
 * Comprende i contratti **già scaduti**: se il termine è passato e nessuno se
 * n'è accorto, il problema non è meno grave — è più grave, e smettere di
 * segnalarlo proprio allora sarebbe il modo peggiore di comportarsi.
 */
export function contrattiInScadenza(
  dipendenti: DipendenteConContratto[],
  oggi: Date
): ContrattoInScadenza[] {
  return dipendenti
    .filter((d) => d.isActive)
    .filter((d) => richiedeDataFine(d.contractType))
    .filter((d): d is DipendenteConContratto & { contractEndDate: Date } => !!d.contractEndDate)
    .map((d) => {
      const giorniMancanti = giorniAllaScadenza(d.contractEndDate, oggi)
      return { ...d, giorniMancanti, giaScaduto: giorniMancanti < 0 }
    })
    .filter((d) => d.giorniMancanti <= GIORNI_DI_PREAVVISO)
    .sort((a, b) => a.giorniMancanti - b.giorniMancanti)
}

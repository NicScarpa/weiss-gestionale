import { romeInstant, timeColumnToMinutes } from '@/lib/timezone'

/**
 * Decisioni della chiusura automatica delle timbrature dimenticate.
 *
 * Funzioni pure, senza database e senza orologio, per la stessa ragione per
 * cui lo è il motore di calcolo: **qui si decide un orario che diventa ore
 * pagate**. Prima questa logica viveva dentro la route del cron, che non
 * aveva una sola riga di test ed era l'unico pezzo del modulo a scrivere ore
 * sul database senza rete.
 */

/**
 * Quanto indietro guarda il programma in cerca di entrate rimaste aperte.
 *
 * Prima erano 24 ore, e con una soglia di 12 la finestra utile si riduceva a
 * 12 ore: un'entrata del lunedì mattina diventava chiudibile la sera e usciva
 * dalla portata del programma il martedì mattina. Se in mezzo il servizio non
 * girava — un rilascio lungo, un guasto notturno — quella timbratura non la
 * guardava più nessun giro futuro, restava aperta per sempre, e una giornata
 * con l'entrata e senza uscita vale zero ore: il dipendente perdeva la
 * giornata intera. Col valore massimo ammesso dalle impostazioni (24 ore) la
 * finestra era addirittura vuota e il programma non chiudeva più niente, in
 * silenzio.
 *
 * Allargarla è sicuro: il controllo che evita di chiudere due volte la stessa
 * entrata è indipendente dalla finestra.
 */
export const FINESTRA_RECUPERO_GIORNI = 30

/**
 * Fine dell'ultimo turno pianificato della giornata, in minuti dalla
 * mezzanotte italiana del giorno in cui la giornata è iniziata.
 *
 * Col turno spezzato conta la fine della sera, non quella di mezzogiorno.
 * Oltre 1440 quando il turno scavalca la mezzanotte. È la stessa regola che
 * `sessioni-aperte.ts` applica per la chiusura di cassa — il pezzo scritto
 * meglio del modulo, e il modello a cui questa chiusura andava riportata.
 */
export function fineTurnoInMinuti(
  turni: { startTime: Date | null; endTime: Date | null }[]
): number | null {
  let fineMassima: number | null = null

  for (const turno of turni) {
    if (!turno.startTime || !turno.endTime) continue

    const inizio = timeColumnToMinutes(turno.startTime)
    let fine = timeColumnToMinutes(turno.endTime)
    if (fine <= inizio) {
      fine += 24 * 60
    }

    if (fineMassima === null || fine > fineMassima) {
      fineMassima = fine
    }
  }

  return fineMassima
}

export interface ChiusuraAutomatica {
  orario: Date
  /** 'turno' = fine del pianificato; 'ripiego' = tetto di ore sull'entrata. */
  origine: 'turno' | 'ripiego'
}

/**
 * L'orario a cui chiudere un'entrata rimasta aperta.
 *
 * Prima era sempre «entrata più dodici ore», un orario che nessuno ha mai
 * lavorato: Mario col turno 07:00-13:00 che entra alle 06:58 e dimentica
 * l'uscita si vedeva scrivere le 18:58, cioè 12 ore pagate invece di 6 —
 * 84 € di troppo per una dimenticanza.
 *
 * Ora vale la fine del turno pianificato quando c'è. Il tetto di ore resta
 * comunque un tetto: un turno dichiarato male non deve poter far pagare una
 * giornata intera.
 */
export function orarioChiusuraAutomatica(input: {
  entrataAlle: Date
  /** Giornata lavorativa dell'entrata, 'yyyy-MM-dd' in ora italiana. */
  dateKeyEntrata: string
  fineTurnoMinuti: number | null
  maxHours: number
}): ChiusuraAutomatica {
  const { entrataAlle, dateKeyEntrata, fineTurnoMinuti, maxHours } = input

  const ripiego = new Date(entrataAlle.getTime() + maxHours * 60 * 60 * 1000)

  if (fineTurnoMinuti === null) {
    return { orario: ripiego, origine: 'ripiego' }
  }

  const fineTurno = romeInstant(dateKeyEntrata, fineTurnoMinuti)

  // Una fine turno anteriore all'entrata è un dato incoerente: chiuderebbe
  // l'uscita prima dell'entrata. Oltre il tetto è un turno dichiarato male.
  if (fineTurno <= entrataAlle || fineTurno > ripiego) {
    return { orario: ripiego, origine: 'ripiego' }
  }

  return { orario: fineTurno, origine: 'turno' }
}

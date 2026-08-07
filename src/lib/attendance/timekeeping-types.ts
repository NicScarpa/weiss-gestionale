/**
 * Tipi del motore di calcolo delle ore.
 *
 * Il motore ragiona su **minuti dalla mezzanotte italiana** del giorno in cui
 * la giornata lavorativa è iniziata, non su `Date`. I valori possono superare
 * 1440: le 02:00 del giorno dopo sono il minuto 1560. Così il calcolo non
 * dipende dal fuso della macchina ed è verificabile a mente.
 */

export interface TimeRounding {
  /** Multiplo a cui si arrotonda. 1 significa nessun arrotondamento. */
  intervalMinutes: number
  /** Entro questi minuti dal confine, l'orario resta esatto. */
  toleranceMinutes: number
}

export interface PolicyBreak {
  name: string
  startMinutes: number
  endMinutes: number
}

export interface PolicyRules {
  /**
   * Finestra della giornata lavorativa. Entrambi null significa "nessuna
   * finestra": si contano le ore così come sono state timbrate. È il caso di
   * chi non ha una regola assegnata, che deve continuare a funzionare come
   * prima che le regole esistessero.
   */
  dayStartMinutes: number | null
  /** Se minore o uguale all'inizio, la giornata scavalca la mezzanotte. */
  dayEndMinutes: number | null
  lunch: { startMinutes: number; endMinutes: number } | null
  extraBreaks: PolicyBreak[]
  /** Margine entro cui anticipo e posticipo contano come lavoro. */
  flexMinutes: number
  entryRounding: TimeRounding
  exitRounding: TimeRounding
  maxDailyMinutes: number | null
  /** Ore giornaliere da contratto, oltre le quali si conta straordinario. */
  contractDailyMinutes: number | null
  saturdayAsOvertime: boolean
  /** Si timbra una volta sola: la giornata vale le ore previste dalla regola. */
  singlePunchMode: boolean
  /**
   * La giornata segue il turno pianificato (context.shiftWindows) invece
   * della finestra fissa: l'anticipo entro la tolleranza non conta e oltre
   * conta ma va in revisione, il ritardo si arrotonda a blocchi dall'inizio
   * del turno, le ore oltre la fine restano sospese finché un revisore non
   * decide (context.shiftReview), il buco del turno spezzato non si conta.
   * Senza turno pianificato quel giorno, le ore sono quelle timbrate.
   */
  useShiftAsWindow: boolean
}

/** Esito della revisione umana su un'anomalia della giornata. */
export type ReviewDecision = 'APPROVED' | 'REJECTED'

/**
 * Decisioni del revisore sulle anomalie del giorno, per le regole che
 * seguono il turno. Assente = in attesa: l'anticipo conta comunque (l'ha
 * chiesto il datore), le ore oltre la fine restano sospese.
 */
export interface ShiftReview {
  /** Anomalia EARLY_CLOCK_IN: anticipo sull'inizio del turno. */
  earlyIn?: ReviewDecision
  /** Anomalia OVERTIME: ore oltre la fine del turno o fuori dal pianificato. */
  overtime?: ReviewDecision
}

export interface DayPunch {
  type: 'IN' | 'OUT' | 'BREAK_START' | 'BREAK_END'
  minutes: number
}

export interface DayContext {
  /** 0 = domenica, come `Date.getDay`. */
  weekday: number
  isHoliday: boolean
  /**
   * Turni pianificati della giornata, in minuti della giornata lavorativa
   * (oltre 1440 = dopo la mezzanotte). Due elementi per il turno spezzato.
   * Usati solo dalle regole con `useShiftAsWindow`.
   */
  shiftWindows?: { startMinutes: number; endMinutes: number }[]
  /** Decisioni del revisore sulle anomalie del giorno (regole a turno). */
  shiftReview?: ShiftReview
  /**
   * Scarto di fuso fra inizio e fine della giornata, in minuti: +60 nella notte
   * di fine marzo in cui l'orologio va avanti, -60 in quella di fine ottobre.
   *
   * Serve perché il motore ragiona sull'orologio, ma le ore da pagare sono
   * quelle realmente lavorate: la notte in cui alle 02:00 scattano le 03:00,
   * cinque ore di orologio sono quattro ore di lavoro.
   */
  dstShiftMinutes?: number
}

export type DayWarning =
  | 'ENTRATA_MANCANTE'
  | 'USCITA_MANCANTE'
  | 'PAUSA_PRANZO_NON_TIMBRATA'
  | 'FUORI_FINESTRA'
  | 'OLTRE_TETTO_GIORNALIERO'
  /** Ore oltre la fine del turno pianificato: sospese in attesa di revisione. */
  | 'OLTRE_TURNO'
  /** Anticipo sul turno oltre la tolleranza: contato, in attesa di revisione. */
  | 'ANTICIPO_TURNO'
  /** Buco del turno spezzato coperto dalle timbrature: non contato. */
  | 'BUCO_TURNO'
  /** Uscita ben prima della fine del turno: ore reali, ma da far vedere. */
  | 'USCITA_ANTICIPATA'

export interface RecognizedDay {
  /** Entrata riconosciuta, dopo flessibilità e arrotondamento. */
  clockIn: number | null
  clockOut: number | null
  workedMinutes: number
  ordinaryMinutes: number
  overtimeMinutes: number
  nightMinutes: number
  holidayMinutes: number
  breakMinutes: number
  /** Minuti tagliati dal tetto giornaliero. */
  cappedMinutes: number
  /**
   * Minuti oltre il turno pianificato sospesi in attesa di revisione: non
   * contati né buttati. Finché non tornano a zero, il mese del dipendente
   * non si può esportare per le paghe.
   */
  pendingReviewMinutes: number
  /** Passaggi del calcolo in italiano, per il calcolatore di prova. */
  steps: string[]
  warnings: DayWarning[]
}

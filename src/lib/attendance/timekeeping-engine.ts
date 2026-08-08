import type {
  DayContext,
  DayPunch,
  DayWarning,
  PolicyRules,
  RecognizedDay,
  ShiftReview,
  TimeRounding,
} from './timekeeping-types'

/**
 * Motore di calcolo delle ore riconosciute.
 *
 * Funzioni pure: nessun accesso al database, nessun `new Date()`, nessuna
 * lettura del fuso. Prendono le timbrature di una giornata espresse in minuti
 * dalla mezzanotte italiana e la regola da applicare, e restituiscono le ore
 * riconosciute con la traccia di come ci si è arrivati.
 *
 * La traccia non è un lusso: una regola con cinque parametri di arrotondamento
 * è impossibile da verificare a occhio, e il calcolatore di prova
 * dell'interfaccia mostra proprio questi passaggi.
 */

const DAY_MINUTES = 24 * 60
const NIGHT_START = 22 * 60
const NIGHT_END = 6 * 60

/**
 * Arrotondamento dell'entrata, verso l'orario successivo.
 * Entro la tolleranza dal confine precedente l'orario resta esatto: con
 * intervallo 30 e tolleranza 5, le 9:03 restano 9:03 e le 9:06 diventano 9:30.
 */
export function roundEntry(minutes: number, rounding: TimeRounding): number {
  const { intervalMinutes, toleranceMinutes } = rounding
  if (intervalMinutes <= 1) {
    return minutes
  }

  const past = minutes % intervalMinutes
  if (past === 0 || past <= toleranceMinutes) {
    return minutes
  }

  return minutes - past + intervalMinutes
}

/**
 * Arrotondamento dell'uscita, verso l'orario precedente.
 * Entro la tolleranza oltre il confine i minuti non vengono tagliati.
 */
export function roundExit(minutes: number, rounding: TimeRounding): number {
  const { intervalMinutes, toleranceMinutes } = rounding
  if (intervalMinutes <= 1) {
    return minutes
  }

  const past = minutes % intervalMinutes
  if (past === 0 || past <= toleranceMinutes) {
    return minutes
  }

  return minutes - past
}

/** Minuti dell'intervallo che cadono in fascia notturna (22:00-06:00). */
export function nightMinutesIn(startMinutes: number, endMinutes: number): number {
  if (endMinutes <= startMinutes) {
    return 0
  }

  let total = 0
  const firstDay = Math.floor(startMinutes / DAY_MINUTES) - 1
  const lastDay = Math.floor(endMinutes / DAY_MINUTES)

  for (let day = firstDay; day <= lastDay; day++) {
    const offset = day * DAY_MINUTES
    total += overlap(
      startMinutes,
      endMinutes,
      offset + NIGHT_START,
      offset + DAY_MINUTES + NIGHT_END
    )
  }

  return total
}

function overlap(startA: number, endA: number, startB: number, endB: number): number {
  return Math.max(0, Math.min(endA, endB) - Math.max(startA, startB))
}

/**
 * Fine della giornata lavorativa, che può cadere dopo la mezzanotte.
 * Null quando la regola non definisce una finestra.
 */
function dayEndOf(policy: PolicyRules): number | null {
  if (policy.dayStartMinutes === null || policy.dayEndMinutes === null) {
    return null
  }

  return policy.dayEndMinutes <= policy.dayStartMinutes
    ? policy.dayEndMinutes + DAY_MINUTES
    : policy.dayEndMinutes
}

function formatMinutes(minutes: number): string {
  const normalized = ((minutes % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES
  const h = Math.floor(normalized / 60)
  const m = normalized % 60

  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function emptyDay(
  warnings: DayWarning[],
  steps: string[],
  pendingReviewMinutes = 0
): RecognizedDay {
  return {
    clockIn: null,
    clockOut: null,
    workedMinutes: 0,
    ordinaryMinutes: 0,
    overtimeMinutes: 0,
    nightMinutes: 0,
    holidayMinutes: 0,
    breakMinutes: 0,
    cappedMinutes: 0,
    pendingReviewMinutes,
    steps,
    warnings,
  }
}

interface Interval {
  start: number
  end: number
}

/**
 * Toglie di mezzo gli orari che il sistema aveva supposto e che una correzione
 * approvata ha nel frattempo sostituito.
 *
 * Serve perché lo storico delle timbrature è a sola aggiunta — nessuna route
 * modifica o cancella una timbratura, ed è giusto così. Il rimedio previsto è
 * la rettifica: si aggiunge l'orario corretto e la richiesta approvata lo
 * collega. Ma finché il motore non distingueva le due, teneva comunque la più
 * tarda, e le ore sbagliate scritte dalla chiusura automatica si potevano
 * togliere **solo entrando nel database**. Nessuno in azienda poteva
 * correggerle dall'applicazione.
 *
 * La sostituzione vale per tipo di timbratura e solo contro ciò che ha scritto
 * il **sistema**: una supposizione cede a una decisione umana. Le timbrature
 * vere del dipendente non si toccano — quelle sono fatti.
 */
function scartaSupposizioniCorrette(ordered: DayPunch[]): {
  effettive: DayPunch[]
  sostituite: DayPunch[]
} {
  const tipiCorretti = new Set(
    ordered.filter((p) => p.origine === 'correzione').map((p) => p.type)
  )

  if (tipiCorretti.size === 0) {
    return { effettive: ordered, sostituite: [] }
  }

  const sostituite = ordered.filter(
    (p) => p.origine === 'sistema' && tipiCorretti.has(p.type)
  )

  return {
    effettive: ordered.filter((p) => !sostituite.includes(p)),
    sostituite,
  }
}

/**
 * Distanza entro cui una seconda uscita è ancora il doppio tocco sul telefono
 * e non una timbratura nuova.
 *
 * Senza questo limite l'estensione valeva a qualunque distanza, e nove ore
 * dopo faceva pagare tutto il buco: `IN 09:00, OUT 13:00, OUT 22:00` dava 780
 * minuti invece di 240 — 123 € lordi in più in un giorno — con la lista degli
 * avvisi vuota. È il difetto 1 dell'audit W5-F3, e succedeva nel caso più
 * ordinario che ci sia: chi rientra dalla pausa e non timbra l'entrata, perché
 * quel giorno una timbratura l'ha già fatta.
 */
const DOPPIA_USCITA_TOLLERANZA_MINUTI = 15

/**
 * Accoppia le timbrature in turni [entrata, uscita]. Una giornata può averne
 * più d'uno — il turno spezzato del bar, 07:00-13:00 e 17:00-22:00 — e il
 * buco fra i turni non è lavoro.
 *
 * Regole di tolleranza sui dati sporchi: un'entrata doppia dentro un turno
 * aperto si ignora (vale la prima); un'uscita doppia entro pochi minuti dalla
 * fine del turno lo estende (vale l'ultima); **oltre quel margine l'uscita è
 * orfana**, cioè le manca l'entrata, e viene scartata invece di allungare il
 * turno precedente; un'uscita senza nessuna entrata prima si ignora; un
 * inizio pausa che ne sostituisce un altro ancora aperto vale come quello
 * buono, ma la pausa sostituita viene segnalata: non è mai stata chiusa.
 */
function pairPunches(ordered: DayPunch[]): {
  segments: Interval[]
  punchedBreaks: Interval[]
  hasIn: boolean
  danglingIn: number | null
  /** Uscite troppo lontane per essere un doppio tocco: manca la loro entrata. */
  orphanExits: number[]
  /** Inizi di pausa rimasti senza BREAK_END: segnalati, non dedotti. */
  danglingBreaks: number[]
} {
  const segments: Interval[] = []
  const punchedBreaks: Interval[] = []
  const orphanExits: number[] = []
  const danglingBreaks: number[] = []
  let openIn: number | null = null
  let openBreak: number | null = null
  let hasIn = false

  for (const punch of ordered) {
    if (punch.type === 'IN') {
      hasIn = true
      if (openIn === null) {
        openIn = punch.minutes
      }
    } else if (punch.type === 'OUT') {
      if (openIn !== null) {
        segments.push({ start: openIn, end: Math.max(punch.minutes, openIn) })
        openIn = null
      } else if (segments.length > 0) {
        const lastSegment = segments[segments.length - 1]
        // La distanza si misura dalla fine del turno già chiuso. Un'uscita
        // anteriore a quella fine dà differenza negativa e resta dentro la
        // tolleranza: il Math.max la assorbe come prima.
        if (punch.minutes - lastSegment.end <= DOPPIA_USCITA_TOLLERANZA_MINUTI) {
          lastSegment.end = Math.max(lastSegment.end, punch.minutes)
        } else {
          orphanExits.push(punch.minutes)
        }
      }
    } else if (punch.type === 'BREAK_START') {
      // Un inizio pausa che ne sostituisce un altro ancora aperto lascia
      // indietro una pausa mai chiusa: il calcolo resta quello di sempre
      // (vale l'ultimo inizio), ma quella sostituita va segnalata.
      if (openBreak !== null) {
        danglingBreaks.push(openBreak)
      }
      openBreak = punch.minutes
    } else if (punch.type === 'BREAK_END' && openBreak !== null) {
      if (punch.minutes > openBreak) {
        punchedBreaks.push({ start: openBreak, end: punch.minutes })
      }
      openBreak = null
    }
  }

  if (openBreak !== null) {
    danglingBreaks.push(openBreak)
  }

  return {
    segments,
    punchedBreaks,
    hasIn,
    danglingIn: openIn,
    orphanExits,
    danglingBreaks: danglingBreaks.sort((a, b) => a - b),
  }
}

/** Minuti dell'intervallo [start, end] che cadono dentro i segmenti. */
function overlapWithSegments(start: number, end: number, segments: Interval[]): number {
  return segments.reduce((sum, s) => sum + overlap(start, end, s.start, s.end), 0)
}

/** Parte di [start, end] coperta sia da una pausa timbrata sia da un segmento. */
function overlapWithPunchedBreaks(
  start: number,
  end: number,
  punchedBreaks: Interval[],
  segments: Interval[]
): number {
  let total = 0
  for (const b of punchedBreaks) {
    for (const s of segments) {
      total += Math.max(
        0,
        Math.min(end, b.end, s.end) - Math.max(start, b.start, s.start)
      )
    }
  }
  return total
}

/**
 * Le finestre di pausa della regola sono scritte come orari del giorno
 * (0-1439), ma in un turno che scavalca la mezzanotte la stessa pausa cade
 * "domani": la cena delle 00:30 di una giornata 18:00-03:00 è il minuto 1470,
 * non il 30. Si sceglie la posizione che interseca davvero l'orario lavorato.
 */
function placeBreakWindow(
  startMinutes: number,
  endMinutes: number,
  segments: Interval[]
): Interval {
  const plain = { start: startMinutes, end: endMinutes }
  const shifted = { start: startMinutes + DAY_MINUTES, end: endMinutes + DAY_MINUTES }

  const plainOverlap = overlapWithSegments(plain.start, plain.end, segments)
  const shiftedOverlap = overlapWithSegments(shifted.start, shifted.end, segments)

  return shiftedOverlap > plainOverlap ? shifted : plain
}

/**
 * Applica il turno pianificato come finestra della giornata.
 *
 * Le decisioni di prodotto che incarna: l'anticipo entro la tolleranza non
 * conta, oltre conta subito — l'ha chiesto il datore — ma resta in revisione
 * finché un umano non conferma, e il rifiuto lo taglia da solo; il ritardo
 * entro la tolleranza resta quello timbrato, oltre salta a blocchi interi
 * dall'orario del turno (8:30 + ritardo di 21 con blocchi da 30 → 9:00); le
 * ore oltre la fine — o del tutto fuori dal pianificato — restano SOSPESE
 * finché il revisore non decide: approvate contano, rifiutate si tagliano
 * alla fine del turno; il buco del turno spezzato coperto dalle timbrature
 * non è lavoro e non si conta.
 */
function applyShiftWindows(
  segments: Interval[],
  windows: { startMinutes: number; endMinutes: number }[],
  policy: PolicyRules,
  review: ShiftReview,
  steps: string[],
  warnings: DayWarning[]
): { segments: Interval[]; pendingReviewMinutes: number } {
  if (windows.length === 0) {
    steps.push('Nessun turno pianificato: le ore sono quelle timbrate.')
    return { segments, pendingReviewMinutes: 0 }
  }

  const ordinate = [...windows].sort((a, b) => a.startMinutes - b.startMinutes)
  steps.push(
    'Turno pianificato: ' +
      ordinate
        .map((w) => `${formatMinutes(w.startMinutes)}-${formatMinutes(w.endMinutes)}`)
        .join(', ') +
      '.'
  )

  let pendingReviewMinutes = 0
  const flags = {
    anticipoInAttesa: false,
    oltreInAttesa: false,
    bucoTagliato: false,
    uscitaAnticipata: false,
  }
  // Il ritardo si arrotonda solo alla prima entrata in ciascuna finestra: chi
  // esce e rientra nello stesso turno ha già pagato il tempo fuori.
  const finestreGiaEntrate = new Set<number>()
  const result: Interval[] = []

  for (const s of segments) {
    const toccate = ordinate
      .map((w, i) => ({ w, i }))
      .filter(({ w }) => overlap(s.start, s.end, w.startMinutes, w.endMinutes) > 0)

    if (toccate.length === 0) {
      // Lavoro del tutto fuori dal pianificato: stessa sorte delle ore oltre
      // la fine del turno, decide l'anomalia di straordinario.
      const minuti = s.end - s.start
      if (review.overtime === 'APPROVED') {
        result.push(s)
        steps.push(`Lavoro fuori dal turno approvato: ${minuti} min contati.`)
      } else if (review.overtime === 'REJECTED') {
        steps.push(`Lavoro fuori dal turno rifiutato: ${minuti} min non contati.`)
      } else {
        pendingReviewMinutes += minuti
        flags.oltreInAttesa = true
        steps.push(
          `Lavoro fuori dal turno pianificato: ${minuti} min sospesi in attesa di revisione.`
        )
      }
      continue
    }

    for (let k = 0; k < toccate.length; k++) {
      const { w, i } = toccate[k]
      let start = Math.max(s.start, w.startMinutes)
      let end = Math.min(s.end, w.endMinutes)

      if (k === 0 && s.start < w.startMinutes) {
        const anticipo = w.startMinutes - s.start
        if (anticipo <= policy.entryRounding.toleranceMinutes) {
          steps.push(`Anticipo sul turno: si conta dalle ${formatMinutes(w.startMinutes)}.`)
        } else if (review.earlyIn === 'REJECTED') {
          steps.push(
            `Anticipo di ${anticipo} min rifiutato: si conta dalle ${formatMinutes(w.startMinutes)}.`
          )
        } else if (review.earlyIn === 'APPROVED') {
          start = s.start
          steps.push(`Anticipo di ${anticipo} min approvato: contato.`)
        } else {
          start = s.start
          flags.anticipoInAttesa = true
          steps.push(`Anticipo di ${anticipo} min sul turno: contato, in attesa di revisione.`)
        }
      } else if (k === 0 && s.start > w.startMinutes && !finestreGiaEntrate.has(i)) {
        const ritardo = s.start - w.startMinutes
        const { intervalMinutes, toleranceMinutes } = policy.entryRounding
        if (intervalMinutes > 1 && ritardo > toleranceMinutes) {
          const arrotondato =
            w.startMinutes + Math.ceil(ritardo / intervalMinutes) * intervalMinutes
          steps.push(
            `Ritardo di ${ritardo} min oltre la tolleranza di ${toleranceMinutes}: ` +
              `si conta dalle ${formatMinutes(arrotondato)}.`
          )
          start = arrotondato
        }
      }
      finestreGiaEntrate.add(i)

      if (k === toccate.length - 1) {
        if (s.end > w.endMinutes) {
          const oltre = s.end - w.endMinutes
          if (oltre <= policy.exitRounding.toleranceMinutes) {
            end = s.end
          } else if (review.overtime === 'APPROVED') {
            end = s.end
            steps.push(`${oltre} min oltre la fine del turno approvati: contano.`)
          } else if (review.overtime === 'REJECTED') {
            steps.push(
              `${oltre} min oltre la fine del turno rifiutati: ` +
                `si conta fino alle ${formatMinutes(w.endMinutes)}.`
            )
          } else {
            pendingReviewMinutes += oltre
            flags.oltreInAttesa = true
            steps.push(`${oltre} min oltre la fine del turno: sospesi in attesa di revisione.`)
          }
        } else if (w.endMinutes - s.end > policy.exitRounding.toleranceMinutes) {
          flags.uscitaAnticipata = true
          steps.push(
            `Uscita anticipata: ${w.endMinutes - s.end} min prima della fine del turno.`
          )
        }
      } else {
        // La timbratura copre il buco fra questa finestra e la prossima.
        const next = toccate[k + 1].w
        const buco = overlap(s.start, s.end, w.endMinutes, next.startMinutes)
        if (buco > 0) {
          flags.bucoTagliato = true
          steps.push(
            `Buco del turno spezzato (${formatMinutes(w.endMinutes)}-` +
              `${formatMinutes(next.startMinutes)}): ${buco} min non contati.`
          )
        }
      }

      if (end > start) {
        result.push({ start, end })
      }
    }
  }

  if (flags.anticipoInAttesa) warnings.push('ANTICIPO_TURNO')
  if (flags.oltreInAttesa) warnings.push('OLTRE_TURNO')
  if (flags.bucoTagliato) warnings.push('BUCO_TURNO')
  if (flags.uscitaAnticipata) warnings.push('USCITA_ANTICIPATA')

  return { segments: result, pendingReviewMinutes }
}

/**
 * Ore riconosciute per una giornata lavorativa.
 *
 * L'ordine dei passaggi conta: prima l'accoppiamento delle timbrature in
 * turni, poi la finestra della giornata con la flessibilità, poi gli
 * arrotondamenti, poi le pause, poi il tetto giornaliero, infine la
 * classificazione. Invertirli darebbe risultati diversi.
 */
export function computeRecognizedDay(
  punches: DayPunch[],
  policy: PolicyRules,
  context: DayContext
): RecognizedDay {
  const steps: string[] = []
  const warnings: DayWarning[] = []

  const ordered = [...punches].sort((a, b) => a.minutes - b.minutes)
  const { effettive, sostituite } = scartaSupposizioniCorrette(ordered)

  if (sostituite.length > 0) {
    const orari = sostituite.map((p) => formatMinutes(p.minutes)).join(', ')
    steps.push(
      `Correzione approvata: l'orario scritto dal sistema (${orari}) è stato sostituito.`
    )
  }

  const paired = pairPunches(effettive)

  if (!paired.hasIn) {
    warnings.push('ENTRATA_MANCANTE')
    return emptyDay(warnings, ['Nessuna entrata registrata.'])
  }

  // Un'uscita troppo lontana dal turno chiuso non lo estende: le manca
  // l'entrata. Il turno vale quello che è stato timbrato davvero, e la
  // giornata va segnalata — altrimenti l'errore arriva muto al cedolino.
  // I passaggi nominano l'orario scartato: prima la riga diceva «entrata
  // 09:00, uscita 22:00» e nascondeva proprio ciò che doveva far scoprire.
  if (paired.orphanExits.length > 0) {
    warnings.push('ENTRATA_MANCANTE')
    const orari = paired.orphanExits.map(formatMinutes).join(', ')
    steps.push(
      `Uscita senza entrata alle ${orari}: non estende il turno precedente ` +
        'e non viene contata. Serve una correzione.'
    )
  }

  const dayStart = policy.dayStartMinutes
  const dayEnd = dayEndOf(policy)

  let segments = paired.segments

  if (paired.danglingIn !== null) {
    if (segments.length === 0 && policy.singlePunchMode && dayEnd !== null) {
      // In modalità timbratura singola l'uscita non esiste: vale la fine giornata.
      segments = [{ start: paired.danglingIn, end: Math.max(dayEnd, paired.danglingIn) }]
      steps.push(
        `Timbratura singola: la giornata si chiude d'ufficio alle ${formatMinutes(dayEnd)}.`
      )
    } else {
      warnings.push('USCITA_MANCANTE')
      if (segments.length === 0) {
        return emptyDay(warnings, ['Entrata senza uscita: nessuna ora riconosciuta.'])
      }
      steps.push(
        `Entrata delle ${formatMinutes(paired.danglingIn)} senza uscita: quel turno non si conta.`
      )
    }
  }

  segments = segments.filter((s) => s.end > s.start)
  if (segments.length === 0) {
    warnings.push('FUORI_FINESTRA')
    return emptyDay(warnings, [...steps, "L'uscita precede l'entrata: nessuna ora riconosciuta."])
  }

  if (segments.length === 1) {
    steps.push(
      `Timbrature: entrata ${formatMinutes(segments[0].start)}, uscita ${formatMinutes(segments[0].end)}.`
    )
  } else {
    steps.push(
      'Turni timbrati: ' +
        segments
          .map((s) => `${formatMinutes(s.start)}-${formatMinutes(s.end)}`)
          .join(', ') +
        '.'
    )
  }

  // La pausa iniziata e mai chiusa NON viene dedotta: le ore restano quelle
  // di prima. È una decisione di prodotto presa da chi paga gli stipendi —
  // nessuno viene pagato di meno per una dimenticanza — e per questo il
  // motore non tocca il calcolo. Cambia che il dato incompleto si dichiara:
  // la giornata alza un avviso, e su quell'avviso l'export delle paghe si
  // rifiuta di partire finché un umano non ha guardato. Prima l'ora regalata
  // passava muta fino al consulente del lavoro.
  if (paired.danglingBreaks.length > 0) {
    warnings.push('PAUSA_NON_CHIUSA')
    const orari = paired.danglingBreaks.map(formatMinutes).join(', ')
    steps.push(
      `Pausa iniziata alle ${orari} e mai chiusa: le ore restano quelle ` +
        "timbrate, ma la giornata va verificata prima dell'export."
    )
  }

  if (policy.useShiftAsWindow) {
    // La giornata segue il turno pianificato. Senza turno pianificato le ore
    // sono quelle timbrate: l'extra chiamato all'ultimo non deve perdere
    // nulla per un difetto di pianificazione.
    const applied = applyShiftWindows(
      segments,
      context.shiftWindows ?? [],
      policy,
      context.shiftReview ?? {},
      steps,
      warnings
    )

    if (applied.segments.length === 0) {
      return emptyDay(
        warnings,
        [...steps, 'Nessuna ora riconosciuta.'],
        applied.pendingReviewMinutes
      )
    }

    return finishDay(
      applied.segments,
      paired.punchedBreaks,
      policy,
      context,
      steps,
      warnings,
      applied.pendingReviewMinutes
    )
  }

  // Finestra della giornata, allargata dalla flessibilità. Se la regola non ne
  // definisce una, si contano le ore così come sono state timbrate.
  const hasWindow = dayStart !== null && dayEnd !== null
  if (hasWindow) {
    const windowStart = dayStart! - policy.flexMinutes
    const windowEnd = dayEnd! + policy.flexMinutes
    const clipped = segments
      .map((s) => ({
        start: Math.max(s.start, windowStart),
        end: Math.min(s.end, windowEnd),
      }))
      .filter((s) => s.end > s.start)

    const clippedChanged =
      clipped.length !== segments.length ||
      clipped.some((s, i) => s.start !== segments[i].start || s.end !== segments[i].end)

    if (clippedChanged) {
      warnings.push('FUORI_FINESTRA')
      if (clipped.length > 0) {
        steps.push(
          `Finestra della giornata con flessibilità di ${policy.flexMinutes} min: ` +
            `si conta da ${formatMinutes(clipped[0].start)} a ${formatMinutes(clipped[clipped.length - 1].end)}.`
        )
      }
    }

    if (clipped.length === 0) {
      return emptyDay(warnings, [...steps, 'Nessuna ora dentro la finestra della giornata.'])
    }

    segments = clipped
  }

  // Arrotondamenti: l'entrata di ogni turno sale, l'uscita di ogni turno
  // scende. In un turno spezzato anche la seconda entrata in ritardo si
  // arrotonda, non solo la prima della giornata.
  segments = segments.map((s) => {
    const roundedIn = roundEntry(s.start, policy.entryRounding)
    const roundedOut = roundExit(s.end, policy.exitRounding)

    if (roundedIn !== s.start) {
      steps.push(
        `Arrotondamento entrata: ${formatMinutes(s.start)} diventa ${formatMinutes(roundedIn)}.`
      )
    }
    if (roundedOut !== s.end) {
      steps.push(
        `Arrotondamento uscita: ${formatMinutes(s.end)} diventa ${formatMinutes(roundedOut)}.`
      )
    }

    return { start: roundedIn, end: Math.max(roundedOut, roundedIn) }
  })

  return finishDay(segments, paired.punchedBreaks, policy, context, steps, warnings)
}

/**
 * La parte del calcolo comune a tutte le finestre: pause, ora legale, tetto,
 * notturne e classificazione. Riceve i turni già ritagliati e arrotondati.
 */
function finishDay(
  segments: Interval[],
  punchedBreaks: Interval[],
  policy: PolicyRules,
  context: DayContext,
  steps: string[],
  warnings: DayWarning[],
  pendingReviewMinutes = 0
): RecognizedDay {
  const grossMinutes = segments.reduce((sum, s) => sum + (s.end - s.start), 0)

  // Pause timbrate, limitate alla parte dentro l'orario di lavoro.
  const punchedBreakMinutes = punchedBreaks.reduce(
    (sum, b) => sum + overlapWithSegments(b.start, b.end, segments),
    0
  )
  let breakMinutes = punchedBreakMinutes
  if (punchedBreakMinutes > 0) {
    steps.push(`Pause timbrate: ${punchedBreakMinutes} min.`)
  }

  // Pausa pranzo dedotta dalla regola, se nessuna pausa timbrata la copre.
  // Una pausa timbrata "copre" il pranzo solo se interseca la sua finestra:
  // il caffè delle 10:00 non è la pausa pranzo.
  if (policy.lunch) {
    const lunchWindow = placeBreakWindow(
      policy.lunch.startMinutes,
      policy.lunch.endMinutes,
      segments
    )
    const coveredByPunched = overlapWithPunchedBreaks(
      lunchWindow.start,
      lunchWindow.end,
      punchedBreaks,
      segments
    )

    if (coveredByPunched === 0) {
      const lunchMinutes = overlapWithSegments(lunchWindow.start, lunchWindow.end, segments)
      if (lunchMinutes > 0) {
        breakMinutes += lunchMinutes
        warnings.push('PAUSA_PRANZO_NON_TIMBRATA')
        steps.push(`Pausa pranzo non timbrata: dedotti ${lunchMinutes} min dalla regola.`)
      }
    }
  }

  // Pause aggiuntive della regola: si deduce solo la parte non già coperta da
  // una pausa timbrata, altrimenti gli stessi minuti si toglierebbero due volte.
  for (const extra of policy.extraBreaks) {
    const window = placeBreakWindow(extra.startMinutes, extra.endMinutes, segments)
    const inWork = overlapWithSegments(window.start, window.end, segments)
    const alreadyPunched = overlapWithPunchedBreaks(
      window.start,
      window.end,
      punchedBreaks,
      segments
    )
    const extraMinutes = Math.max(0, inWork - alreadyPunched)

    if (extraMinutes > 0) {
      breakMinutes += extraMinutes
      steps.push(`Pausa "${extra.name}": dedotti ${extraMinutes} min.`)
    }
  }

  // Lo scarto dell'ora legale si toglie qui: l'ora che il 29 marzo non è mai
  // esistita non va pagata, quella che il 25 ottobre si ripete sì.
  const dstShift = context.dstShiftMinutes ?? 0
  if (dstShift !== 0) {
    steps.push(
      dstShift > 0
        ? `Cambio d'ora: l'orologio è andato avanti di ${dstShift} min, che non sono lavoro.`
        : `Cambio d'ora: l'orologio è tornato indietro di ${-dstShift} min, lavorati davvero.`
    )
  }

  let workedMinutes = Math.max(0, grossMinutes - breakMinutes - dstShift)

  // Tetto giornaliero.
  let cappedMinutes = 0
  if (policy.maxDailyMinutes !== null && workedMinutes > policy.maxDailyMinutes) {
    cappedMinutes = workedMinutes - policy.maxDailyMinutes
    workedMinutes = policy.maxDailyMinutes
    warnings.push('OLTRE_TETTO_GIORNALIERO')
    steps.push(`Tetto giornaliero: non conteggiati ${cappedMinutes} min.`)
  }

  // Ore notturne, in proporzione alla parte di intervallo effettivamente
  // lavorata: le pause riducono le ore, non solo quelle diurne. Il salto
  // dell'ora legale avviene fra le 02:00 e le 03:00, quindi sempre dentro la
  // fascia notturna, e va scontato anche qui.
  const nightClockMinutes = Math.max(
    0,
    segments.reduce((sum, s) => sum + nightMinutesIn(s.start, s.end), 0) - dstShift
  )
  const netGrossMinutes = Math.max(0, grossMinutes - dstShift)
  const proratedNightMinutes =
    netGrossMinutes > 0
      ? Math.round((nightClockMinutes * workedMinutes) / netGrossMinutes)
      : 0

  // Classificazione. Ogni minuto sta in una sola categoria — la somma delle
  // quattro dà sempre le ore lavorate — e quando un minuto ne meriterebbe due
  // vince quella pagata meglio: festive, poi straordinario, poi notturne,
  // poi ordinarie.
  const isHoliday = context.isHoliday || context.weekday === 0
  const isSaturdayOvertime = policy.saturdayAsOvertime && context.weekday === 6

  let overtimeMinutes = 0
  let holidayMinutes = 0

  if (isHoliday) {
    holidayMinutes = workedMinutes
    steps.push('Giorno festivo: tutte le ore sono festive.')
  } else if (isSaturdayOvertime) {
    overtimeMinutes = workedMinutes
    steps.push('Sabato conteggiato interamente come straordinario.')
  } else {
    const contract = policy.contractDailyMinutes ?? workedMinutes
    overtimeMinutes = Math.max(0, workedMinutes - contract)
  }

  const nightMinutes = Math.min(
    proratedNightMinutes,
    workedMinutes - overtimeMinutes - holidayMinutes
  )
  const ordinaryMinutes = workedMinutes - overtimeMinutes - holidayMinutes - nightMinutes

  steps.push(
    `Ore riconosciute: ${formatMinutes(workedMinutes)} ` +
      `(${workedMinutes} min, di cui ${nightMinutes} notturni).`
  )

  return {
    clockIn: segments[0].start,
    clockOut: segments[segments.length - 1].end,
    workedMinutes,
    ordinaryMinutes,
    overtimeMinutes,
    nightMinutes,
    holidayMinutes,
    breakMinutes,
    cappedMinutes,
    pendingReviewMinutes,
    steps,
    warnings,
  }
}

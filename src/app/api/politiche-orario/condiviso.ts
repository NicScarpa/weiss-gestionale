/**
 * Simboli condivisi fra `politiche-orario/route.ts` e la sua route figlia.
 *
 * Stanno qui e non nella route perché Next genera il validatore dei tipi solo
 * per i moduli `route.ts` che esportano *soltanto* handler: un export in più e
 * il type check del build fallisce con
 * «Property '<nome>' is incompatible with index signature» (TS2344), oppure —
 * peggio — la route resta senza controllo sulla firma degli handler.
 */

/** Le regole orario decidono le ore pagate di tutti: solo admin e manager. */
export const RUOLI_REGOLE = ['admin', 'manager'] as const

/** Campi restituiti al client, uguali in lista e in dettaglio. */
export const politicaSelect = {
  id: true,
  name: true,
  isDefault: true,
  isActive: true,
  dayStartMinutes: true,
  dayEndMinutes: true,
  lunchStartMinutes: true,
  lunchEndMinutes: true,
  flexMinutes: true,
  roundingMinutes: true,
  roundingToleranceMinutes: true,
  roundingOutMinutes: true,
  roundingOutToleranceMinutes: true,
  maxDailyMinutes: true,
  contractWeeklyHours: true,
  saturdayAsOvertime: true,
  blockSunday: true,
  singlePunchMode: true,
  useShiftAsWindow: true,
  createdAt: true,
  updatedAt: true,
  extraBreaks: {
    select: { id: true, name: true, startMinutes: true, endMinutes: true },
    orderBy: { startMinutes: 'asc' },
  },
  // Il conteggio deve combaciare con la guardia dell'eliminazione, che conta
  // dipendenti E luoghi: mostrare solo i dipendenti fa cercare assegnazioni
  // che non esistono.
  _count: { select: { users: true, workLocations: true } },
} as const

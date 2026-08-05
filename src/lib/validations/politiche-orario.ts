import { z } from 'zod'

/**
 * Validazione delle regole orario.
 *
 * Gli orari sono minuti dalla mezzanotte (0-1439). Non si usa una stringa
 * "HH:mm" perché il valore va confrontato e sommato, e ogni conversione in
 * `Date` riapre la porta agli errori di fuso.
 */

const minuteOfDay = z
  .number()
  .int('I minuti devono essere un numero intero')
  .min(0, 'Orario non valido')
  .max(1439, 'Orario non valido')

const pausaSchema = z
  .object({
    name: z.string().min(1, 'Il nome della pausa è obbligatorio').max(40),
    startMinutes: minuteOfDay,
    endMinutes: minuteOfDay,
  })
  .refine((p) => p.endMinutes > p.startMinutes, {
    message: 'La pausa deve finire dopo il suo inizio',
    path: ['endMinutes'],
  })

export const politicaOrarioSchema = z
  .object({
    name: z.string().min(1, 'Il nome è obbligatorio').max(80),
    isDefault: z.boolean().default(false),
    isActive: z.boolean().default(true),
    dayStartMinutes: minuteOfDay,
    dayEndMinutes: minuteOfDay,
    lunchStartMinutes: minuteOfDay.nullable().default(null),
    lunchEndMinutes: minuteOfDay.nullable().default(null),
    lunchWindowMinutes: z.number().int().min(0).max(240).default(0),
    flexMinutes: z.number().int().min(0).max(240).default(0),
    roundingMinutes: z.number().int().min(1).max(120).default(1),
    roundingToleranceMinutes: z.number().int().min(0).max(120).default(0),
    roundingOutMinutes: z.number().int().min(1).max(120).nullable().default(null),
    roundingOutToleranceMinutes: z
      .number()
      .int()
      .min(0)
      .max(120)
      .nullable()
      .default(null),
    maxDailyMinutes: z.number().int().min(60).max(1440).nullable().default(null),
    contractWeeklyHours: z.number().min(1).max(80).nullable().default(null),
    saturdayAsOvertime: z.boolean().default(false),
    blockSunday: z.boolean().default(false),
    singlePunchMode: z.boolean().default(false),
    extraBreaks: z.array(pausaSchema).max(5).default([]),
  })
  .refine(
    (p) =>
      (p.lunchStartMinutes === null) === (p.lunchEndMinutes === null),
    {
      message: 'Indica sia inizio sia fine della pausa pranzo, oppure nessuno dei due',
      path: ['lunchEndMinutes'],
    }
  )
  .refine(
    (p) =>
      p.lunchStartMinutes === null ||
      p.lunchEndMinutes === null ||
      p.lunchEndMinutes > p.lunchStartMinutes,
    {
      message: 'La pausa pranzo deve finire dopo il suo inizio',
      path: ['lunchEndMinutes'],
    }
  )
  .refine((p) => p.roundingToleranceMinutes < p.roundingMinutes || p.roundingMinutes === 1, {
    message: "La tolleranza deve essere minore dell'intervallo di arrotondamento",
    path: ['roundingToleranceMinutes'],
  })

export type PoliticaOrarioInput = z.infer<typeof politicaOrarioSchema>

/**
 * Ingresso del calcolatore di prova: una regola ancora non salvata più gli
 * orari da simulare. Serve a far vedere il risultato prima di confermare, che
 * con cinque parametri di arrotondamento è l'unico modo per capirli.
 */
export const provaCalcoloSchema = z.object({
  policy: politicaOrarioSchema,
  clockInMinutes: z.number().int().min(0).max(2879),
  clockOutMinutes: z.number().int().min(0).max(2879),
  breakStartMinutes: z.number().int().min(0).max(2879).nullable().default(null),
  breakEndMinutes: z.number().int().min(0).max(2879).nullable().default(null),
  /** 0 = domenica. Per provare le regole del sabato e dei festivi. */
  weekday: z.number().int().min(0).max(6).default(3),
  isHoliday: z.boolean().default(false),
})

export type ProvaCalcoloInput = z.infer<typeof provaCalcoloSchema>

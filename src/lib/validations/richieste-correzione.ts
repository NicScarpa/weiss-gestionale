import { z } from 'zod'

/**
 * Validazione delle richieste di correzione timbrature.
 *
 * Gli orari viaggiano come minuti dalla mezzanotte italiana del giorno
 * richiesto, come nel motore delle regole: oltre 1440 significa dopo la
 * mezzanotte (l'uscita alle 02:00 di un turno serale è il minuto 1560).
 * La conversione in istanti avviene sul server, in un punto solo.
 */

const minutoDellaGiornata = z
  .number()
  .int('I minuti devono essere un numero intero')
  .min(0, 'Orario non valido')
  .max(2879, 'Orario non valido')

export const richiestaCorrezioneSchema = z
  .object({
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data non valida: usare il formato AAAA-MM-GG'),
    requestedClockInMinutes: minutoDellaGiornata.nullable().default(null),
    requestedClockOutMinutes: minutoDellaGiornata.nullable().default(null),
    workLocationId: z.string().min(1).nullable().default(null),
    reason: z
      .string()
      .min(1, 'Il motivo è obbligatorio')
      .max(500, 'Il motivo non può superare i 500 caratteri'),
    anomalyId: z.string().min(1).nullable().default(null),
  })
  .refine(
    (r) =>
      r.requestedClockInMinutes !== null || r.requestedClockOutMinutes !== null,
    {
      message: "Indica almeno un orario, l'entrata o l'uscita",
      path: ['requestedClockInMinutes'],
    }
  )
  .refine(
    (r) =>
      r.requestedClockInMinutes === null ||
      r.requestedClockOutMinutes === null ||
      r.requestedClockOutMinutes > r.requestedClockInMinutes,
    {
      message: "L'uscita deve essere successiva all'entrata",
      path: ['requestedClockOutMinutes'],
    }
  )

export type RichiestaCorrezioneInput = z.infer<typeof richiestaCorrezioneSchema>

export const rifiutoCorrezioneSchema = z.object({
  reviewNotes: z
    .string()
    .min(1, 'Il motivo del rifiuto è obbligatorio: chi ha chiesto deve capire perché')
    .max(500),
})

export const approvazioneCorrezioneSchema = z.object({
  reviewNotes: z.string().max(500).nullable().default(null),
})

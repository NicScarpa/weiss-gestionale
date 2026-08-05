import { z } from 'zod'

/**
 * Validazione dei promemoria di timbratura.
 *
 * L'orario è in minuti dalla mezzanotte italiana, come nelle regole orario:
 * una stringa "HH:mm" andrebbe riconvertita a ogni confronto, e ogni
 * conversione in `Date` riapre la porta agli errori di fuso.
 */
export const promemoriaTimbraturaSchema = z.object({
  name: z.string().min(1, 'Il nome è obbligatorio').max(80),
  punchType: z.enum(['IN', 'OUT'], {
    message: 'Il promemoria vale per l\'entrata o per l\'uscita',
  }),
  timeMinutes: z
    .number()
    .int('I minuti devono essere un numero intero')
    .min(0, 'Orario non valido')
    .max(1439, 'Orario non valido'),
  daysOfWeek: z
    .array(z.number().int().min(0, 'Giorno non valido').max(6, 'Giorno non valido'))
    .min(1, 'Scegli almeno un giorno della settimana')
    .refine((giorni) => new Set(giorni).size === giorni.length, {
      message: 'Lo stesso giorno è indicato più di una volta',
    }),
  skipIfPunched: z.boolean().default(true),
  title: z.string().min(1, 'Il titolo della notifica è obbligatorio').max(80),
  body: z.string().min(1, 'Il testo della notifica è obbligatorio').max(200),
  isActive: z.boolean().default(true),
  /**
   * Nessun destinatario esplicito significa "tutto l'organico con il portale
   * attivo": è il caso normale, e tenerlo come lista vuota evita di dover
   * riscrivere i destinatari a ogni assunzione.
   */
  recipientIds: z.array(z.string().min(1)).default([]),
})

export type PromemoriaTimbraturaInput = z.infer<typeof promemoriaTimbraturaSchema>

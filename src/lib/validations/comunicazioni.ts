import { z } from 'zod'

/**
 * Validazione delle comunicazioni aziendali (la bacheca del portale).
 *
 * Le date viaggiano come giorno civile `AAAA-MM-GG`: chi scrive ragiona in
 * giornate ("scade il 10"), non in istanti. La conversione in timestamp
 * avviene sul server, in un punto solo, così la scadenza copre tutto il
 * giorno indicato nel fuso italiano.
 */

const giornoCivile = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data non valida: usare il formato AAAA-MM-GG')

export const comunicazioneSchema = z.object({
  title: z
    .string()
    .min(1, 'Il titolo è obbligatorio')
    .max(120, 'Il titolo non può superare i 120 caratteri'),
  message: z
    .string()
    .min(1, 'Il messaggio è obbligatorio')
    .max(2000, 'Il messaggio non può superare i 2000 caratteri'),
  priority: z.enum(['NORMAL', 'IMPORTANT', 'URGENT']).default('NORMAL'),
  eventDate: giornoCivile.nullable().default(null),
  expiresAt: giornoCivile.nullable().default(null),
  /**
   * Nomi dei ruoli destinatari — gli stessi che stanno in `Role.name` e nella
   * sessione. Array vuoto = tutti.
   */
  targetRoles: z.array(z.string().min(1)).default([]),
})

export type ComunicazioneInput = z.infer<typeof comunicazioneSchema>

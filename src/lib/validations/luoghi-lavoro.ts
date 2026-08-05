import { z } from 'zod'

/**
 * Validazione dei luoghi di lavoro.
 *
 * Le coordinate sono facoltative: un luogo può esistere prima che se ne sappia
 * la posizione esatta, e chi vi lavora dichiara le ore invece di timbrare. Se
 * però ce n'è una, ci devono essere entrambe — una latitudine senza longitudine
 * non individua niente.
 */

export const luogoLavoroSchema = z
  .object({
    name: z.string().min(1, 'Il nome è obbligatorio').max(80),
    address: z.string().max(200).nullable().default(null),
    latitude: z.number().min(-90).max(90).nullable().default(null),
    longitude: z.number().min(-180).max(180).nullable().default(null),
    geofenceRadiusMeters: z
      .number()
      .int()
      .min(10, 'Un raggio sotto i 10 metri renderebbe la timbratura impossibile')
      .max(5000)
      .default(100),
    isActive: z.boolean().default(true),
    timekeepingPolicyId: z.string().nullable().default(null),
  })
  .refine((l) => (l.latitude === null) === (l.longitude === null), {
    message: 'Indica entrambe le coordinate, oppure nessuna',
    path: ['longitude'],
  })

export type LuogoLavoroInput = z.infer<typeof luogoLavoroSchema>

export const assegnazioneLuogoSchema = z.object({
  userId: z.string().min(1, 'Dipendente obbligatorio'),
  trackingMode: z.enum(['GPS_GEOFENCE', 'MANUAL_HOURS', 'VIEW_ONLY']),
})

export type AssegnazioneLuogoInput = z.infer<typeof assegnazioneLuogoSchema>

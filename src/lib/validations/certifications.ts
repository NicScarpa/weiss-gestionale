/**
 * Schemi Zod per validazione certificazioni dipendenti
 */
import { z } from 'zod'

const certificationTypeEnum = z.enum([
  'HACCP',
  'SICUREZZA',
  'ANTINCENDIO',
  'PRIMO_SOCCORSO',
  'PREPOSTO',
])

/**
 * Schema per creazione certificazione
 */
export const CreateCertificationSchema = z
  .object({
    type: certificationTypeEnum,
    obtainedDate: z.string().min(1, 'Data conseguimento obbligatoria'),
    expiryDate: z.string().min(1, 'Data scadenza obbligatoria'),
    documentUrl: z.string().nullable().optional(),
  })
  .refine(
    (data) => {
      const obtained = new Date(data.obtainedDate)
      const expiry = new Date(data.expiryDate)
      return expiry > obtained
    },
    {
      message: 'La data di scadenza deve essere successiva alla data di conseguimento',
      path: ['expiryDate'],
    }
  )

/**
 * Schema per aggiornamento certificazione
 */
export const UpdateCertificationSchema = z
  .object({
    type: certificationTypeEnum.optional(),
    obtainedDate: z.string().optional(),
    expiryDate: z.string().optional(),
    documentUrl: z.string().nullable().optional(),
  })
  .refine(
    (data) => {
      if (data.obtainedDate && data.expiryDate) {
        const obtained = new Date(data.obtainedDate)
        const expiry = new Date(data.expiryDate)
        return expiry > obtained
      }
      return true
    },
    {
      message: 'La data di scadenza deve essere successiva alla data di conseguimento',
      path: ['expiryDate'],
    }
  )

export type CreateCertification = z.infer<typeof CreateCertificationSchema>
export type UpdateCertification = z.infer<typeof UpdateCertificationSchema>

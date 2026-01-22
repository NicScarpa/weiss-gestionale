/**
 * Schemi Zod per validazione utenti
 */
import { z } from 'zod'

/**
 * Schema per reset password
 */
export const ResetPasswordSchema = z.object({
  newPassword: z
    .string()
    .min(8, 'Password deve avere almeno 8 caratteri')
    .max(100)
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
      'Password deve contenere almeno una lettera minuscola, una maiuscola e un numero'
    ),
})

/**
 * Schema per cambio password
 */
export const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Password attuale richiesta'),
  newPassword: z
    .string()
    .min(8, 'Password deve avere almeno 8 caratteri')
    .max(100)
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
      'Password deve contenere almeno una lettera minuscola, una maiuscola e un numero'
    ),
})

/**
 * Schema per verifica password
 */
export const VerifyPasswordSchema = z.object({
  password: z.string().min(1, 'Password richiesta'),
})

/**
 * Schema per creazione utente
 */
export const CreateUserSchema = z.object({
  email: z.string().email('Email non valida'),
  name: z.string().min(1).max(100),
  password: z
    .string()
    .min(8, 'Password deve avere almeno 8 caratteri')
    .max(100)
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
      'Password deve contenere almeno una lettera minuscola, una maiuscola e un numero'
    ),
  roleId: z.string().uuid(),
  venueIds: z.array(z.string().uuid()).min(1, 'Almeno una sede richiesta'),
})

/**
 * Schema per aggiornamento utente
 */
export const UpdateUserSchema = z.object({
  email: z.string().email('Email non valida').optional(),
  name: z.string().min(1).max(100).optional(),
  roleId: z.string().uuid().optional(),
  venueIds: z.array(z.string().uuid()).optional(),
  active: z.boolean().optional(),
})

/**
 * Schema per query parametri lista utenti
 */
export const UserQuerySchema = z.object({
  search: z.string().max(100).optional(),
  roleId: z.string().uuid().optional(),
  venueId: z.string().uuid().optional(),
  active: z.coerce.boolean().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
})

export type ResetPassword = z.infer<typeof ResetPasswordSchema>
export type ChangePassword = z.infer<typeof ChangePasswordSchema>
export type VerifyPassword = z.infer<typeof VerifyPasswordSchema>
export type CreateUser = z.infer<typeof CreateUserSchema>
export type UpdateUser = z.infer<typeof UpdateUserSchema>
export type UserQuery = z.infer<typeof UserQuerySchema>

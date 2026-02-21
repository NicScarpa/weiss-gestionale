import { z } from 'zod'

export const passwordSchema = z.string()
  .min(10, 'Minimo 10 caratteri')
  .regex(/[A-Z]/, 'Almeno una maiuscola')
  .regex(/[a-z]/, 'Almeno una minuscola')
  .regex(/[0-9]/, 'Almeno un numero')
  .regex(/[^A-Za-z0-9]/, 'Almeno un carattere speciale')

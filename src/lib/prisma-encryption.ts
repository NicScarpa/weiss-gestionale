import { Prisma } from '@prisma/client'
import { encrypt, decrypt, isEncrypted } from './encryption'

/**
 * Map of model names to their sensitive fields that require encryption.
 * Fields: IBAN, codice fiscale, VAT number, salary-related fields.
 */
const SENSITIVE_FIELDS: Record<string, string[]> = {
  BankAccount: ['iban'],
  Supplier: ['fiscalCode', 'iban'],
  Customer: ['codiceFiscale', 'iban'],
  User: ['fiscalCode', 'vatNumber'],
  Schedule: ['controparteIban'],
  Payment: ['beneficiarioIban'],
  InvoiceDeadline: ['iban'],
}

function encryptFields(model: string, data: Record<string, unknown> | undefined): void {
  if (!data) return
  const fields = SENSITIVE_FIELDS[model]
  if (!fields) return

  for (const field of fields) {
    const value = data[field]
    if (typeof value === 'string' && value.length > 0 && !isEncrypted(value)) {
      data[field] = encrypt(value)
    }
  }
}

function decryptFields(model: string, record: Record<string, unknown> | null | undefined): void {
  if (!record) return
  const fields = SENSITIVE_FIELDS[model]
  if (!fields) return

  for (const field of fields) {
    const value = record[field]
    if (typeof value === 'string' && value.length > 0 && isEncrypted(value)) {
      try {
        record[field] = decrypt(value)
      } catch {
        // If decryption fails, leave value as-is (may be plaintext during migration)
      }
    }
  }
}

function decryptResult(model: string, result: unknown): void {
  if (!result) return
  if (Array.isArray(result)) {
    for (const item of result) {
      decryptFields(model, item as Record<string, unknown>)
    }
  } else if (typeof result === 'object') {
    decryptFields(model, result as Record<string, unknown>)
  }
}

/**
 * Prisma client extension that automatically encrypts sensitive fields
 * (IBAN, codice fiscale, VAT number) on write and decrypts on read.
 */
export const fieldEncryptionExtension = Prisma.defineExtension({
  query: {
    $allModels: {
      async create({ args, query, model }: { args: Record<string, unknown>; query: (args: Record<string, unknown>) => Promise<unknown>; model: string }) {
        if (SENSITIVE_FIELDS[model]) {
          encryptFields(model, args.data as Record<string, unknown>)
        }
        const result = await query(args)
        if (SENSITIVE_FIELDS[model]) {
          decryptResult(model, result)
        }
        return result
      },
      async createMany({ args, query, model }: { args: Record<string, unknown>; query: (args: Record<string, unknown>) => Promise<unknown>; model: string }) {
        if (SENSITIVE_FIELDS[model]) {
          const data = args.data
          if (Array.isArray(data)) {
            for (const item of data) {
              encryptFields(model, item as Record<string, unknown>)
            }
          } else {
            encryptFields(model, data as Record<string, unknown>)
          }
        }
        return query(args)
      },
      async update({ args, query, model }: { args: Record<string, unknown>; query: (args: Record<string, unknown>) => Promise<unknown>; model: string }) {
        if (SENSITIVE_FIELDS[model]) {
          encryptFields(model, args.data as Record<string, unknown>)
        }
        const result = await query(args)
        if (SENSITIVE_FIELDS[model]) {
          decryptResult(model, result)
        }
        return result
      },
      async updateMany({ args, query, model }: { args: Record<string, unknown>; query: (args: Record<string, unknown>) => Promise<unknown>; model: string }) {
        if (SENSITIVE_FIELDS[model]) {
          encryptFields(model, args.data as Record<string, unknown>)
        }
        return query(args)
      },
      async upsert({ args, query, model }: { args: Record<string, unknown>; query: (args: Record<string, unknown>) => Promise<unknown>; model: string }) {
        if (SENSITIVE_FIELDS[model]) {
          encryptFields(model, (args as Record<string, unknown>).create as Record<string, unknown>)
          encryptFields(model, (args as Record<string, unknown>).update as Record<string, unknown>)
        }
        const result = await query(args)
        if (SENSITIVE_FIELDS[model]) {
          decryptResult(model, result)
        }
        return result
      },
      async findUnique({ args, query, model }: { args: Record<string, unknown>; query: (args: Record<string, unknown>) => Promise<unknown>; model: string }) {
        const result = await query(args)
        if (SENSITIVE_FIELDS[model]) {
          decryptResult(model, result)
        }
        return result
      },
      async findFirst({ args, query, model }: { args: Record<string, unknown>; query: (args: Record<string, unknown>) => Promise<unknown>; model: string }) {
        const result = await query(args)
        if (SENSITIVE_FIELDS[model]) {
          decryptResult(model, result)
        }
        return result
      },
      async findMany({ args, query, model }: { args: Record<string, unknown>; query: (args: Record<string, unknown>) => Promise<unknown>; model: string }) {
        const result = await query(args)
        if (SENSITIVE_FIELDS[model]) {
          decryptResult(model, result)
        }
        return result
      },
    },
  },
})

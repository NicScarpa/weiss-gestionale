import { Prisma } from '@prisma/client'
import { encrypt, decrypt, isEncrypted, lookupHash } from './encryption'

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

/**
 * Campi cifrati che hanno una colonna hash deterministica affiancata
 * (HMAC-SHA256) per permettere ricerche di uguaglianza: la cifratura
 * AES-GCM con IV casuale rende il ciphertext non ricercabile.
 */
const HASH_FIELDS: Record<string, Record<string, string>> = {
  Supplier: { fiscalCode: 'fiscalCodeHash' },
  Customer: { codiceFiscale: 'codiceFiscaleHash' },
  BankAccount: { iban: 'ibanHash' },
}

/**
 * Mappa nome-relazione → modello, per decifrare anche i record annidati
 * restituiti dagli `include`. Copre le relazioni dei modelli sensibili.
 */
const RELATION_MODEL: Record<string, string> = {
  supplier: 'Supplier',
  suppliers: 'Supplier',
  bankAccount: 'BankAccount',
  bankAccounts: 'BankAccount',
  customer: 'Customer',
  customers: 'Customer',
  user: 'User',
  users: 'User',
  createdBy: 'User',
  updatedBy: 'User',
  employee: 'User',
  approvedBy: 'User',
  schedule: 'Schedule',
  schedules: 'Schedule',
  payment: 'Payment',
  payments: 'Payment',
  invoiceDeadline: 'InvoiceDeadline',
  invoiceDeadlines: 'InvoiceDeadline',
}

function encryptFields(model: string, data: Record<string, unknown> | undefined): void {
  if (!data) return
  const fields = SENSITIVE_FIELDS[model]
  if (!fields) return

  const hashMap = HASH_FIELDS[model]

  for (const field of fields) {
    const value = data[field]
    if (typeof value === 'string' && value.length > 0) {
      // Hash di lookup calcolato sul valore in chiaro, prima della cifratura
      if (hashMap?.[field] && !isEncrypted(value)) {
        data[hashMap[field]] = lookupHash(value)
      }
      if (!isEncrypted(value)) {
        data[field] = encrypt(value)
      }
    } else if (value === null && hashMap?.[field]) {
      // Campo azzerato → azzera anche l'hash
      data[hashMap[field]] = null
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

const MAX_DEPTH = 4

/**
 * Decifra il record del modello principale E le relazioni incluse
 * (annidate fino a MAX_DEPTH livelli), riconosciute per nome campo.
 */
function deepDecrypt(model: string | null, result: unknown, depth = 0): void {
  if (!result || depth > MAX_DEPTH) return

  if (Array.isArray(result)) {
    for (const item of result) deepDecrypt(model, item, depth)
    return
  }

  if (typeof result !== 'object') return
  const record = result as Record<string, unknown>

  if (model && SENSITIVE_FIELDS[model]) {
    decryptFields(model, record)
  }

  for (const [key, value] of Object.entries(record)) {
    if (value && typeof value === 'object') {
      const relModel = RELATION_MODEL[key] ?? null
      deepDecrypt(relModel, value, depth + 1)
    }
  }
}

function decryptResult(model: string, result: unknown): void {
  deepDecrypt(model, result)
}

type QueryArgs = { args: Record<string, unknown>; query: (args: Record<string, unknown>) => Promise<unknown>; model: string }

/**
 * Prisma client extension that automatically encrypts sensitive fields
 * (IBAN, codice fiscale, VAT number) on write and decrypts on read.
 * On write it also maintains the deterministic lookup-hash columns
 * (fiscalCodeHash, ibanHash) used for equality searches.
 */
export const fieldEncryptionExtension = Prisma.defineExtension({
  query: {
    $allModels: {
      async create({ args, query, model }: QueryArgs) {
        if (SENSITIVE_FIELDS[model]) {
          encryptFields(model, args.data as Record<string, unknown>)
        }
        const result = await query(args)
        decryptResult(model, result)
        return result
      },
      async createMany({ args, query, model }: QueryArgs) {
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
      async update({ args, query, model }: QueryArgs) {
        if (SENSITIVE_FIELDS[model]) {
          encryptFields(model, args.data as Record<string, unknown>)
        }
        const result = await query(args)
        decryptResult(model, result)
        return result
      },
      async updateMany({ args, query, model }: QueryArgs) {
        if (SENSITIVE_FIELDS[model]) {
          encryptFields(model, args.data as Record<string, unknown>)
        }
        return query(args)
      },
      async upsert({ args, query, model }: QueryArgs) {
        if (SENSITIVE_FIELDS[model]) {
          encryptFields(model, (args as Record<string, unknown>).create as Record<string, unknown>)
          encryptFields(model, (args as Record<string, unknown>).update as Record<string, unknown>)
        }
        const result = await query(args)
        decryptResult(model, result)
        return result
      },
      async findUnique({ args, query, model }: QueryArgs) {
        const result = await query(args)
        decryptResult(model, result)
        return result
      },
      async findUniqueOrThrow({ args, query, model }: QueryArgs) {
        const result = await query(args)
        decryptResult(model, result)
        return result
      },
      async findFirst({ args, query, model }: QueryArgs) {
        const result = await query(args)
        decryptResult(model, result)
        return result
      },
      async findFirstOrThrow({ args, query, model }: QueryArgs) {
        const result = await query(args)
        decryptResult(model, result)
        return result
      },
      async findMany({ args, query, model }: QueryArgs) {
        const result = await query(args)
        decryptResult(model, result)
        return result
      },
    },
  },
})

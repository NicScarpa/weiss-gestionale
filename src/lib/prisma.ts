import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import { fieldEncryptionExtension } from './prisma-encryption'

const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof createPrismaClient> | undefined
  pool: Pool | undefined
}

/**
 * Modelli con cancellazione logica: le loro righe non vengono mai rimosse,
 * viene valorizzato `deletedAt`. Aggiungere qui un modello significa che
 * TUTTE le letture lo filtrano automaticamente.
 */
export const SOFT_DELETE_MODELS = [
  'JournalEntry',
  'DailyClosure',
  'BankTransaction',
  'ElectronicInvoice',
  'Payment',
  'CashFlowForecast',
  'Budget',
  'Schedule',
] as const

type QueryHook = {
  args: Record<string, unknown>
  query: (args: Record<string, unknown>) => Promise<unknown>
  model: string
}

/** Aggiunge `deletedAt: null` alla where, se il chiamante non l'ha già specificato. */
function excludeDeleted({ args, query, model }: QueryHook) {
  if ((SOFT_DELETE_MODELS as readonly string[]).includes(model)) {
    const where = (args.where as Record<string, unknown>) || {}
    if (!('deletedAt' in where)) {
      args.where = { ...where, deletedAt: null }
    }
  }
  return query(args)
}

function createPrismaClient() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    // Supabase's pooler presents a chain signed by Supabase's private root CA,
    // which is not in Node's trust store: strict verification needs DATABASE_CA_CERT
    ssl: process.env.NODE_ENV === 'production'
      ? process.env.DATABASE_CA_CERT
        ? { ca: process.env.DATABASE_CA_CERT, rejectUnauthorized: true }
        : { rejectUnauthorized: true }
      : false,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  })
  const adapter = new PrismaPg(pool)
  const baseClient = new PrismaClient({ adapter })

  // Add field encryption extension for sensitive data (IBAN, fiscal code, etc.)
  const encryptedClient = baseClient.$extends(fieldEncryptionExtension)

  // Add soft delete extension - automatically filter deleted records.
  // Copre anche aggregate/groupBy: senza, i report sommerebbero i record cancellati.
  return encryptedClient.$extends({
    query: {
      $allModels: {
        findMany: excludeDeleted,
        findFirst: excludeDeleted,
        findFirstOrThrow: excludeDeleted,
        count: excludeDeleted,
        aggregate: excludeDeleted,
        groupBy: excludeDeleted,
        updateMany: excludeDeleted,
      },
    },
  })
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}

export default prisma

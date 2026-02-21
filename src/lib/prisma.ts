import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof createPrismaClient> | undefined
  pool: Pool | undefined
}

function createPrismaClient() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: true } : false,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  })
  const adapter = new PrismaPg(pool)
  const baseClient = new PrismaClient({ adapter })

  // Add soft delete extension - automatically filter deleted records
  return baseClient.$extends({
    query: {
      $allModels: {
        async findMany({ args, query, model }: { args: Record<string, unknown>; query: (args: Record<string, unknown>) => Promise<unknown>; model: string }) {
          const softDeleteModels = ['JournalEntry', 'DailyClosure', 'BankTransaction', 'ElectronicInvoice', 'Payment', 'CashFlowForecast', 'Budget', 'Schedule']
          if (softDeleteModels.includes(model)) {
            const where = (args.where as Record<string, unknown>) || {}
            if (!('deletedAt' in where)) {
              args.where = { ...where, deletedAt: null }
            }
          }
          return query(args)
        },
        async findFirst({ args, query, model }: { args: Record<string, unknown>; query: (args: Record<string, unknown>) => Promise<unknown>; model: string }) {
          const softDeleteModels = ['JournalEntry', 'DailyClosure', 'BankTransaction', 'ElectronicInvoice', 'Payment', 'CashFlowForecast', 'Budget', 'Schedule']
          if (softDeleteModels.includes(model)) {
            const where = (args.where as Record<string, unknown>) || {}
            if (!('deletedAt' in where)) {
              args.where = { ...where, deletedAt: null }
            }
          }
          return query(args)
        },
        async count({ args, query, model }: { args: Record<string, unknown>; query: (args: Record<string, unknown>) => Promise<unknown>; model: string }) {
          const softDeleteModels = ['JournalEntry', 'DailyClosure', 'BankTransaction', 'ElectronicInvoice', 'Payment', 'CashFlowForecast', 'Budget', 'Schedule']
          if (softDeleteModels.includes(model)) {
            const where = (args.where as Record<string, unknown>) || {}
            if (!('deletedAt' in where)) {
              args.where = { ...where, deletedAt: null }
            }
          }
          return query(args)
        },
      },
    },
  })
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}

export default prisma

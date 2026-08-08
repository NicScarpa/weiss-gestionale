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

/**
 * Aggiunge `deletedAt: null` alla where, se il chiamante non l'ha già specificato.
 *
 * Vale anche per i metodi che lavorano per chiave unica: da Prisma 5 la
 * `where` di `findUnique`, `update` e `delete` accetta filtri qualsiasi accanto
 * alla chiave (`Prisma.AtLeast<…>` nei tipi generati), quindi il filtro si
 * inietta nella query invece di scartare la riga dopo averla letta. È la
 * differenza fra chiedere al database la riga giusta e chiedergli quella
 * sbagliata per poi tacerla: con una `select` che non elenca `deletedAt` —
 * `select: { id: true, status: true }` — il record che torna non porta con sé
 * l'informazione per scartarlo, e il post-filtro non avrebbe di che decidere.
 */
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
  //
  // L'elenco copre ogni metodo che legge o scrive righe esistenti, e non solo
  // le ricerche per filtro: fino a che `findUnique` e `update` ne restavano
  // fuori, un record cancellato continuava a camminare dalla porta di servizio
  // — bastava conoscerne l'id per rileggerlo, modificarlo o cancellarlo.
  //
  // `update` e `delete` su una riga cancellata ora non trovano nulla e sollevano
  // P2025 come su una riga inesistente, che è la risposta giusta: il chiamante
  // ha in mano un record che non c'è più. Vale anche fra la lettura e la
  // scrittura, quindi la stessa condizione protegge dalle corse critiche.
  //
  // Restano fuori `upsert` (senza la riga viva creerebbe un duplicato e il
  // vincolo di unicità lo respingerebbe) e `deleteMany`: nessuno dei due è oggi
  // usato sui modelli con cancellazione logica.
  return encryptedClient.$extends({
    query: {
      $allModels: {
        findMany: excludeDeleted,
        findFirst: excludeDeleted,
        findFirstOrThrow: excludeDeleted,
        findUnique: excludeDeleted,
        findUniqueOrThrow: excludeDeleted,
        count: excludeDeleted,
        aggregate: excludeDeleted,
        groupBy: excludeDeleted,
        update: excludeDeleted,
        updateMany: excludeDeleted,
        delete: excludeDeleted,
      },
    },
  })
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}

export default prisma

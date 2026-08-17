// Rende ogni import di questo modulo da un componente client un errore di
// build che nomina il file colpevole, invece di scoprirlo a bundle rotto.
import 'server-only'

import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import { fieldEncryptionExtension } from './prisma-encryption'
import { opzioneTls } from './db-tls'

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
  'BankConnection',
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
    // TLS imposto in produzione, tranne verso un PostgreSQL sulla macchina
    // stessa: la politica, e il perché dell'eccezione, stanno in db-tls.ts.
    ssl: opzioneTls(process.env),
    // Deve restare SOTTO il limite del pooler, non sopra: la produzione parla
    // con Supabase attraverso il pooler in session mode (porta 5432), che
    // ammette quindici client. Con `max: 20` il pool apriva serenamente la
    // sedicesima connessione e si sentiva rispondere
    // «(EMAXCONNSESSION) max clients reached in session mode» — un errore che
    // non compare mai sotto carico normale, perché le connessioni aperte
    // insieme sono poche, e si presenta tutto in una volta al primo pezzo di
    // codice che interroga il database in parallelo.
    //
    // Dieci, non quindici: il margine serve alle migrazioni, agli script di
    // manutenzione e a una sessione psql aperta a mano, che pescano dallo
    // stesso contingente. Se un domani si passasse al pooler in transaction
    // mode (porta 6543) questo tetto andrebbe riletto, non ereditato.
    max: 10,
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

/**
 * Il client che si riceve dentro `prisma.$transaction`, e più in generale il
 * tipo da scrivere quando una funzione accetta «un client, dentro o fuori
 * transazione».
 *
 * Non è `Prisma.TransactionClient` di libreria: quello descrive il client
 * *nudo*, mentre qui il client è esteso — adapter più `$extends` per i
 * cancellati logici e i campi cifrati — e i due tipi non combaciano. Il
 * risultato è un errore che sembra assurdo, «manca `$on`», su una riga che
 * passa semplicemente `prisma`.
 *
 * Si ricava perciò dal client reale, togliendo i metodi che dentro una
 * transazione non esistono. `typeof prisma` è assegnabile a questo tipo,
 * quindi la stessa funzione accetta sia il client globale sia quello della
 * transazione — che è esattamente ciò che serve a chi la scrive.
 *
 * Viveva duplicato, identico, in `attendance/manual-punch.ts` e in
 * `services/allocation-service.ts`, e mancava dove sarebbe servito
 * altrettanto (`gocardless/dedup.ts`, che infatti non compilava sotto
 * `typecheck:test`). Sta qui perché è un fatto sul client, non su un dominio.
 */
export type TransactionClient = Omit<
  typeof prisma,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}

export default prisma

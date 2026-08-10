import { beforeAll, beforeEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { TEST_DB_PREFIX } from './env-guard'
import {
  SEED_BACKUP_SCHEMA,
  SEED_TABLES,
  SYSTEM_TABLES,
  quoteIdent,
  restoreSeedSql,
} from './seed-tables'

/**
 * Isolamento fra test di integrazione.
 *
 * L'isolamento *non* è fatto con una transazione da annullare a fine test:
 * quella tecnica serializzerebbe tutto su una connessione sola e nasconderebbe
 * proprio ciò che questi test devono verificare, cioè il comportamento delle
 * `$transaction` vere e della concorrenza. Qui, prima di ogni test, il database
 * viene svuotato e il seed rimesso al suo posto dalla copia preparata dal
 * global setup (vedi `seed-tables.ts` per il perché).
 */

type TableRow = { tablename: string }

/** Elenco delle tabelle da troncare, calcolato una volta per worker. */
let allTables: string[] | null = null

/**
 * Verifica di essere collegati a un database di test. È l'ultima rete di
 * protezione prima dei TRUNCATE: se qualcuno aggirasse il guard sull'ambiente,
 * qui la suite si ferma comunque.
 */
export async function assertTestDb(): Promise<void> {
  const rows = await prisma.$queryRawUnsafe<{ current_database: string }[]>(
    'SELECT current_database()'
  )
  const dbName = rows[0]?.current_database

  if (!dbName || !dbName.startsWith(TEST_DB_PREFIX)) {
    throw new Error(
      `I test di integrazione sono collegati al database "${dbName}", che non ` +
        `comincia per "${TEST_DB_PREFIX}". Interrotto prima di toccare i dati.`
    )
  }
}

async function loadTableList(): Promise<void> {
  const rows = await prisma.$queryRawUnsafe<TableRow[]>(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public'"
  )

  const skip = new Set<string>(SYSTEM_TABLES)
  allTables = rows.map((r) => r.tablename).filter((name) => !skip.has(name))

  const backup = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
    'SELECT COUNT(*)::bigint AS n FROM information_schema.tables WHERE table_schema = $1',
    SEED_BACKUP_SCHEMA
  )

  if (Number(backup[0]?.n ?? 0) < SEED_TABLES.length) {
    throw new Error(
      `Copia del seed assente nello schema "${SEED_BACKUP_SCHEMA}": il database ` +
        'di test non è stato preparato dal global setup. Rilancia la suite.'
    )
  }
}

/**
 * Riporta il database allo stato appena dopo il seed: nessun dato applicativo,
 * anagrafiche intatte.
 */
export async function resetDb(): Promise<void> {
  if (!allTables) {
    await loadTableList()
  }

  // Tutte le tabelle in un unico comando: elencandole tutte non serve CASCADE,
  // ed è CASCADE il motivo per cui non si possono salvare le tabelle del seed.
  const list = allTables!.map(quoteIdent).join(', ')
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY`)

  for (const statement of restoreSeedSql()) {
    await prisma.$executeRawUnsafe(statement)
  }
}

/** Numero di righe di una tabella: comodo per le asserzioni sugli effetti. */
export async function countRows(table: string): Promise<number> {
  const rows = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
    `SELECT COUNT(*)::bigint AS n FROM ${quoteIdent(table)}`
  )
  return Number(rows[0]?.n ?? 0)
}

/**
 * Da chiamare in cima a ogni file `.itest.ts`: verifica il database una volta e
 * lo riporta allo stato iniziale prima di ogni test.
 *
 * Non si chiama `useIntegrationDb` perché la regola `react-hooks/rules-of-hooks`
 * del progetto scambia qualunque funzione `use*` per un hook di React e boccia
 * ogni chiamata fuori da un componente.
 */
export function setupIntegrationDb(): void {
  beforeAll(async () => {
    await assertTestDb()
    await loadTableList()
  })

  beforeEach(async () => {
    await resetDb()
  })
}

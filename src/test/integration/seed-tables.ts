/**
 * Tabelle del seed e loro copia di sicurezza.
 *
 * Il reset fra un test e l'altro non può limitarsi a un `TRUNCATE ... CASCADE`
 * delle sole tabelle applicative: `users` ha una foreign key verso
 * `timekeeping_policies`, e CASCADE tronca *anche* le tabelle che referenziano
 * quelle elencate. Il seed sparirebbe al primo test.
 *
 * La soluzione è troncare tutto — seed compreso, così nessun vincolo protesta —
 * e reinserire subito le righe del seed da una copia conservata in uno schema a
 * parte dello stesso database. La copia si crea una volta sola sul database
 * template, quindi ogni clone per worker se la ritrova già pronta e il costo
 * per test è quello di otto `INSERT ... SELECT` su poche decine di righe.
 */

/** Schema che ospita la copia del seed. */
export const SEED_BACKUP_SCHEMA = 'itest_seed'

/**
 * Tabelle popolate dal seed, in ordine di dipendenza (madri prima delle
 * figlie): è l'ordine in cui vanno reinserite dopo il TRUNCATE.
 */
export const SEED_TABLES = [
  'venues',
  'roles',
  'permissions',
  'accounts',
  'users',
  'suppliers',
  'cash_station_templates',
  'role_permissions',
] as const

/** Tabelle tecniche che il reset non tocca mai. */
export const SYSTEM_TABLES = ['_prisma_migrations'] as const

export function quoteIdent(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`
}

/** SQL che crea da zero la copia del seed. Da eseguire sul database template. */
export function createSeedBackupSql(): string[] {
  return [
    `DROP SCHEMA IF EXISTS ${quoteIdent(SEED_BACKUP_SCHEMA)} CASCADE`,
    `CREATE SCHEMA ${quoteIdent(SEED_BACKUP_SCHEMA)}`,
    ...SEED_TABLES.map(
      (table) =>
        `CREATE TABLE ${quoteIdent(SEED_BACKUP_SCHEMA)}.${quoteIdent(table)} AS ` +
        `TABLE public.${quoteIdent(table)}`
    ),
  ]
}

/** SQL che riporta le tabelle del seed al contenuto originale. */
export function restoreSeedSql(): string[] {
  return SEED_TABLES.map(
    (table) =>
      `INSERT INTO public.${quoteIdent(table)} ` +
      `SELECT * FROM ${quoteIdent(SEED_BACKUP_SCHEMA)}.${quoteIdent(table)}`
  )
}

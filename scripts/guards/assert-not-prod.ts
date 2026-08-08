/**
 * Guard anti-produzione per i comandi distruttivi sul database.
 *
 * Il `.env` di questo progetto punta al database di produzione (Supabase): un
 * `prisma db push --force-reset` lanciato dalla macchina di sviluppo azzera i
 * dati reali. Il vecchio guard su `NODE_ENV === 'production'` non intercettava
 * nulla, perché in sviluppo `NODE_ENV` non vale mai `production` mentre
 * `DATABASE_URL` punta comunque alla produzione.
 *
 * Qui il criterio è l'unico che conta davvero: **dove punta DATABASE_URL**.
 * Passano solo gli host locali; tutto il resto è produzione finché non si
 * dichiara il contrario con `I_KNOW_THIS_IS_PROD=1`.
 *
 * Uso da riga di comando (esce con codice 1 se l'URL non è locale):
 *   tsx scripts/guards/assert-not-prod.ts && prisma db push
 *
 * Uso come modulo:
 *   import { assertNotProdOrExit } from '../scripts/guards/assert-not-prod'
 *   assertNotProdOrExit()
 */

// Allinea la vista del guard a quella di Prisma, che legge DATABASE_URL dal
// .env tramite prisma.config.ts. Le variabili già presenti nell'ambiente
// vincono sul file, esattamente come per Prisma.
import 'dotenv/config'

/** Host considerati sicuri: sono le uniche destinazioni non di produzione. */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1'])

/** Valore esatto richiesto per scavalcare il guard. */
const OVERRIDE_VALUE = '1'
const OVERRIDE_VAR = 'I_KNOW_THIS_IS_PROD'

export interface GuardEnv {
  DATABASE_URL?: string
  I_KNOW_THIS_IS_PROD?: string
}

export class ProductionGuardError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ProductionGuardError'
  }
}

/**
 * Estrae l'host da una connection string, `null` se non è interpretabile.
 * Passa dal parser URL e non da una ricerca testuale: una password che
 * contiene `@` o la parola `localhost` non deve poter camuffare l'host.
 */
export function extractHost(url: string): string | null {
  try {
    const { hostname } = new URL(url.trim())
    if (!hostname) return null
    // Gli indirizzi IPv6 arrivano fra parentesi quadre: `[::1]`.
    return hostname.replace(/^\[|\]$/g, '').toLowerCase()
  } catch {
    return null
  }
}

/**
 * `true` quando l'URL va trattato come produzione, cioè quando NON è
 * dimostrabilmente locale. Il dubbio conta come produzione: URL mancante,
 * vuoto o illeggibile blocca, così un errore di configurazione non si
 * trasforma in una scrittura sui dati reali.
 */
export function isProductionUrl(url: string | undefined | null): boolean {
  if (!url || url.trim() === '') return true

  // Rete di sicurezza: gli host gestiti da Supabase sono la produzione di
  // questo progetto e restano bloccati anche se il parsing andasse storto.
  if (/supabase\.(com|co|net|in)/i.test(url)) return true

  const host = extractHost(url)
  if (host === null) return true

  return !LOCAL_HOSTS.has(host)
}

/** `true` se l'ambiente dichiara esplicitamente di voler agire in produzione. */
export function hasProductionOverride(env: GuardEnv): boolean {
  return env[OVERRIDE_VAR] === OVERRIDE_VALUE
}

/** Testo mostrato quando il comando viene fermato. */
export function buildBlockedMessage(env: GuardEnv): string {
  const url = env.DATABASE_URL
  const host = url ? (extractHost(url) ?? '(illeggibile)') : '(DATABASE_URL non impostata)'
  const linea = '='.repeat(72)

  return [
    '',
    linea,
    '  COMANDO BLOCCATO: DATABASE_URL non punta a un database locale',
    linea,
    `  Host rilevato: ${host}`,
    '',
    '  Questo comando modifica o cancella dati e passano solo gli host locali:',
    `  ${[...LOCAL_HOSTS].join(', ')}.`,
    '',
    '  Come procedere:',
    '  1. per lavorare in locale, punta DATABASE_URL a un PostgreSQL locale,',
    '     ad esempio postgresql://utente@127.0.0.1:5432/weiss_dev',
    '  2. se invece vuoi davvero agire sul database remoto, dichiaralo:',
    `     ${OVERRIDE_VAR}=${OVERRIDE_VALUE} <comando>`,
    '',
    '  Prima di usare la scorciatoia al punto 2, assicurati di avere un backup',
    '  recente: su questo progetto il database remoto è la produzione.',
    linea,
    '',
  ].join('\n')
}

/**
 * Versione pura e testabile: lancia `ProductionGuardError` invece di
 * terminare il processo, così i test possono verificarla senza uccidersi.
 */
export function assertNotProd(env: GuardEnv): void {
  if (!isProductionUrl(env.DATABASE_URL)) return
  if (hasProductionOverride(env)) return
  throw new ProductionGuardError(buildBlockedMessage(env))
}

/**
 * Versione per gli script: stampa il motivo ed esce con codice 1.
 * Da usare in testa ai comandi distruttivi.
 */
export function assertNotProdOrExit(env: GuardEnv = process.env as GuardEnv): void {
  try {
    assertNotProd(env)
  } catch (error) {
    if (error instanceof ProductionGuardError) {
      console.error(error.message)
      process.exit(1)
    }
    throw error
  }

  if (hasProductionOverride(env) && isProductionUrl(env.DATABASE_URL)) {
    console.warn(
      `\nATTENZIONE: ${OVERRIDE_VAR}=${OVERRIDE_VALUE} — il comando agirà su ` +
        `${extractHost(env.DATABASE_URL ?? '') ?? 'un host remoto'}.\n`
    )
  }
}

// Eseguito come script (`tsx scripts/guards/assert-not-prod.ts`) esegue il
// controllo; importato come modulo non fa nulla finché non lo si chiama.
const invocato = process.argv[1] ?? ''
if (/assert-not-prod(\.[cm]?[jt]s)?$/.test(invocato)) {
  assertNotProdOrExit()
}

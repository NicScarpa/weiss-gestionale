import { prisma } from '@/lib/prisma'

/**
 * Conti "di sistema": ruoli fissi nel piano dei conti (es. banca, cassa,
 * transitori POS) individuati tramite accounts.system_key, non tramite
 * euristiche su code/name. CORRISPETTIVI è valorizzato solo dopo la
 * migrazione della FASE 3.
 */
export type SystemAccountKey =
  | 'CASSA'
  | 'BANCA'
  | 'POS_WORLDLINE'
  | 'POS_AXERVE'
  | 'POS_SUMUP'
  | 'DEBITI_FORNITORI'
  | 'CORRISPETTIVI'

async function trovaContoSistemaAttivo(key: SystemAccountKey) {
  const account = await prisma.account.findUnique({ where: { systemKey: key } })
  return account && account.isActive ? account : null
}

/** Un conto inattivo è trattato come assente: lancia se non configurato o disattivato. */
export async function getSystemAccount(key: SystemAccountKey) {
  const account = await trovaContoSistemaAttivo(key)
  if (!account) {
    throw new Error(`Conto di sistema ${key} non configurato: impostare accounts.system_key`)
  }
  return account
}

/** Come getSystemAccount, ma restituisce null invece di lanciare (per i fallback delle chiusure). */
export async function getSystemAccountOptional(key: SystemAccountKey) {
  return trovaContoSistemaAttivo(key)
}

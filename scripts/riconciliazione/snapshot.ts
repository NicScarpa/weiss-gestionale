/**
 * Lettura degli snapshot GoCardless dei movimenti bancari.
 *
 * Condiviso fra `misura-motore.ts` (offline, solo causali) e `misura-lotto.ts`
 * (carica i movimenti su un database di prova ed esegue `generaLotto`): prima
 * viveva copiato in entrambi, ora vive qui una volta sola.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

export const CARTELLA_SNAPSHOT = join(process.cwd(), 'scripts/gocardless/snapshots')

export interface MovimentoSnapshot {
  transactionId?: string
  internalTransactionId?: string
  entryReference?: string
  endToEndId?: string
  bookingDate?: string
  valueDate?: string
  transactionAmount?: { amount?: string; currency?: string }
  remittanceInformationUnstructured?: string
  remittanceInformationUnstructuredArray?: string[]
  proprietaryBankTransactionCode?: string
}

/**
 * Gli snapshot avvolgono la risposta: `risposta.corpo.transactions.{booked,pending}`.
 * La deduplicazione è su `internalTransactionId` e non su `transactionId`,
 * perché quest'ultimo **collide fra conti diversi** — 249 collisioni su 678
 * osservate nella Fase 0.
 */
export function leggiMovimenti(): MovimentoSnapshot[] {
  const file = readdirSync(CARTELLA_SNAPSHOT).filter((n) => n.includes('transactions'))
  const perChiave = new Map<string, MovimentoSnapshot>()

  for (const nome of file) {
    const contenuto = JSON.parse(readFileSync(join(CARTELLA_SNAPSHOT, nome), 'utf8'))
    const transazioni = contenuto?.risposta?.corpo?.transactions
    if (!transazioni) continue

    for (const chiave of ['booked', 'pending'] as const) {
      const elenco = transazioni[chiave]
      if (!Array.isArray(elenco)) continue
      for (const movimento of elenco) {
        const identita =
          movimento.internalTransactionId ?? `${nome}:${movimento.transactionId ?? ''}`
        perChiave.set(identita, movimento)
      }
    }
  }

  return [...perChiave.values()]
}

/** Il testo della causale, dalla forma unica o dall'array. */
export function causaleDi(movimento: MovimentoSnapshot): string {
  if (movimento.remittanceInformationUnstructured) {
    return movimento.remittanceInformationUnstructured
  }
  return (movimento.remittanceInformationUnstructuredArray ?? []).join(' ')
}

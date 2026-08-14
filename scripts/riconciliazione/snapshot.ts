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
 * L'elenco dei file di snapshot, o un errore che spiega perché non ci sono.
 *
 * **Gli snapshot non stanno nel repository, ed è voluto**: contengono movimenti
 * bancari veri di Banca Della Marca — importi, IBAN, ragioni sociali — quindi
 * `scripts/gocardless/snapshots/` è gitignorato. La conseguenza è che da un
 * checkout pulito questi script di misura non partono, e senza di essi i numeri
 * del README non sono riproducibili: vanno riottenuti, non dedotti.
 *
 * Senza questa guardia il fallimento era un ENOENT grezzo su una cartella, che
 * non dice niente di tutto questo.
 */
function elencaFileSnapshot(): string[] {
  try {
    return readdirSync(CARTELLA_SNAPSHOT)
  } catch (errore) {
    if ((errore as NodeJS.ErrnoException)?.code !== 'ENOENT') throw errore
    throw new Error(
      `Cartella degli snapshot assente: ${CARTELLA_SNAPSHOT}\n\n` +
        'Non è un guasto: gli snapshot GoCardless NON sono versionati, perché ' +
        'contengono movimenti bancari veri (importi, IBAN, ragioni sociali). Da ' +
        'un checkout pulito questa cartella non esiste.\n\n' +
        'Per riprodurre le misure si riscaricano con gli script della Fase 0 ' +
        'dell\'open banking in `scripts/gocardless/` (servono le credenziali ' +
        'GoCardless in `.env` e un collegamento bancario attivo).\n\n' +
        'Finché la cartella manca, i numeri riportati in ' +
        'scripts/riconciliazione/README.md restano dichiarati ma NON ' +
        'riproducibili in locale.'
    )
  }
}

/**
 * Gli snapshot avvolgono la risposta: `risposta.corpo.transactions.{booked,pending}`.
 * La deduplicazione è su `internalTransactionId` e non su `transactionId`,
 * perché quest'ultimo **collide fra conti diversi** — 249 collisioni su 678
 * osservate nella Fase 0.
 */
export function leggiMovimenti(): MovimentoSnapshot[] {
  const file = elencaFileSnapshot().filter((n) => n.includes('transactions'))
  if (file.length === 0) {
    // La cartella c'è ma è vuota: senza questa guardia la misurazione
    // proseguirebbe su zero movimenti e stamperebbe numeri plausibili e falsi.
    throw new Error(
      `Nessuno snapshot di movimenti in ${CARTELLA_SNAPSHOT}: la cartella esiste ` +
        'ma non contiene file "*transactions*.json". Vedi il commento su ' +
        '`elencaFileSnapshot` per come riottenerli.'
    )
  }
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

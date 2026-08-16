import type { TransactionClient } from '@/lib/prisma'
import { separaCausale } from './separa-causale'

// `TransactionClient`, non `PrismaClient` di `@prisma/client`: quello
// descrive il client *nudo*, mentre `prisma` è esteso ($extends per i
// cancellati logici e i campi cifrati), e i due tipi non combaciano — vedi il
// commento su `TransactionClient` in `src/lib/prisma.ts`. Con `PrismaClient`
// `tsc --noEmit -p tsconfig.test.json` boccia ogni `ricalcolaCausali(prisma)`
// del test con un errore che sembra assurdo su `bankTransaction.findUnique`.

/**
 * Applica `separaCausale` alle righe importate prima che i campi esistessero.
 *
 * Idempotente per costruzione: lavora solo le righe con `descrizione IS NULL`,
 * quindi la seconda esecuzione non trova nulla; e non passa mai sopra un
 * valore scritto dall'utente, perché una riga toccata dall'utente la
 * `descrizione` ce l'ha. Si lancia una volta in produzione dopo il deploy
 * della consegna A (script `scripts/banca/ricalcola-causali.ts`).
 */
export interface EsitoRicalcolo {
  esaminate: number
  aggiornate: number
  perCodice: Record<string, number>
}

const LOTTO = 500

/**
 * Due passate, righe vive e Cestino, con lo stesso `where` di base: il testo si
 * separa a prescindere da dove sta la riga. Servono due passate perché
 * l'estensione di `src/lib/prisma.ts` aggiunge `deletedAt: null` a ogni query
 * in cui la chiave manca; per leggere anche le righe cestinate la chiave va
 * scritta esplicitamente (`deletedAt: { not: null }`).
 */
export async function ricalcolaCausali(
  client: Pick<TransactionClient, 'bankTransaction'>,
  opzioni: { dryRun?: boolean } = {}
): Promise<EsitoRicalcolo> {
  const esito: EsitoRicalcolo = { esaminate: 0, aggiornate: 0, perCodice: {} }
  await ricalcolaLotti(client, { descrizione: null, deletedAt: null }, esito, opzioni)
  await ricalcolaLotti(client, { descrizione: null, deletedAt: { not: null } }, esito, opzioni)
  return esito
}

async function ricalcolaLotti(
  client: Pick<TransactionClient, 'bankTransaction'>,
  where: { descrizione: null; deletedAt: null | { not: null } },
  esito: EsitoRicalcolo,
  opzioni: { dryRun?: boolean }
): Promise<void> {
  // In prova nessuna riga cambia stato, quindi il cursore avanza; scrivendo,
  // le righe aggiornate escono dal `where` e si riparte sempre dall'inizio.
  let cursore: string | undefined
  for (;;) {
    const righe = await client.bankTransaction.findMany({
      where,
      select: { id: true, description: true, bankTransactionCode: true },
      orderBy: { id: 'asc' },
      take: LOTTO,
      ...(cursore ? { skip: 1, cursor: { id: cursore } } : {}),
    })
    if (righe.length === 0) break

    for (const riga of righe) {
      esito.esaminate++
      const { causale, descrizione } = separaCausale(riga.description, riga.bankTransactionCode)
      const codice = riga.bankTransactionCode ?? '(senza codice)'
      esito.perCodice[codice] = (esito.perCodice[codice] ?? 0) + 1
      esito.aggiornate++
      if (!opzioni.dryRun) {
        // `updateMany` con `deletedAt` esplicito: un `update({ where: { id } })`
        // riceverebbe `deletedAt: null` dall'estensione e sulle righe del
        // Cestino non troverebbe nulla (P2025).
        await client.bankTransaction.updateMany({
          where: { id: riga.id, deletedAt: where.deletedAt },
          data: { causale, descrizione },
        })
      }
    }
    if (opzioni.dryRun) {
      cursore = righe[righe.length - 1].id
      if (righe.length < LOTTO) break
    }
  }
}

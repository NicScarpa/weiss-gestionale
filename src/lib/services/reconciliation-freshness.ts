import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { TOLLERANZA } from '@/lib/reconciliation/punteggio'

/**
 * Il controllo di freschezza delle proposte conservate.
 *
 * Conservare le proposte serve — storico, "Riprendi", e il referto dell'AI che
 * altrimenti andrebbe ripagato a ogni apertura — ma una proposta conservata
 * invecchia: la scadenza può essere stata saldata da un pagamento manuale, il
 * movimento riconciliato altrove.
 *
 * CashKing conserva e basta, e ha dovuto aggiungere un contatore e un triangolo
 * di conflitto per rattoppare il problema a valle. Qui si ricontrolla prima che
 * l'utente veda qualcosa: una proposta che non può più essere approvata si
 * marca da sé come superata invece di mentire.
 *
 * Le proposte già decise non si toccano: la loro storia è chiusa.
 */

/** Stati in cui una proposta è ancora lavorabile. */
const STATI_APERTI = ['in_attesa']

/** Stati di scadenza che rendono la proposta impossibile. */
const STATI_SCADENZA_CHIUSI = ['pagata', 'annullata']

/**
 * Stati di movimento che rendono la proposta impossibile.
 *
 * `TO_REVIEW` **non** è fra questi: è la proposta del vecchio motore, che
 * scrive `matchedEntryId` senza che nessuno abbia confermato. Non è un legame
 * (spec dell'estratto conto, «Gli stati»), e infatti
 * `promuoviRigaBancariaInTransazione` tratta quella riga come libera.
 */
const STATI_MOVIMENTO_CHIUSI = ['MATCHED', 'MANUAL', 'IGNORED']

/**
 * Le due parti di una proposta, nella forma minima che serve a giudicarla.
 * Ogni `select` che porti almeno questi campi va bene: i campi in più non
 * disturbano.
 */
export interface PartiDellaProposta {
  bankTransaction: { status: string; deletedAt: Date | null } | null
  gambe: Array<{
    importo: Prisma.Decimal
    schedule: {
      stato: string
      importoTotale: Prisma.Decimal
      importoPagato: Prisma.Decimal
      deletedAt: Date | null
    } | null
  }>
}

/**
 * Perché la proposta non è più approvabile — la frase che l'utente legge —
 * oppure `null` se lo è ancora.
 *
 * Funzione pura: la usano sia la rilettura della coda (`aggiornaFreschezza`,
 * qui sotto) sia l'approvazione, che rifà lo stesso controllo dentro la
 * transazione. Due liste di stati scritte in due posti si sarebbero scollegate
 * al primo stato nuovo, e il difetto sarebbe stato invisibile: la coda avrebbe
 * mostrato approvabile ciò che l'approvazione rifiuta, o peggio il contrario.
 */
export function motivoSuperamento(proposta: PartiDellaProposta): string | null {
  const movimento = proposta.bankTransaction
  if (movimento) {
    if (movimento.deletedAt !== null) return 'Il movimento bancario è nel Cestino'
    if (STATI_MOVIMENTO_CHIUSI.includes(movimento.status)) {
      return 'Il movimento bancario è già stato riconciliato altrove'
    }
  }

  for (const gamba of proposta.gambe) {
    const scadenza = gamba.schedule
    if (!scadenza) continue
    if (scadenza.deletedAt !== null) return 'La scadenza è stata cancellata'
    if (STATI_SCADENZA_CHIUSI.includes(scadenza.stato)) return `La scadenza è ${scadenza.stato}`
    // Il residuo non basta più a coprire la quota che la proposta rivendica.
    // La tolleranza viene da `punteggio.ts`, dove vive per tutta la fase:
    // un centesimo scritto qui a mano si scollegherebbe dal resto al primo
    // ritocco.
    const residuo = Number(scadenza.importoTotale) - Number(scadenza.importoPagato)
    if (residuo + TOLLERANZA < Number(gamba.importo)) {
      return 'La scadenza non ha più residuo sufficiente per questa proposta'
    }
  }

  return null
}

export async function aggiornaFreschezza(batchId: string, venueId: string): Promise<number> {
  const proposte = await prisma.reconciliationProposal.findMany({
    where: {
      batchId,
      stato: { in: STATI_APERTI },
      batch: { venueId },
    },
    select: {
      id: true,
      bankTransaction: { select: { status: true, deletedAt: true } },
      gambe: {
        select: {
          importo: true,
          schedule: { select: { stato: true, importoTotale: true, importoPagato: true, deletedAt: true } },
        },
      },
    },
  })

  const daSuperare = proposte.filter((proposta) => motivoSuperamento(proposta) !== null).map((p) => p.id)

  if (daSuperare.length === 0) return 0

  await prisma.$transaction([
    prisma.reconciliationProposal.updateMany({
      where: { id: { in: daSuperare } },
      data: { stato: 'superata' },
    }),
    prisma.reconciliationBatch.update({
      where: { id: batchId },
      data: { contaSuperate: { increment: daSuperare.length } },
    }),
  ])

  return daSuperare.length
}

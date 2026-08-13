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

/** Stati di movimento che rendono la proposta impossibile. */
const STATI_MOVIMENTO_CHIUSI = ['MATCHED', 'MANUAL', 'IGNORED']

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

  const daSuperare: string[] = []

  for (const proposta of proposte) {
    const movimento = proposta.bankTransaction
    if (movimento && (movimento.deletedAt !== null || STATI_MOVIMENTO_CHIUSI.includes(movimento.status))) {
      daSuperare.push(proposta.id)
      continue
    }

    const gambaMorta = proposta.gambe.some((gamba) => {
      const scadenza = gamba.schedule
      if (!scadenza) return false
      if (scadenza.deletedAt !== null) return true
      if (STATI_SCADENZA_CHIUSI.includes(scadenza.stato)) return true
      // Il residuo non basta più a coprire la quota che la proposta rivendica.
      // La tolleranza viene da `punteggio.ts`, dove vive per tutta la fase:
      // un centesimo scritto qui a mano si scollegherebbe dal resto al primo
      // ritocco.
      const residuo = Number(scadenza.importoTotale) - Number(scadenza.importoPagato)
      return residuo + TOLLERANZA < Number(gamba.importo)
    })

    if (gambaMorta) daSuperare.push(proposta.id)
  }

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

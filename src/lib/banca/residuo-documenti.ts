import { Prisma } from '@prisma/client'
import type { TransactionClient } from '@/lib/prisma'

/**
 * Il residuo dei documenti di una riga collegata a una scrittura: |importo| −
 * Σ riconciliazioni, mai sotto zero, a due decimali. Senza riconciliazioni
 * vale 0: una riga categorizzata senza documenti è chiusa (spec, «Gli stati»),
 * e «Parzialmente abbinato» esiste solo quando qualche documento c'è ma non
 * copre tutto.
 */
export function calcolaResiduoDocumenti(amount: number, importiRiconciliati: number[]): number {
  if (importiRiconciliati.length === 0) return 0
  const coperto = importiRiconciliati.reduce((somma, x) => somma + x, 0)
  return Math.max(0, Math.round((Math.abs(amount) - coperto) * 100) / 100)
}

/**
 * Riscrive `residuoDocumenti` sulla riga di banca collegata alla scrittura, se
 * ce n'è una. Va chiamata DENTRO la transazione che ha appena creato o tolto
 * una riconciliazione, o collegato la riga: è l'unico modo perché la colonna
 * dica sempre ciò che dicono le riconciliazioni — la promozione non è l'unica
 * a scriverle, lo fa anche lo scadenzario su una scrittura promossa.
 *
 * Restituisce il residuo scritto, `null` se nessuna riga viva è collegata (una
 * riga nel Cestino non può esserlo: il Cestino rifiuta le righe collegate).
 */
export async function ricalcolaResiduoDocumenti(
  tx: TransactionClient,
  journalEntryId: string
): Promise<number | null> {
  const riga = await tx.bankTransaction.findFirst({
    where: { matchedEntryId: journalEntryId },
    select: { id: true, amount: true },
  })
  if (!riga) return null

  const riconciliazioni = await tx.scheduleReconciliation.findMany({
    where: { journalEntryId, status: 'VERIFIED' },
    select: { amount: true },
  })
  const residuo = calcolaResiduoDocumenti(
    Number(riga.amount),
    riconciliazioni.map((r) => Number(r.amount))
  )
  await tx.bankTransaction.update({
    where: { id: riga.id },
    data: { residuoDocumenti: new Prisma.Decimal(residuo.toFixed(2)) },
  })
  return residuo
}

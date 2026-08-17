import type { StatoLegenda } from '@/types/reconciliation'

/**
 * La legenda di CashKing sul nostro modello (spec, «Gli stati»): «abbinato»
 * vuol dire collegata a una scrittura, con o senza documenti; il residuo dei
 * documenti sta denormalizzato sulla riga (`residuoDocumenti`, consegna B) ed è
 * la stessa colonna che filtra «Solo non riconciliati» in SQL, così legenda,
 * filtro e conteggi dicono la stessa cosa. Pura.
 *
 * `status = TO_REVIEW` è una proposta del vecchio motore, che scrive
 * `matchedEntryId` senza che nessuno abbia confermato: non è un abbinamento, e
 * si segnala col puntino («c'è una proposta»).
 */
export function statoLegenda(r: {
  matchedEntryId: string | null
  status: string
  amount: number
  residuoDocumenti: number | null
}): { stato: StatoLegenda; residuo: number; proposta: boolean } {
  const proposta = r.status === 'TO_REVIEW'
  if (!r.matchedEntryId || proposta) {
    return { stato: 'non_abbinato', residuo: Math.abs(r.amount), proposta }
  }
  const residuo = r.residuoDocumenti ?? 0
  if (residuo > 0) return { stato: 'parziale', residuo, proposta: false }
  if (r.status === 'MANUAL') return { stato: 'abbinato_manualmente', residuo: 0, proposta: false }
  return { stato: 'riconciliato', residuo: 0, proposta: false }
}

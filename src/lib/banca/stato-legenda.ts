import type { StatoLegenda } from '@/types/reconciliation'

/**
 * La legenda di CashKing sul nostro modello (spec, «Gli stati»): «abbinato»
 * vuol dire collegata a una scrittura, con o senza documenti; il residuo è ciò
 * che i documenti non coprono. Pura, così la stessa regola vale per la lista,
 * il filtro e i conteggi.
 */
export function statoLegenda(r: {
  matchedEntryId: string | null
  status: string
  amount: number
  importiRiconciliati: number[]
}): { stato: StatoLegenda; residuo: number } {
  const coperto = r.importiRiconciliati.reduce((somma, x) => somma + x, 0)
  const residuo = Math.max(0, Math.round((Math.abs(r.amount) - coperto) * 100) / 100)
  if (!r.matchedEntryId) return { stato: 'non_abbinato', residuo }
  if (r.importiRiconciliati.length > 0 && residuo > 0) return { stato: 'parziale', residuo }
  if (r.status === 'MANUAL') return { stato: 'abbinato_manualmente', residuo: 0 }
  return { stato: 'riconciliato', residuo: 0 }
}

export interface FettaInput {
  accountId: string
  importo: number
}

/**
 * Riparte una quota proporzionalmente alle fette date, al centesimo.
 * La differenza di arrotondamento quadra sull'ultima fetta non nulla, così la
 * somma restituita è SEMPRE esattamente la quota. Pura: nessun accesso al DB.
 */
export function ripartisciProQuota(fette: FettaInput[], quota: number): FettaInput[] {
  const totale = fette.reduce((s, f) => s + f.importo, 0)
  if (totale <= 0 || quota <= 0) return []

  const out: FettaInput[] = []
  let residuo = Math.round(quota * 100)
  fette.forEach((f, i) => {
    const centesimi =
      i === fette.length - 1 ? residuo : Math.round((quota * f.importo * 100) / totale)
    residuo -= centesimi
    if (centesimi > 0) out.push({ accountId: f.accountId, importo: centesimi / 100 })
  })
  return out
}

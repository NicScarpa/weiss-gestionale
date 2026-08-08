// Copia INTEGRALE di ripartisciProQuota (src/lib/services/allocation-service.ts:17-30).
// Nessuna modifica: solo i tipi TypeScript rimossi.
function ripartisciProQuota(fette, quota) {
  const totale = fette.reduce((s, f) => s + f.importo, 0)
  if (totale <= 0 || quota <= 0) return []
  const out = []
  let residuo = Math.round(quota * 100)
  fette.forEach((f, i) => {
    const centesimi =
      i === fette.length - 1 ? residuo : Math.round((quota * f.importo * 100) / totale)
    residuo -= centesimi
    if (centesimi > 0) out.push({ accountId: f.accountId, importo: centesimi / 100 })
  })
  return out
}

function prova(nome, pesi, quota) {
  const fette = pesi.map((importo, k) => ({ accountId: 'conto' + (k + 1), importo }))
  const out = ripartisciProQuota(fette, quota)
  const somma = out.reduce((s, f) => s + f.importo, 0)
  console.log(`\n=== ${nome} ===`)
  console.log(`conti: ${pesi.length}   totale pesi: ${pesi.reduce((a, b) => a + b, 0).toFixed(2)}   quota: ${quota.toFixed(2)} €`)
  console.log(`fette restituite: ${out.length}  →  ${out.map(f => f.importo.toFixed(2)).join(' + ')}`)
  console.log(`somma fette: ${somma.toFixed(2)} €   quota: ${quota.toFixed(2)} €   SCARTO: ${((somma - quota) * 100).toFixed(0)} centesimi`)
}

// CASO 1 — minimo, verificabile a mano
// 9 conti di peso identico, quota 0,05 €.
// Ogni fetta esatta vale 5/9 = 0,555… cent → Math.round = 1 cent.
// Le prime 8 prendono 1 cent ciascuna = 8 cent, ma la quota era 5.
// residuo = 5 - 8 = -3 → l'ultima fetta vale -3 e `if (centesimi > 0)` LA SCARTA.
prova('CASO 1 — 9 conti uguali, quota 0,05 €', [1, 1, 1, 1, 1, 1, 1, 1, 1], 0.05)

// CASO 2 — il dataset della relazione, importi realistici
prova('CASO 2 — 11 conti, quota 731,34 € (quello della relazione)',
  [835.90, 830.73, 806.77, 719.39, 694.60, 547.51, 401.33, 219.16, 214.38, 105.97, 0.01], 731.34)

// CONTROPROVA — lo stesso identico caso senza la riga di coda da 0,01 €: quadra
prova('CONTROPROVA — gli stessi 10 conti SENZA la riga da 0,01 €',
  [835.90, 830.73, 806.77, 719.39, 694.60, 547.51, 401.33, 219.16, 214.38, 105.97], 731.34)

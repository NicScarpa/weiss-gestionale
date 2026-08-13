/**
 * Normalizzazione della partita IVA per il CONFRONTO, condivisa fra codice
 * server (import, verifica duplicati, conflitti sui termini) e codice client
 * (i passi del wizard d'importazione): per questo vive qui e non in un
 * servizio: come `tipi-documento.ts`, è un modulo puro e importarlo dal
 * browser non trascina Prisma nel bundle.
 *
 * La regola è una sola — togliere gli zeri iniziali — ma stava scritta in
 * cinque posti (le due rotte nuove, due volte in linea in `api/invoices`, e
 * `matcher.ts`). Non era ridondanza innocua: la rotta dei conflitti
 * raggruppa e *restituisce* la P.IVA normalizzata, mentre il passo
 * d'esecuzione cercava la scelta dell'utente con quella grezza del
 * documento. Per ogni fornitore con la P.IVA che inizia per zero — una quota
 * larghissima di quelle italiane — le due chiavi non combaciavano e la
 * scelta fatta nella finestra dei conflitti veniva buttata via in silenzio.
 * Finché la regola vive in un posto solo, quel disallineamento non può
 * ripresentarsi.
 *
 * Serve solo a confrontare: il valore da salvare resta quello del documento.
 */
export function normalizzaPartitaIva(partitaIva: string): string {
  return partitaIva.replace(/^0+/, '')
}

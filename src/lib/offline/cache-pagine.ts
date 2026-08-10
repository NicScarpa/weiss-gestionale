/**
 * Il contratto fra il service worker e la pagina sulla cache dei documenti.
 *
 * Sta in un modulo suo perché i due lati sono due bundle diversi — il worker
 * (`src/app/sw.ts`) e il client (`src/lib/offline/sync.ts`) — e devono restare
 * d'accordo su **due** cose: dove si mette via una pagina, e come si riconosce
 * la richiesta che ce la mette.
 *
 * ## Perché serve un marcatore, e non basta «le navigazioni»
 *
 * Il reload senza rete è una navigazione (`request.mode === 'navigate'`). Il
 * riscaldamento della cache, invece, è una `fetch()` programmatica fatta dalla
 * pagina appena il worker prende il controllo: il suo `mode` **non** è
 * `'navigate'`. Una regola che seleziona solo le navigazioni quindi legge da
 * una cache che nessuno riempie.
 *
 * Non è un timore, è una misura: instradando le navigazioni su una cache nuova
 * senza portarci anche il riscaldamento, il difetto è passato dal 2,5% al
 * **100%** — otto fallimenti su otto. E il tentativo successivo, scrivere la
 * pagina *anche* a mano nella cache giusta, ha lasciato **due** scritture in
 * corsa fra loro (una del worker in `others`, una esplicita in `pagine`):
 * 10 fallimenti su 120, cioè peggio del difetto di partenza.
 *
 * Con questo marcatore c'è **un percorso solo**: la richiesta di riscaldamento
 * viene instradata come una pagina, finisce nella cache delle pagine, e il
 * reload offline la cerca lì. Una scrittura, una lettura, lo stesso posto.
 */

/** Cache dei documenti. Il worker la riempie e la legge, nessun altro. */
export const NOME_CACHE_PAGINE = 'pagine'

/**
 * Marca la richiesta di riscaldamento perché il worker la tratti come una
 * pagina. Same-origin e GET: nessun preflight CORS.
 */
export const INTESTAZIONE_RISCALDAMENTO = 'x-riscaldamento-pagina'

/**
 * Testi delle risposte di `POST /api/prima-nota/[id]/riallinea` (Task 7),
 * in un modulo a parte senza altre dipendenze.
 *
 * Chi li mostra — i test di questa rotta e il client che li fa arrivare a
 * schermo (Task 10, `InvoiceDetail.tsx`) — li importa da qui invece di
 * ricopiarli a mano: un testo duplicato letteralmente resta verde anche il
 * giorno in cui la rotta cambia la propria parola, il tipo di test "verde
 * per il motivo sbagliato" da evitare.
 *
 * Vivono fuori da `route.ts` per lo stesso motivo di `riga-fattura-condivisa.ts`
 * (vedi il suo docblock): `route.ts` importa `next/server` e `next-auth`
 * attraverso `@/lib/auth`, e un test lato client che importasse la rotta per
 * arrivare a queste tre stringhe si porterebbe dietro anche quelli — che
 * sotto `jsdom` non risolvono (`next-auth` cerca `next/server`, non
 * `next/server.js`). Qui non c'è nulla da risolvere: solo testo.
 */
export const MESSAGGIO_NESSUNA_DIVERGENZA = 'Il movimento non ha imputazioni divergenti da riallineare'
export const MESSAGGIO_MAI_GENERATE_FETTE =
  'Una riconciliazione di questo movimento non ha mai generato fette ereditate ' +
  '(probabilmente la fattura non era coperta per intero): completa prima le sue imputazioni'
export const MESSAGGIO_RIALLINEATO = 'Fette riallineate alle imputazioni correnti della fattura'

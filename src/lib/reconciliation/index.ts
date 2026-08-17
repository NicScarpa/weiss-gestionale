/**
 * Le funzioni del vecchio auto-match non passano più di qui: la coda assistita
 * ha preso il posto della riconciliazione automatica, e con la rotta
 * `POST /api/reconciliation` è caduto l'ultimo chiamante di produzione.
 * `reconcileVenueTransactions` sopravvive in `./matcher` perché la esercita
 * ancora un test di integrazione (`src/lib/banca/__tests__/residuo-documenti.itest.ts`),
 * che la importa dal suo file: non c'è ragione di ri-esportarla qui e farla
 * sembrare un'API viva.
 */
export {
  parseCSV,
  parseXLS,
  parseXLSX,
  parseCBIXML,
  parseCBITXT,
  RELAXBANKING_CONFIG,
} from './csv-parser'

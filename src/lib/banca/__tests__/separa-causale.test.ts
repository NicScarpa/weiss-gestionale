import { describe, it, expect } from 'vitest'
import { separaCausale, CAUSALI_PER_CODICE } from '../separa-causale'

// I testi sono quelli veri di Banca Della Marca (snapshot della Fase 0, 12/08):
// la regola è misurata su 335 righe su 335, e questi venti casi sono la misura.
const CASI: Array<[codice: string, grezzo: string, causale: string, descrizione: string]> = [
  ['15//10', 'Addebito rata mutuo *003/234159/057 Scad.:29/07/2026 Cap.: 1.344,70 Int.: 25,28 Spese: 2,50 Altro: 0,00 D', 'Addebito rata mutuo', '003/234159/057 Scad.:29/07/2026 Cap.: 1.344,70 Int.: 25,28 Spese: 2,50 Altro: 0,00 D'],
  ['16//00', 'Commissioni', 'Commissioni', ''],
  ['16//32', 'Comm. richiesta incasso SEPA B2B', 'Commissione richiesta incasso SEPA B2B', ''],
  ['16//33', 'Comm. richiesta incasso SEPA B2C', 'Commissione richiesta incasso SEPA B2C', ''],
  ['16//37', 'Commissioni su bonifico tramite in', 'Commissioni su bonifico tramite internet banking', ''],
  ['19//05', 'Imposta di bollo Imposta di bollo al 30/06/2026', 'Imposta di bollo', 'Imposta di bollo al 30/06/2026'],
  ['19//83', 'Imposte e tasse:Delega Unificata(p C.ATT:28334965036/73', 'Imposte e tasse: delega unificata', 'C.ATT:28334965036/73'],
  ['26//11', 'Bonifico tramite Internet Banking *INSTANT DEL 06/08/2026 ORE 14:36 ID. 0708400041647044486499064990IT BEN PICCIN FRIGORIFERI SRLFDI/0000505', 'Bonifico tramite internet banking', 'INSTANT DEL 06/08/2026 ORE 14:36 ID. 0708400041647044486499064990IT BEN PICCIN FRIGORIFERI SRLFDI/0000505'],
  ['26//20', 'Vs disposizione permanente a favor *SCARPA NICOLA RIMBORSO FINANZIAMENTO SO', 'Vs disposizione permanente a favore', 'SCARPA NICOLA RIMBORSO FINANZIAMENTO SO'],
  ['31//21', 'SDD B2B - Richiesta Incasso SEPA FATTURA N. EE01041766/2026 DEL 16-0 Segnoverde S.p.A. unipersonale 94R8812024000000042903', 'SDD B2B - Richiesta incasso SEPA', 'FATTURA N. EE01041766/2026 DEL 16-0 Segnoverde S.p.A. unipersonale 94R8812024000000042903'],
  ['31//22', 'SDD Core - Richiesta Incasso SEPA 07267377566872 AMERICAN EXPRESS PAYMENTS EUSL 7043090000007377566872', 'SDD Core - Richiesta incasso SEPA', '07267377566872 AMERICAN EXPRESS PAYMENTS EUSL 7043090000007377566872'],
  ['34//00', 'Giro conto *WEISS S.R.L. Giroconto', 'Giro conto', 'WEISS S.R.L. Giroconto'],
  ['39//11', 'Disposizione per emolumenti intern *BONIFICI DEL 20260807 QTA 8', 'Disposizione per emolumenti', 'BONIFICI DEL 20260807 QTA 8'],
  ['45//15', 'Carta del Credito Cooperativo ******************354 CCP DIRECT ISSUING', 'Carta del Credito Cooperativo', '*****************354 CCP DIRECT ISSUING'],
  ['48//00', 'Bonifico a vs favore *WORLDLINE MERCHANT SERVICES ITALIA FSCR0000003651-0000043083 059147785 OP DEL. 10082026', 'Bonifico a vs favore', 'WORLDLINE MERCHANT SERVICES ITALIA FSCR0000003651-0000043083 059147785 OP DEL. 10082026'],
  ['52//30', 'Prelevamento contante allo sportel', 'Prelevamento contante allo sportello', ''],
  ['68//00', 'Storno scritture *TESOLIN AURORA STIPENDIO MESE APRILE 2026', 'Storno scritture', 'TESOLIN AURORA STIPENDIO MESE APRILE 2026'],
  ['78//10', 'Versamento contante allo sportello', 'Versamento contante allo sportello', ''],
  ['78//50', 'Versamento contante tramite CSA - Versamento Carta: 305282 Effettuato da ATM: 01759', 'Versamento contante tramite CSA', 'Versamento Carta: 305282 Effettuato da ATM: 01759'],
  ['79//00', 'Disposizione di giro conto *WEISS SRL 626420100001 BS 190,00+ COM 1,90- BK 00+ COM 0,90-/BENEF/626420100001 BS 190,00+ COM 1,90- BK 90,00+ COM 0,90-', 'Disposizione di giro conto', 'WEISS SRL 626420100001 BS 190,00+ COM 1,90- BK 00+ COM 0,90-/BENEF/626420100001 BS 190,00+ COM 1,90- BK 90,00+ COM 0,90-'],
]

describe('separaCausale: i venti codici veri', () => {
  it.each(CASI)('%s → «%s»', (codice, grezzo, causale, descrizione) => {
    expect(separaCausale(grezzo, codice)).toEqual({ causale, descrizione })
  })

  it('la tabella copre esattamente i venti codici osservati', () => {
    expect(Object.keys(CAUSALI_PER_CODICE).sort()).toEqual(CASI.map((c) => c[0]).sort())
  })
})

describe('separaCausale: i controesempi', () => {
  it('codice ignoto con asterisco: taglia lì', () => {
    expect(separaCausale('Operazione nuova *DETTAGLIO 123', '99//99')).toEqual({
      causale: 'Operazione nuova',
      descrizione: 'DETTAGLIO 123',
    })
  })

  it('codice ignoto senza asterisco: nessuna causale, testo intero', () => {
    expect(separaCausale('Operazione nuova senza separatore', '99//99')).toEqual({
      causale: null,
      descrizione: 'Operazione nuova senza separatore',
    })
  })

  it('codice nullo (import CSV): vale la regola dell\'asterisco', () => {
    expect(separaCausale('Bonifico a vs favore *ROSSI SRL', null)).toEqual({
      causale: 'Bonifico a vs favore',
      descrizione: 'ROSSI SRL',
    })
  })

  // Il prefisso della tabella è quello della banca: un testo che, pur con un
  // codice noto, non comincia così non va spezzato a caso.
  it('codice noto ma testo che non comincia col prefisso: ripiega sull\'asterisco o sul testo intero', () => {
    expect(separaCausale('Testo inatteso della banca', '48//00')).toEqual({
      causale: null,
      descrizione: 'Testo inatteso della banca',
    })
  })

  // La carta ha il numero mascherato subito dopo la causale: si toglie UN solo
  // asterisco separatore, gli altri restano a mascherare.
  it('toglie un solo asterisco separatore', () => {
    expect(separaCausale('Carta del Credito Cooperativo ***1234 ESERCENTE', '45//15').descrizione).toBe(
      '**1234 ESERCENTE'
    )
  })

  it('confronta il prefisso senza distinguere le maiuscole', () => {
    expect(separaCausale('BONIFICO A VS FAVORE *ACME', '48//00')).toEqual({
      causale: 'Bonifico a vs favore',
      descrizione: 'ACME',
    })
  })

  it('un testo vuoto resta vuoto, senza causale', () => {
    expect(separaCausale('', '48//00')).toEqual({ causale: null, descrizione: '' })
  })
})

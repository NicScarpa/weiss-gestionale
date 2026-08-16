/**
 * Dal testo grezzo della banca a causale + descrizione.
 *
 * La banca scrive «<tipo di operazione> *<dettagli>»: `Bonifico a vs favore
 * *WORLDLINE MERCHANT SERVICES…`. CashKing mostra i due pezzi in due colonne
 * («Causale» e «Descrizione»); noi li tenevamo incollati in `description`, che
 * da questa spec resta il testo grezzo intoccabile mentre `causale` e
 * `descrizione` sono i campi che si leggono e si modificano.
 *
 * La tabella dei prefissi è **misurata** sui 335 movimenti grezzi della Fase 0
 * (spec, «separaCausale»): tutti cadono nel caso 1. La banca tronca la propria
 * causale a 34 caratteri (`Commissioni su bonifico tramite in`): la colonna
 * `causale` della tabella completa la parola. È la tabella di Banca Della
 * Marca, come `codici-banca.ts`: un secondo istituto la vorrà spezzata per
 * istituto.
 */

export interface CausaleSeparata {
  causale: string | null
  descrizione: string
}

/**
 * Quanto ci sta in `bank_transactions.causale` (`@db.VarChar(120)`).
 *
 * Serve al solo ramo dell'asterisco: le causali della tabella sono scritte qui
 * e stanno tutte dentro, ma quello ritaglia ciò che la banca ha scritto prima
 * del ` *`, e un testo con l'asterisco oltre il 120° carattere produrrebbe una
 * causale troppo lunga. L'import ne scrive centinaia in una `createMany`: una
 * riga sola fuori misura fa fallire l'intero lotto, non se stessa.
 */
const MAX_CAUSALE = 120

/** Codice operazione → prefisso grezzo scritto dalla banca e causale pulita. */
export const CAUSALI_PER_CODICE: Readonly<Record<string, { prefisso: string; causale: string }>> = {
  '15//10': { prefisso: 'Addebito rata mutuo', causale: 'Addebito rata mutuo' },
  '16//00': { prefisso: 'Commissioni', causale: 'Commissioni' },
  '16//32': { prefisso: 'Comm. richiesta incasso SEPA B2B', causale: 'Commissione richiesta incasso SEPA B2B' },
  '16//33': { prefisso: 'Comm. richiesta incasso SEPA B2C', causale: 'Commissione richiesta incasso SEPA B2C' },
  '16//37': { prefisso: 'Commissioni su bonifico tramite in', causale: 'Commissioni su bonifico tramite internet banking' },
  '19//05': { prefisso: 'Imposta di bollo', causale: 'Imposta di bollo' },
  '19//83': { prefisso: 'Imposte e tasse:Delega Unificata(p', causale: 'Imposte e tasse: delega unificata' },
  '26//11': { prefisso: 'Bonifico tramite Internet Banking', causale: 'Bonifico tramite internet banking' },
  '26//20': { prefisso: 'Vs disposizione permanente a favor', causale: 'Vs disposizione permanente a favore' },
  '31//21': { prefisso: 'SDD B2B - Richiesta Incasso SEPA', causale: 'SDD B2B - Richiesta incasso SEPA' },
  '31//22': { prefisso: 'SDD Core - Richiesta Incasso SEPA', causale: 'SDD Core - Richiesta incasso SEPA' },
  '34//00': { prefisso: 'Giro conto', causale: 'Giro conto' },
  '39//11': { prefisso: 'Disposizione per emolumenti intern', causale: 'Disposizione per emolumenti' },
  '45//15': { prefisso: 'Carta del Credito Cooperativo', causale: 'Carta del Credito Cooperativo' },
  '48//00': { prefisso: 'Bonifico a vs favore', causale: 'Bonifico a vs favore' },
  '52//30': { prefisso: 'Prelevamento contante allo sportel', causale: 'Prelevamento contante allo sportello' },
  '68//00': { prefisso: 'Storno scritture', causale: 'Storno scritture' },
  '78//10': { prefisso: 'Versamento contante allo sportello', causale: 'Versamento contante allo sportello' },
  '78//50': { prefisso: 'Versamento contante tramite CSA', causale: 'Versamento contante tramite CSA' },
  '79//00': { prefisso: 'Disposizione di giro conto', causale: 'Disposizione di giro conto' },
}

/**
 * Toglie ciò che separa la causale dai dettagli: spazi, UN solo asterisco (la
 * carta ha il numero mascherato con asterischi subito dopo, e deve restare
 * mascherato), poi eventuali `-` o `:` e altri spazi.
 */
function senzaSeparatore(resto: string): string {
  return resto.replace(/^\s*\*?[\s\-:]*/, '').trim()
}

export function separaCausale(testoGrezzo: string, codiceBanca: string | null): CausaleSeparata {
  const testo = testoGrezzo.trim()
  if (testo === '') return { causale: null, descrizione: '' }

  const voce = codiceBanca ? CAUSALI_PER_CODICE[codiceBanca] : undefined
  if (voce && testo.toLowerCase().startsWith(voce.prefisso.toLowerCase())) {
    return { causale: voce.causale, descrizione: senzaSeparatore(testo.slice(voce.prefisso.length)) }
  }

  const asterisco = testo.indexOf(' *')
  if (asterisco > 0) {
    return {
      causale: testo.slice(0, asterisco).trim().slice(0, MAX_CAUSALE).trimEnd(),
      descrizione: senzaSeparatore(testo.slice(asterisco + 1)),
    }
  }

  return { causale: null, descrizione: testo }
}

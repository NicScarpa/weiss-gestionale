/**
 * Gli otto stati che GoCardless assegna a una requisition, in italiano.
 *
 * Vivevano dentro `scripts/gocardless-probe.ts`, che era l'unico a doverli
 * mostrare. Da qui in poi li mostra anche il pannello: stanno in un posto
 * solo, e la sonda importa questo modulo invece di tenerne una copia.
 *
 * `spiegazione` non è il nome ripetuto con altre parole: è cosa deve fare chi
 * legge. «Rifiutata» non aiuta nessuno; «la banca ha rifiutato il consenso, va
 * rifatto da capo» sì.
 */
export interface StatoRequisition {
  sigla: string
  nome: string
  spiegazione: string
}

const STATI: Record<string, Omit<StatoRequisition, 'sigla'>> = {
  CR: {
    nome: 'Creata',
    spiegazione: 'Il collegamento è stato preparato ma il link non è ancora stato aperto.',
  },
  GC: {
    nome: 'In attesa del consenso',
    spiegazione: 'Sei sulla pagina della banca e non hai ancora confermato.',
  },
  UA: {
    nome: 'Autenticazione in corso',
    spiegazione: "La banca sta verificando la tua identità: completa l'accesso per proseguire.",
  },
  RJ: {
    nome: 'Rifiutata',
    spiegazione: 'La banca ha rifiutato il consenso. Va rifatto da capo.',
  },
  SA: {
    nome: 'Scelta dei conti',
    spiegazione: 'Stai scegliendo presso la banca quali conti condividere.',
  },
  GA: {
    nome: 'Accesso in concessione',
    spiegazione: "La banca sta completando l'autorizzazione. Manca poco.",
  },
  LN: {
    nome: 'Collegata',
    spiegazione: 'Il consenso è attivo e i conti sono leggibili.',
  },
  EX: {
    nome: 'Scaduta',
    spiegazione: 'Il consenso è scaduto. Va rinnovato rifacendo l\'autenticazione in banca.',
  },
}

export function descriviStato(codice: string): StatoRequisition {
  const noto = STATI[codice]
  if (noto) return { sigla: codice, ...noto }
  // GoCardless può aggiungere uno stato senza avvisare: meglio una schermata
  // che dice «non lo conosco» di una che si rompe.
  return {
    sigla: codice,
    nome: 'Stato sconosciuto',
    spiegazione: `La banca ha risposto con uno stato che non conosciamo (${codice}).`,
  }
}

/** L'unico stato in cui i conti si possono leggere. */
export function eCollegata(codice: string): boolean {
  return codice === 'LN'
}

/** Gli stati da cui si esce solo rifacendo il consenso. */
export function eDaRifare(codice: string): boolean {
  return codice === 'RJ' || codice === 'EX'
}

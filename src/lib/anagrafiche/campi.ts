/**
 * I campi dell'anagrafica: un elenco solo, per clienti e fornitori.
 *
 * Le due anagrafiche erano nate con insiemi di campi diversi — il cliente aveva
 * telefono e note, il fornitore paese e termini di pagamento, e il codice
 * fiscale del fornitore stava nel database senza che nessuna schermata potesse
 * scriverlo. Tenendo i campi in un posto solo la difformità non si scopre: non
 * si può proprio scrivere.
 *
 * Le colonne sotto invece restano com'erano — il cliente le ha in italiano
 * (`denominazione`), il fornitore in inglese (`name`) — perché rinominarle
 * significherebbe rincorrere ogni riferimento nell'import fatture, nello
 * scadenzario e negli alias di controparte: rischio alto, guadagno nullo. La
 * mappa `COLONNE` fa da traduttore, e le due schermate restano identiche.
 */

export type VarianteAnagrafica = 'cliente' | 'fornitore'

export type GruppoCampo = 'identita' | 'contatti' | 'sede' | 'contabilita' | 'altro'

export type TipoCampo =
  | 'testo'
  | 'email'
  | 'telefono'
  | 'numero'
  | 'conto'
  | 'interruttore'
  | 'testoLungo'

export interface CampoAnagrafica {
  /** Nome logico, uguale per entrambe le anagrafiche. */
  chiave: string
  etichetta: string
  gruppo: GruppoCampo
  tipo: TipoCampo
  obbligatorio?: boolean
  segnaposto?: string
  /** Testo sotto al campo, quando il solo nome non basta a capirlo. */
  aiuto?: string
  lunghezzaMax?: number
  maiuscolo?: boolean
}

export const GRUPPI: { chiave: GruppoCampo; titolo: string }[] = [
  { chiave: 'identita', titolo: 'Identità' },
  { chiave: 'contatti', titolo: 'Contatti' },
  { chiave: 'sede', titolo: 'Sede' },
  { chiave: 'contabilita', titolo: 'Contabilità' },
  { chiave: 'altro', titolo: 'Altro' },
]

export const CAMPI_ANAGRAFICA: CampoAnagrafica[] = [
  {
    chiave: 'denominazione',
    etichetta: 'Denominazione',
    gruppo: 'identita',
    tipo: 'testo',
    obbligatorio: true,
    segnaposto: 'Bar Centrale S.r.l.',
  },
  {
    chiave: 'partitaIva',
    etichetta: 'Partita IVA',
    gruppo: 'identita',
    tipo: 'testo',
    segnaposto: '01234567890',
    lunghezzaMax: 13,
  },
  {
    chiave: 'codiceFiscale',
    etichetta: 'Codice fiscale',
    gruppo: 'identita',
    tipo: 'testo',
    segnaposto: 'RSSMRA85M01H501W',
    lunghezzaMax: 16,
    maiuscolo: true,
  },
  {
    chiave: 'email',
    etichetta: 'Email',
    gruppo: 'contatti',
    tipo: 'email',
    segnaposto: 'info@esempio.it',
  },
  {
    chiave: 'telefono',
    etichetta: 'Telefono',
    gruppo: 'contatti',
    tipo: 'telefono',
    segnaposto: '+39 0434 000000',
  },
  {
    chiave: 'indirizzo',
    etichetta: 'Indirizzo',
    gruppo: 'sede',
    tipo: 'testo',
    segnaposto: 'Via Roma 1',
  },
  {
    chiave: 'cap',
    etichetta: 'CAP',
    gruppo: 'sede',
    tipo: 'testo',
    segnaposto: '33077',
    lunghezzaMax: 5,
  },
  { chiave: 'citta', etichetta: 'Città', gruppo: 'sede', tipo: 'testo', segnaposto: 'Sacile' },
  {
    chiave: 'provincia',
    etichetta: 'Provincia',
    gruppo: 'sede',
    tipo: 'testo',
    segnaposto: 'PN',
    lunghezzaMax: 2,
    maiuscolo: true,
  },
  {
    chiave: 'paese',
    etichetta: 'Paese',
    gruppo: 'sede',
    tipo: 'testo',
    segnaposto: 'IT',
    lunghezzaMax: 2,
    maiuscolo: true,
  },
  {
    chiave: 'contoPredefinito',
    etichetta: 'Conto predefinito',
    gruppo: 'contabilita',
    tipo: 'conto',
    aiuto: 'Proposto in automatico quando si registra un movimento di questa controparte',
  },
  {
    chiave: 'iban',
    etichetta: 'IBAN',
    gruppo: 'contabilita',
    tipo: 'testo',
    segnaposto: 'IT60X0542811101000000123456',
    lunghezzaMax: 34,
    maiuscolo: true,
  },
  {
    chiave: 'terminiPagamentoGiorni',
    etichetta: 'Termini di pagamento (giorni)',
    gruppo: 'contabilita',
    tipo: 'numero',
    segnaposto: '30',
    aiuto: 'Usati per stimare la scadenza quando il documento non la riporta',
  },
  { chiave: 'note', etichetta: 'Note', gruppo: 'altro', tipo: 'testoLungo' },
  { chiave: 'attivo', etichetta: 'Attivo', gruppo: 'altro', tipo: 'interruttore' },
]

/**
 * Il conto predefinito è l'unico campo il cui *contenuto* dipende
 * dall'anagrafica: dal cliente entrano ricavi, al fornitore escono costi.
 * L'etichetta resta la stessa, cambia solo l'insieme fra cui scegliere.
 */
export const TIPI_CONTO: Record<VarianteAnagrafica, Array<'COSTO' | 'RICAVO'>> = {
  cliente: ['RICAVO'],
  fornitore: ['COSTO'],
}

/** Dove finisce ciascun campo, anagrafica per anagrafica. */
export const COLONNE: Record<VarianteAnagrafica, Record<string, string>> = {
  cliente: {
    denominazione: 'denominazione',
    partitaIva: 'partitaIva',
    codiceFiscale: 'codiceFiscale',
    email: 'email',
    telefono: 'telefono',
    indirizzo: 'indirizzo',
    cap: 'cap',
    citta: 'citta',
    provincia: 'provincia',
    paese: 'paese',
    contoPredefinito: 'defaultAccountId',
    iban: 'iban',
    terminiPagamentoGiorni: 'paymentTermsDays',
    note: 'note',
    attivo: 'attivo',
  },
  fornitore: {
    denominazione: 'name',
    partitaIva: 'vatNumber',
    codiceFiscale: 'fiscalCode',
    email: 'email',
    telefono: 'phone',
    indirizzo: 'address',
    cap: 'postalCode',
    citta: 'city',
    provincia: 'province',
    paese: 'country',
    contoPredefinito: 'defaultAccountId',
    iban: 'iban',
    terminiPagamentoGiorni: 'paymentTermsDays',
    note: 'notes',
    attivo: 'isActive',
  },
}

export type ValoriAnagrafica = Record<string, string | number | boolean | null | undefined>

const PER_CHIAVE = new Map(CAMPI_ANAGRAFICA.map((c) => [c.chiave, c]))

/** Dal record del database ai valori della scheda. */
export function versoModulo(
  variante: VarianteAnagrafica,
  record: Record<string, unknown>
): ValoriAnagrafica {
  const valori: ValoriAnagrafica = {}
  for (const [chiave, colonna] of Object.entries(COLONNE[variante])) {
    const valore = record[colonna]
    if (valore === undefined) continue
    valori[chiave] = valore as ValoriAnagrafica[string]
  }
  return valori
}

/** Dai valori della scheda al corpo che la rotta si aspetta. */
export function versoApi(
  variante: VarianteAnagrafica,
  valori: ValoriAnagrafica
): Record<string, unknown> {
  const corpo: Record<string, unknown> = {}

  for (const [chiave, colonna] of Object.entries(COLONNE[variante])) {
    if (!(chiave in valori)) continue
    const campo = PER_CHIAVE.get(chiave)
    const valore = valori[chiave]

    if (campo?.tipo === 'interruttore') {
      corpo[colonna] = Boolean(valore)
      continue
    }

    if (campo?.tipo === 'numero') {
      const numero = typeof valore === 'number' ? valore : Number(String(valore ?? '').trim())
      corpo[colonna] = String(valore ?? '').trim() === '' || Number.isNaN(numero) ? null : numero
      continue
    }

    // Il campo lasciato vuoto vale «non lo so», non «stringa vuota»: salvato
    // come '' renderebbe «senza partita IVA» indistinguibile da «cancellata».
    const testo = typeof valore === 'string' ? valore.trim() : valore
    if (testo === '' || testo === undefined || testo === null) {
      corpo[colonna] = null
      continue
    }
    corpo[colonna] = campo?.maiuscolo && typeof testo === 'string' ? testo.toUpperCase() : testo
  }

  return corpo
}

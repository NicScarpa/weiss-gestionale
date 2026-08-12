/**
 * Accoppia i conti che la banca espone con quelli registrati nel gestionale.
 *
 * Puro di proposito: nessun accesso al database, nessuna rete, e soprattutto
 * nessuna cifratura. La funzione d'impronta arriva come parametro perché
 * `lookupHash` legge una chiave dall'ambiente, e una funzione che dipende da
 * una variabile d'ambiente non si prova senza preparativi.
 *
 * Il confronto avviene sull'impronta dell'IBAN, mai su una ricerca dell'IBAN
 * cifrato: è già così che il progetto ritrova fornitori e conti.
 */

export interface ContoDaBanca {
  providerAccountId: string
  iban: string | null
  intestatario: string | null
  valuta: string | null
}

export interface ContoDelGestionale {
  id: string
  nome: string
  ibanHash: string | null
  /** Valorizzato se il conto è già legato a un collegamento. */
  connectionId: string | null
}

export type EsitoAbbinamento =
  | { tipo: 'riconosciuto'; conto: ContoDaBanca; bankAccountId: string; nomeConto: string }
  | { tipo: 'gia-collegato'; conto: ContoDaBanca; bankAccountId: string; nomeConto: string }
  | { tipo: 'sconosciuto'; conto: ContoDaBanca }
  | { tipo: 'ignorato'; conto: ContoDaBanca }

export function abbinaConti(parametri: {
  contiBanca: ContoDaBanca[]
  contiGestionale: ContoDelGestionale[]
  ignorati: string[]
  impronta: (iban: string) => string
}): EsitoAbbinamento[] {
  const { contiBanca, contiGestionale, ignorati, impronta } = parametri
  const scartati = new Set(ignorati)

  const perImpronta = new Map<string, ContoDelGestionale>()
  for (const c of contiGestionale) {
    // Un conto senza impronta (una cassa, o un conto senza IBAN) non è
    // abbinabile: tenerlo nella mappa sotto la chiave `null` lo renderebbe
    // il bersaglio di qualunque conto senza IBAN dall'altra parte.
    //
    // Due conti del gestionale con lo stesso IBAN sono raggiungibili:
    // `@@unique([venueId, iban])` non li impedisce, perché `encrypt` usa un
    // vettore di inizializzazione casuale e due cifrature dello stesso IBAN
    // sono byte diversi — l'indice unico non le vede come uguali. L'unica
    // colonna deterministica è `ibanHash`, che è `@@index`, non `@@unique`.
    // Vince il primo, per coerenza con la regola già decisa dall'altro lato
    // (un conto del gestionale non si abbina a due conti della banca).
    if (c.ibanHash && !perImpronta.has(c.ibanHash)) perImpronta.set(c.ibanHash, c)
  }

  // Un conto del gestionale può corrispondere a un solo conto della banca:
  // due IBAN identici su due conti diversi sono un dato sbagliato da qualche
  // parte, e in quel caso è meglio lasciare il secondo da decidere a mano.
  const gia = new Set<string>()

  return contiBanca.map((conto): EsitoAbbinamento => {
    if (scartati.has(conto.providerAccountId)) return { tipo: 'ignorato', conto }
    if (!conto.iban) return { tipo: 'sconosciuto', conto }

    const corrispondente = perImpronta.get(impronta(conto.iban))
    if (!corrispondente || gia.has(corrispondente.id)) return { tipo: 'sconosciuto', conto }

    gia.add(corrispondente.id)
    return {
      tipo: corrispondente.connectionId ? 'gia-collegato' : 'riconosciuto',
      conto,
      bankAccountId: corrispondente.id,
      nomeConto: corrispondente.nome,
    }
  })
}

/**
 * Abbinamento fra una riga di fattura e la memoria fornitore-prodotto.
 *
 * Modulo puro: nessun accesso al database, nessun effetto. Le regole di
 * identità di un prodotto stanno tutte qui, dove si possono leggere ed
 * esercitare senza montare una fattura vera.
 *
 * ## Perché due livelli di certezza
 *
 * L'identità di un prodotto in memoria è il **nome normalizzato**: è la chiave
 * unica `(venueId, supplierId, nomeNormalizzato)`. Il codice articolo no. Il
 * codice non è unico in tabella, e nell'XML è il primo blocco `CodiceArticolo`
 * della riga qualunque sia il `CodiceTipo`: EAN, codice interno, codice
 * cliente, indifferentemente. Un fornitore che compila quel campo con un
 * progressivo, o con un codice di gruppo uguale per molte righe, non sta
 * identificando il prodotto.
 *
 * Prima il codice veniva provato **per primo** e vinceva anche quando esisteva
 * la memoria esatta per quel nome, e `find` sceglieva fra più memorie con lo
 * stesso codice nell'ordine — arbitrario — in cui il database le restituiva
 * (F2-ALL-006). Il detersivo poteva essere imputato al conto del pane, e
 * siccome le righe risolte dalla memoria si scrivevano come **confermate**,
 * quell'imputazione non compariva fra le cose da rivedere.
 *
 * Ora:
 * - **nome esatto** → identità certa, la riga si scrive `confermata`;
 * - **solo codice**, e solo quando il codice è inequivocabile, → indizio, non
 *   prova: la riga si scrive `proposta`, quindi gialla e in lista di
 *   controllo. La prova più debole non produce più il verde.
 *
 * Il codice resta utile — è la sola strada quando il fornitore riscrive la
 * descrizione dello stesso articolo — ma non parla più con la voce del nome.
 */

export interface MemoriaConfrontabile {
  nomeNormalizzato: string
  codiceArticolo: string | null
  accountId: string
}

export interface RigaDaAbbinare {
  nomeNormalizzato: string
  codiceArticolo: string | null
}

export interface EsitoAbbinamento {
  accountId: string
  /** Su cosa regge l'abbinamento: il nome è identità, il codice è indizio. */
  certezza: 'nome' | 'codice'
}

/**
 * I codici che, **dentro questa fattura**, coprono prodotti con nomi diversi.
 *
 * È il segnale più diretto che quel valore non è un identificativo di
 * prodotto: se la stessa fattura usa `GR01` per il pane e per il detersivo, il
 * fornitore lo sta usando come codice di gruppo. Vale qui e non in generale,
 * perché è l'unica prova che abbiamo sotto mano al momento dell'import.
 *
 * Lo stesso prodotto ripetuto su due righe — una consegna spezzata, due lotti —
 * porta lo stesso nome e non rende il codice sospetto.
 */
export function codiciNonIdentificanti(righe: RigaDaAbbinare[]): Set<string> {
  const nomiPerCodice = new Map<string, Set<string>>()

  for (const riga of righe) {
    if (!riga.codiceArticolo) continue
    const nomi = nomiPerCodice.get(riga.codiceArticolo) ?? new Set<string>()
    nomi.add(riga.nomeNormalizzato)
    nomiPerCodice.set(riga.codiceArticolo, nomi)
  }

  return new Set(
    [...nomiPerCodice.entries()].filter(([, nomi]) => nomi.size > 1).map(([codice]) => codice)
  )
}

/**
 * Cerca in memoria l'imputazione già nota per questa riga.
 *
 * Il nome esatto ha la precedenza assoluta. Il codice interviene solo dopo, e
 * solo se è inequivocabile su entrambi i fronti: una sola memoria lo porta, e
 * nella fattura non copre prodotti diversi. Un codice ambiguo non produce un
 * abbinamento peggiore — non ne produce nessuno, e la riga passa all'AI, che
 * la scriverà come proposta da rivedere.
 */
export function abbinaMemoria({
  riga,
  memorie,
  codiciNonIdentificanti: codiciSospetti,
}: {
  riga: RigaDaAbbinare
  memorie: MemoriaConfrontabile[]
  codiciNonIdentificanti: Set<string>
}): EsitoAbbinamento | undefined {
  const perNome = memorie.find((m) => m.nomeNormalizzato === riga.nomeNormalizzato)
  if (perNome) {
    return { accountId: perNome.accountId, certezza: 'nome' }
  }

  const codice = riga.codiceArticolo
  if (!codice || codiciSospetti.has(codice)) return undefined

  const perCodice = memorie.filter((m) => m.codiceArticolo === codice)
  if (perCodice.length !== 1) return undefined

  return { accountId: perCodice[0].accountId, certezza: 'codice' }
}

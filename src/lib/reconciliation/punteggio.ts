import { stringSimilarity, daysDifference } from './matcher'
import { normalizzaTesto, contieneRiferimento, estraiPartiteIva, senzaFormaSocietaria } from './causale'
import { PESI } from './scala'

/**
 * Il punteggio di una coppia movimento-scadenza, da 0 a 100.
 *
 * Modulo puro: nessun accesso al database. Alias e mappa dei codici banca
 * arrivano come argomenti, così il motore si può esercitare sui 678 movimenti
 * veri degli snapshot senza montare niente.
 *
 * ## Tre scelte deliberate, contro CashKing
 *
 * **Niente base fissa.** CashKing regala trenta punti a ogni proposta per il
 * solo fatto di esistere, ed è ciò che poi gli costringe le soglie a non
 * tornare: la fascia che documenta come 0-49 è irraggiungibile perché il motore
 * non emette nulla sotto 50. Qui si parte da zero.
 *
 * **Il segno è un filtro, non un fattore.** CashKing gli assegna dieci punti
 * sempre soddisfatti, cioè un altro regalo a tutti. Qui un'uscita su una
 * scadenza attiva non produce una proposta debole: non produce proposta.
 *
 * **Le motivazioni dicono anche cosa abbassa.** Un 62 deve spiegare perché non
 * è 90, quindi ogni motivazione porta un segno.
 */

/**
 * Pesi, soglie e classificazione stanno in `./scala`, un modulo senza import, e
 * di qui si ri-esportano perché chi già li prendeva da `punteggio` non debba
 * cambiare riga. La ragione della separazione è scritta là: la schermata della
 * coda ha bisogno delle stesse costanti, e non può risalire fino a qui senza
 * trascinarsi Prisma nel bundle del browser (`punteggio` → `matcher` →
 * `@/lib/prisma`).
 */
export { PESI, SOGLIE, fascia } from './scala'
export type { Fascia } from './scala'

/** Differenze sotto questa soglia sono arrotondamenti, non discrepanze. */
export const TOLLERANZA = 0.01

export interface MovimentoBanca {
  id: string
  data: Date
  causale: string
  /** Firmato: negativo = uscita, positivo = entrata */
  importo: number
  /** `proprietaryBankTransactionCode`, formato NN//NN */
  bankTransactionCode: string | null
}

export interface ScadenzaCandidata {
  id: string
  tipo: 'attiva' | 'passiva'
  dataScadenza: Date
  descrizione: string
  /** importoTotale − importoPagato */
  residuo: number
  numeroDocumento: string | null
  controparteNome: string | null
  controparteIban: string | null
  supplierId: string | null
  partitaIvaControparte: string | null
  metodoPagamento: string | null
}

export interface Fattori {
  importo: number
  riferimento: number
  controparte: number
  data: number
  codiceBanca: number
  /** Applicato dopo, quando si conoscono le alternative: vedi `applicaUnicita` */
  unicita: number
}

export interface Motivazione {
  testo: string
  segno: '+' | '-'
}

export interface Valutazione {
  fattori: Fattori
  motivazioni: Motivazione[]
  /** Somma dei fattori senza l'unicità */
  punteggioParziale: number
}

export interface ContestoValutazione {
  /** testo normalizzato della causale → supplierId o customerId */
  alias: Map<string, string>
  /** bankTransactionCode → metodi di pagamento compatibili */
  mappaCodiciBanca: Map<string, string[]>
}

/** L'importo del movimento nel verso che interessa la scadenza; 0 se sbagliato. */
function importoUtile(movimento: MovimentoBanca, tipo: 'attiva' | 'passiva'): number {
  if (tipo === 'attiva') return movimento.importo > 0 ? movimento.importo : 0
  return movimento.importo < 0 ? -movimento.importo : 0
}

function punteggioImporto(importo: number, residuo: number, motivazioni: Motivazione[]): number {
  const differenza = Math.abs(importo - residuo)

  if (differenza < TOLLERANZA / 2) {
    motivazioni.push({ testo: 'Importo identico al residuo', segno: '+' })
    return PESI.IMPORTO
  }
  if (differenza <= TOLLERANZA) {
    motivazioni.push({ testo: 'Importo a meno di un centesimo dal residuo', segno: '+' })
    return 28
  }
  if (differenza <= 1) {
    motivazioni.push({ testo: 'Importo a meno di un euro dal residuo', segno: '+' })
    return 24
  }
  if (importo < residuo) {
    const quota = importo / residuo
    motivazioni.push({
      testo: `Acconto: copre il ${Math.round(quota * 100)}% del residuo`,
      segno: '-',
    })
    return Math.round(15 * quota)
  }
  motivazioni.push({ testo: 'Il movimento eccede il residuo della scadenza', segno: '-' })
  return 0
}

/**
 * La finestra della data è asimmetrica, e non per gusto: pagare in ritardo è
 * normale, pagare in anticipo è raro. Un motore simmetrico propone pagamenti
 * di giugno per rate di agosto — che è il difetto osservato in CashKing.
 */
function punteggioData(giorni: number, motivazioni: Motivazione[]): number {
  if (giorni === 0) {
    motivazioni.push({ testo: 'Pagato il giorno di scadenza', segno: '+' })
    return PESI.DATA
  }

  if (giorni > 0) {
    if (giorni <= 5) {
      motivazioni.push({ testo: `Pagato ${giorni} giorni dopo la scadenza`, segno: '+' })
      return 13
    }
    if (giorni <= 20) {
      motivazioni.push({ testo: `Pagato ${giorni} giorni dopo la scadenza`, segno: '+' })
      return 10
    }
    if (giorni <= 60) {
      motivazioni.push({ testo: `Pagato ${giorni} giorni dopo la scadenza`, segno: '-' })
      return 6
    }
    if (giorni <= 120) {
      motivazioni.push({ testo: `Pagato ${giorni} giorni dopo la scadenza`, segno: '-' })
      return 2
    }
    motivazioni.push({ testo: `Pagato ${giorni} giorni dopo la scadenza`, segno: '-' })
    return 0
  }

  const anticipo = -giorni
  if (anticipo <= 5) {
    motivazioni.push({ testo: `Pagato ${anticipo} giorni prima della scadenza`, segno: '-' })
    return 8
  }
  if (anticipo <= 15) {
    motivazioni.push({ testo: `Pagato ${anticipo} giorni prima della scadenza`, segno: '-' })
    return 3
  }
  motivazioni.push({ testo: `Pagato ${anticipo} giorni prima della scadenza`, segno: '-' })
  return 0
}

function punteggioControparte(
  movimento: MovimentoBanca,
  scadenza: ScadenzaCandidata,
  contesto: ContestoValutazione,
  motivazioni: Motivazione[]
): number {
  const causaleNormalizzata = normalizzaTesto(movimento.causale)

  // 1. L'alias appreso: la prova più forte, perché qualcuno l'ha confermata
  const identita = scadenza.supplierId
  if (identita) {
    for (const [testo, id] of contesto.alias) {
      if (id === identita && causaleNormalizzata.includes(testo)) {
        motivazioni.push({ testo: 'Controparte riconosciuta da un abbinamento già confermato', segno: '+' })
        return PESI.CONTROPARTE
      }
    }
  }

  // 2. L'IBAN: non ambiguo, ma non sempre presente nella causale
  if (scadenza.controparteIban) {
    const iban = normalizzaTesto(scadenza.controparteIban)
    if (iban.length >= 15 && causaleNormalizzata.includes(iban)) {
      motivazioni.push({ testo: 'IBAN della controparte presente nella causale', segno: '+' })
      return 18
    }
  }

  // 3. La partita IVA
  if (scadenza.partitaIvaControparte) {
    if (estraiPartiteIva(movimento.causale).includes(scadenza.partitaIvaControparte)) {
      motivazioni.push({ testo: 'Partita IVA della controparte presente nella causale', segno: '+' })
      return 18
    }
  }

  // 4. Il nome. Se compare **per intero e alla lettera** vale quanto l'IBAN:
  // una ragione sociale di otto caratteri o più non finisce per caso dentro la
  // causale di un bonifico. Sotto gli otto caratteri la coincidenza è
  // plausibile ("ACME" dentro "ACMEBANK") e il punteggio scende.
  if (scadenza.controparteNome) {
    const nome = normalizzaTesto(scadenza.controparteNome)
    if (nome.length >= 8 && causaleNormalizzata.includes(nome)) {
      motivazioni.push({ testo: 'Nome della controparte presente nella causale', segno: '+' })
      return 18
    }

    // Senza la forma societaria. L'estratto conto tronca le ragioni sociali —
    // «FERRO DISTRIBUZIONE SRL» in anagrafica diventa «FERRO DISTRIBUZIONEFT»
    // in causale, col riferimento incollato — e cercare il nome intero fa
    // sparire una controparte che è lì sotto gli occhi. La sigla è anche la
    // parte meno distintiva del nome: toglierla non allarga il campo, perché
    // ciò che resta deve comunque comparire per intero.
    const nudo = senzaFormaSocietaria(nome)
    if (nudo !== nome && nudo.length >= 8 && causaleNormalizzata.includes(nudo)) {
      motivazioni.push({
        testo: 'Nome della controparte presente nella causale, senza la forma societaria',
        segno: '+',
      })
      return 18
    }

    if (nome.length >= 4 && causaleNormalizzata.includes(nome)) {
      motivazioni.push({ testo: 'Nome breve della controparte presente nella causale', segno: '+' })
      return 12
    }
    if (nudo !== nome && nudo.length >= 4 && causaleNormalizzata.includes(nudo)) {
      motivazioni.push({ testo: 'Nome breve della controparte presente nella causale', segno: '+' })
      return 12
    }

    // Il ripiego per somiglianza confrontava il nome con la causale **intera**:
    // ventitré caratteri contro centocinquanta danno 0,138 contro una soglia di
    // 0,6, quindi non è mai scattato da quando esiste. Si confronta invece con
    // la finestra di causale che gli somiglia di più, che è la domanda vera:
    // «questo nome compare, storpiato, da qualche parte qui dentro?»
    const somiglianza = somiglianzaMigliore(causaleNormalizzata, nudo)
    if (somiglianza >= 0.6) {
      motivazioni.push({ testo: 'Nome della controparte simile a quello nella causale', segno: '+' })
      return 6
    }
  }

  motivazioni.push({ testo: 'Controparte non riconosciuta nella causale', segno: '-' })
  return 0
}

/**
 * La somiglianza fra un nome e la porzione di causale che gli assomiglia di
 * più, invece che con la causale intera: su un testo lungo il rapporto fra le
 * lunghezze schiaccia il punteggio a valori che nessuna soglia sensata supera.
 */
function somiglianzaMigliore(causale: string, nome: string): number {
  if (nome.length < 4) return 0

  const parole = causale.split(' ')
  const quante = Math.max(1, nome.split(' ').length)
  let migliore = 0

  for (let i = 0; i < parole.length; i++) {
    // Si guardano le finestre lunghe quanto il nome, e una parola in più: la
    // banca a volte incolla il riferimento all'ultima parola del nome.
    for (const larghezza of [quante, quante + 1]) {
      const finestra = parole.slice(i, i + larghezza).join(' ')
      if (!finestra) continue
      const punteggio = stringSimilarity(finestra, nome)
      if (punteggio > migliore) migliore = punteggio
    }
  }

  return migliore
}

function punteggioCodiceBanca(
  movimento: MovimentoBanca,
  scadenza: ScadenzaCandidata,
  contesto: ContestoValutazione,
  motivazioni: Motivazione[]
): number {
  const codice = movimento.bankTransactionCode
  if (!codice || !scadenza.metodoPagamento) return 0

  const attesi = contesto.mappaCodiciBanca.get(codice)
  // Mappa vuota o codice sconosciuto: il fattore tace. È lo stato iniziale —
  // la mappa va ricavata leggendo i movimenti veri, non inventata qui.
  if (!attesi || attesi.length === 0) return 0

  if (attesi.includes(scadenza.metodoPagamento)) {
    motivazioni.push({ testo: 'Il codice operazione della banca concorda col metodo atteso', segno: '+' })
    return PESI.CODICE_BANCA
  }

  // Il metodo scritto sulla scadenza è un'**intenzione**, presa dalla fattura o
  // dall'anagrafica; il codice della banca è un **fatto** già accaduto. Quando
  // discordano, di solito è l'intenzione a essere vecchia: una fattura che dice
  // «contanti» pagata con un bonifico dello stesso importo e con il suo numero
  // in causale è la stessa fattura, pagata in un altro modo.
  //
  // Prima il disaccordo azzerava il fattore, e quei dieci punti valevano il
  // salto di un'intera fascia. Ora vale la metà di una conferma: resta un
  // indizio, non è più un veto.
  motivazioni.push({
    testo: `Il codice operazione indica ${attesi.join(' o ')} e la scadenza dice ${scadenza.metodoPagamento}: può essere cambiato il modo di pagare`,
    segno: '-',
  })
  return Math.round(PESI.CODICE_BANCA / 2)
}

/**
 * Valuta una coppia. Torna `null` quando la coppia è impossibile — verso
 * sbagliato o scadenza già chiusa — invece di restituire un punteggio basso:
 * una proposta impossibile non è una proposta debole.
 */
export function valutaCoppia(
  movimento: MovimentoBanca,
  scadenza: ScadenzaCandidata,
  contesto: ContestoValutazione,
  /**
   * I documenti che la proposta afferma di saldare, per le proposte
   * **cumulative**: un movimento, più scadenze.
   *
   * Serve perché il fattore riferimento vale per la proposta intera, mentre le
   * gambe si scelgono per importo. Il 16 agosto 2026 un bonifico da 459,80 €
   * che nominava la fattura 177 ha prodotto due proposte da 88 punti: una con
   * le tre rate della 177, l'altra con due rate della 177 più una della 237,
   * che vale lo stesso importo. Bastava che la scadenza «rappresentante»
   * fosse nominata perché tutte le gambe ereditassero i venti punti, e la
   * proposta sbagliata finiva in fascia Alta — dove si approva in blocco senza
   * aprire le schede.
   *
   * Assente per le proposte a gamba singola, che sono la stragrande
   * maggioranza e non cambiano comportamento.
   */
  documentiDellaProposta?: Array<string | null>
): Valutazione | null {
  const importo = importoUtile(movimento, scadenza.tipo)
  if (importo <= 0) return null
  if (scadenza.residuo <= TOLLERANZA) return null

  const motivazioni: Motivazione[] = []

  const fattori: Fattori = {
    importo: punteggioImporto(importo, scadenza.residuo, motivazioni),
    riferimento: 0,
    controparte: punteggioControparte(movimento, scadenza, contesto, motivazioni),
    data: 0,
    codiceBanca: punteggioCodiceBanca(movimento, scadenza, contesto, motivazioni),
    unicita: 0,
  }

  // Il riferimento premia la proposta, non una delle sue gambe: una cumulativa
  // lo prende solo se la causale nomina OGNI documento che dice di saldare.
  // Tutto-o-niente e non proporzionale, perché questi venti punti decidono
  // l'ingresso nella fascia che si approva senza aprire le schede: là un
  // parziale è una mezza certezza spacciata per certezza.
  const documenti = documentiDellaProposta ?? [scadenza.numeroDocumento]
  const nominati = documenti.filter(
    (numero): numero is string => !!numero && contieneRiferimento(movimento.causale, numero)
  )

  if (documenti.length > 0 && nominati.length === documenti.length) {
    fattori.riferimento = PESI.RIFERIMENTO
    motivazioni.push({
      testo:
        documenti.length > 1
          ? 'La causale nomina tutte le fatture di questo pagamento cumulativo'
          : 'Riferimento della fattura presente nella causale',
      segno: '+',
    })
  } else if (documentiDellaProposta && nominati.length > 0) {
    // Silenziare la differenza sarebbe il modo migliore per non accorgersene:
    // la proposta gemella, quella con le gambe giuste, prende i venti punti e
    // vince — ma solo se questa dichiara perché li ha persi.
    motivazioni.push({
      testo: `La causale non nomina ${documenti.length - nominati.length} delle ${documenti.length} scadenze di questo pagamento cumulativo`,
      segno: '-',
    })
  }

  // daysDifference torna il valore assoluto: il verso lo ricaviamo qui, e ci
  // serve, perché ritardo e anticipo non valgono uguale
  const giorniAssoluti = daysDifference(movimento.data, scadenza.dataScadenza)
  const inRitardo = movimento.data.getTime() >= scadenza.dataScadenza.getTime()
  fattori.data = punteggioData(inRitardo ? giorniAssoluti : -giorniAssoluti, motivazioni)

  const punteggioParziale =
    fattori.importo + fattori.riferimento + fattori.controparte + fattori.data + fattori.codiceBanca

  return { fattori, motivazioni, punteggioParziale }
}

import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { logger } from '@/lib/logger'
import { formatCurrency } from '@/lib/formatters'
import { parseFatturaPA } from '@/lib/sdi/parser'
import { righeDiSistema, type RigaDiSistema } from '@/lib/sdi/righe-di-sistema'
import { TIPI_DOCUMENTO_NOTA_CREDITO } from '@/lib/services/invoice-schedule-service'
import { applicaStimaSuScadenza, ricalcolaStimeFornitore } from '@/lib/scadenzario/stima-data-attesa'
import {
  bloccaMovimento,
  bloccaScadenza,
  capienzaResiduaMovimento,
  ricalcolaStatoSchedule,
  sommaPagamenti,
  TOLLERANZA_IMPORTI,
} from '@/lib/scadenzario/stato-schedule'
import {
  aggiornaContoDominante,
  calcolaPesiConIva,
  contiScartatiConPeso,
  ripartisciProQuotaConIva,
  type RigaDaImputare,
  type TransactionClient,
} from './allocation-service'

/**
 * Riconciliazione fra movimenti di prima nota e scadenze.
 *
 * Il ciclo che questo modulo chiude: la fattura genera la scadenza, il denaro
 * si muove e produce un movimento, la riconciliazione li unisce e la scadenza
 * si salda. Senza questo passaggio scadenzario e contabilità restano due
 * racconti separati della stessa realtà.
 *
 * Due scelte prese dal modello Sibill:
 * - il rifiuto di una proposta **crea** un record REJECTED invece di
 *   cancellare, così resta traccia di cosa il sistema aveva proposto;
 * - le proposte di match non si persistono, si ricalcolano quando servono.
 *
 * Una divergenza deliberata: sulle riconciliazioni parziali Sibill riscrive lo
 * scadenzario generando una nuova scadenza per il residuo, mentre qui si
 * mantiene `importoPagato`, che il gestionale già gestisce con i pagamenti
 * parziali e la relativa interfaccia.
 */

export type ReconcileOutcome =
  | { outcome: 'ok'; reconciliationId: string; scheduleStato: string; importoPagato: number }
  | { outcome: 'schedule_not_found' }
  | { outcome: 'entry_not_found' }
  | { outcome: 'already_reconciled' }
  | { outcome: 'schedule_closed'; stato: string }
  | { outcome: 'invalid_amount'; motivo: string }
  /** La quota sfora il residuo della scadenza o la capienza del movimento. */
  | { outcome: 'amount_exceeds_capacity'; motivo: string }

export interface ReconcileInput {
  scheduleId: string
  journalEntryId: string
  venueId: string
  userId: string | null
  /** Quota imputata alla scadenza: se assente si usa il residuo o l'importo del movimento */
  amount?: number
  source?: 'MANUAL' | 'AUTOMATIC' | 'PROPOSAL' | 'RULE'
  confidence?: number
}

/**
 * Aliquota IVA di ciascuna riga dello snapshot, per numero di linea.
 *
 * Lo snapshot è JSON e arriva dal parser FatturaPA, quindi va trattato come
 * dato esterno: si accettano solo numeri finiti e non negativi, e una riga
 * senza aliquota leggibile semplicemente non entra nella mappa. Le fatture
 * importate da un fornitore che non compila `AliquotaIVA` ricadono così nel
 * comportamento precedente, che è approssimato ma non arbitrario.
 */
function aliquoteDelloSnapshot(lineItems: unknown[]): Map<number, number> {
  const mappa = new Map<number, number>()
  for (const riga of lineItems) {
    if (typeof riga !== 'object' || riga === null) continue
    const { numeroLinea, aliquotaIVA } = riga as Record<string, unknown>
    if (typeof numeroLinea !== 'number' || !Number.isFinite(numeroLinea)) continue
    if (typeof aliquotaIVA !== 'number' || !Number.isFinite(aliquotaIVA) || aliquotaIVA < 0) continue
    mappa.set(numeroLinea, aliquotaIVA)
  }
  return mappa
}

/**
 * Scrive l'IVA di testata, ma solo finché quel numero è ancora **nostro**.
 *
 * La regola di proprietà sta scritta qui una volta sola perché le due parti
 * che la usano devono per forza usarne una identica: chi scrive l'IVA
 * ereditando le fette e chi la ritira annullando la riconciliazione. Due
 * versioni anche solo leggermente diverse vorrebbero dire che l'annullo non
 * riconosce come proprio ciò che l'ereditarietà aveva scritto, e il movimento
 * resterebbe con l'IVA di una fattura che non salda più.
 *
 * Il campo è nostro quando è assente, oppure quando dista meno di mezzo
 * centesimo da `ivaAttesa` — cioè da quanto le fette dichiaravano prima di
 * questa operazione. Altrimenti ce l'ha messo qualcun altro (un essere umano
 * dalla prima nota, o la registrazione della fattura) e non si tocca.
 *
 * `ivaNuova` a `null` riporta il campo a «non dichiarata», che è cosa diversa
 * da `0`: `0` afferma un'assenza che nessuno ha constatato, `null` dice che
 * il dato non c'è. È la distinzione su cui poggia tutta la lettura del
 * prospetto, e vale anche all'indietro.
 */
async function scriviIvaDiTestataSeNostra(
  tx: TransactionClient,
  {
    journalEntryId,
    ivaAttesa,
    ivaNuova,
    contesto,
  }: {
    journalEntryId: string
    /** Quanto la testata deve dichiarare perché quel numero sia nostro. */
    ivaAttesa: number
    /** Il valore nuovo; `null` riporta il campo a «non dichiarata». */
    ivaNuova: number | null
    /** Solo per il log: da quale delle due parti si arriva. */
    contesto: 'ereditarietà' | 'annullo'
  }
): Promise<void> {
  const movimento = await tx.journalEntry.findUnique({
    where: { id: journalEntryId },
    select: { vatAmount: true },
  })
  if (!movimento) return

  if (
    movimento.vatAmount !== null &&
    Math.abs(Number(movimento.vatAmount) - ivaAttesa) > TOLLERANZA_IMPORTI
  ) {
    logger.info("L'IVA di testata è di qualcun altro: non la si tocca", {
      journalEntryId,
      contesto,
      dichiarata: Number(movimento.vatAmount),
      attesa: ivaAttesa,
      nuova: ivaNuova,
    })
    return
  }

  await tx.journalEntry.update({
    where: { id: journalEntryId },
    data: { vatAmount: ivaNuova === null ? null : new Prisma.Decimal(ivaNuova.toFixed(2)) },
  })
}

/** Somma l'IVA di un gruppo di fette. I `null` sono esclusi da chi chiama. */
function sommaIvaDelleFette(fette: { iva: Prisma.Decimal | null }[]): number {
  return fette.reduce<number>((s, f) => s + Number(f.iva ?? 0), 0)
}

/**
 * Righe di sistema (bollo, arrotondamento) di una fattura o di una nota di
 * credito, tollerante a un XML mancante o non più parsabile: si assume
 * nessuna riga di sistema invece di far fallire l'intera ereditarietà.
 * Condivisa fra la fattura rettificata e le note di credito che la
 * rettificano (Task 6): stesso comportamento, messaggio di log diverso per
 * dire subito a chi documento appartiene l'XML che non si legge più.
 */
function righeSistemaTolleranti(
  xmlContent: string | null,
  messaggioErrore: string,
  contesto: Record<string, unknown>
): RigaDiSistema[] {
  if (!xmlContent) return []
  try {
    return righeDiSistema(parseFatturaPA(xmlContent))
  } catch (error) {
    logger.warn(messaggioErrore, { ...contesto, error })
    return []
  }
}

/**
 * Porta sulla testata l'IVA che le fette appena scritte dichiarano.
 *
 * Perché serve. Il movimento che salda una fattura nasce senza IVA su tutti e
 * tre i percorsi automatici — import bancario, motore delle regole,
 * esecuzione di un pagamento — mentre le fette ereditate portano quella
 * esatta di ciascuna aliquota. Il prospetto di cash flow toglie alla testata
 * l'IVA di ogni fetta, e una testata che ne dichiara zero finiva a −122 su
 * una fattura mista da 1.222: un'IVA negativa su un conto, cioè un numero che
 * in questo dominio non esiste. Il prospetto ora si difende da sé con un
 * tetto (vedi `aggregaMovimenti`), ma il tetto da solo avrebbe lasciato in
 * archivio movimenti che dichiarano zero IVA a fronte di un documento che ne
 * ha: il campo vuoto è un difetto del dato, non della lettura.
 *
 * Quando si scrive, in ordine di importanza:
 *
 * 1. **Mai sopra un numero scritto da un essere umano.** Il campo si tocca
 *    solo se è ancora *nostro*: assente, oppure esattamente uguale all'IVA
 *    delle fette che c'erano prima di questa scrittura. Un movimento può
 *    saldare più scadenze e ogni riconciliazione aggiunge le proprie fette:
 *    la regola lascia alla seconda la facoltà di aggiornare il totale, e a
 *    entrambe il divieto di sovrascrivere un valore che non hanno messo loro.
 * 2. **Solo quando l'IVA è davvero nota.** Se una fetta scritta non la
 *    dichiara — la regola del tutto-o-niente le rende esatte o `null` per
 *    fattura intera — la testata resta com'è. Lo stesso se non la dichiara
 *    una fetta preesistente: senza il loro totale non si può nemmeno decidere
 *    se il numero in testata sia nostro.
 *
 * Il valore scritto è un modulo positivo, come fa la registrazione di una
 * fattura in `invoices/[id]/record`: il verso lo decide `ripartisciIva` dal
 * lato valorizzato del movimento. Sui pagamenti parziali non si riscala
 * nulla: le fette sono già state ridotte da `ripartisciProQuotaConIva`,
 * quindi la loro IVA è già quella pagata.
 */
async function aggiornaIvaDiTestata(
  tx: TransactionClient,
  {
    journalEntryId,
    fettePrecedenti,
    ivaScritte,
  }: {
    journalEntryId: string
    /** Le fette già presenti PRIMA di questa scrittura. */
    fettePrecedenti: { iva: Prisma.Decimal | null }[]
    /** L'IVA delle fette appena scritte. */
    ivaScritte: (number | null)[]
  }
): Promise<void> {
  if (ivaScritte.some((iva) => iva === null)) return
  if (fettePrecedenti.some((f) => f.iva === null)) return

  const ivaPreesistente = sommaIvaDelleFette(fettePrecedenti)
  // Il `?? 0` è irraggiungibile — il `some` qui sopra ha già escluso ogni
  // `null` — ma il tipo dell'array resta nullable e `reduce` lo eredita.
  const nuovoTotale = ivaScritte.reduce<number>((s, iva) => s + (iva ?? 0), ivaPreesistente)

  await scriviIvaDiTestataSeNostra(tx, {
    journalEntryId,
    ivaAttesa: ivaPreesistente,
    ivaNuova: nuovoTotale,
    contesto: 'ereditarietà',
  })
}

/**
 * Ritira dalla testata l'IVA delle fette che l'annullo sta cancellando.
 *
 * È lo specchio di `aggiornaIvaDiTestata`, e senza di esso l'ereditarietà
 * lascerebbe dietro di sé un difetto che prima del 12 agosto 2026 non poteva
 * esistere: `vatAmount` restava sempre `null`, quindi non c'era nulla da
 * ritirare. Ora un movimento annullato conserverebbe l'IVA della fattura che
 * non salda più — e se poi ne saldasse un'altra, la regola di proprietà si
 * asterrebbe (giustamente: quel numero non è più suo) lasciandocela per
 * sempre. Sul prospetto è il difetto di C1 col segno rovesciato: la testata
 * dichiara più di quanto le fette chiedano, il tetto di `aggregaMovimenti` non
 * morde perché interviene nel verso opposto, e il conto dominante si gonfia
 * della differenza mentre il blocco IVA riceve il totale vecchio. Bonifico da
 * 1.222 riconciliato con una fattura da 122 di IVA, annullato, poi
 * riconciliato con una da 50: 72 € di IVA senza più un importo a cui
 * appartenere, e 72 € di troppo sul conto più grosso.
 *
 * Il valore nuovo è l'IVA delle fette che **restano**: un bonifico cumulativo
 * di cui si annulla una sola riconciliazione scende all'IVA della superstite.
 * Se non ne resta nessuna si torna a `null` — non a `0` — perché il movimento
 * è tornato non riconciliato, cioè esattamente lo stato di prima.
 *
 * Se una qualsiasi delle fette coinvolte non dichiara l'IVA, la somma non è
 * calcolabile: ci si astiene e lo si registra. È la stessa guardia della
 * scrittura, e per la stessa ragione — senza quel totale il valore memorizzato
 * non potrebbe comunque risultare nostro.
 *
 * Esportata per il riallineamento (Task 7, `src/lib/invoices/riallineamento.ts`):
 * cancellare le fette di una riconciliazione per rigenerarle è lo stesso
 * identico problema di un annullo — l'IVA che se ne va va ritirata con la
 * stessa regola di proprietà — e la firma non distingue i due contesti.
 */
export async function ritiraIvaDiTestata(
  tx: TransactionClient,
  {
    journalEntryId,
    reconciliationId,
    fettePrima,
  }: {
    journalEntryId: string
    /** La riconciliazione annullata: le sue fette sono quelle appena sparite. */
    reconciliationId: string
    /** TUTTE le fette del movimento come stavano PRIMA della cancellazione. */
    fettePrima: { iva: Prisma.Decimal | null; reconciliationId: string | null }[]
  }
): Promise<void> {
  if (fettePrima.some((f) => f.iva === null)) {
    logger.info("Fette senza IVA dichiarata: l'annullo lascia l'IVA di testata com'è", {
      journalEntryId,
      reconciliationId,
    })
    return
  }

  const restano = fettePrima.filter((f) => f.reconciliationId !== reconciliationId)

  await scriviIvaDiTestataSeNostra(tx, {
    journalEntryId,
    ivaAttesa: sommaIvaDelleFette(fettePrima),
    ivaNuova: restano.length === 0 ? null : sommaIvaDelleFette(restano),
    contesto: 'annullo',
  })
}

/**
 * Le righe delle note di credito che rettificano `invoiceId`, pronte da
 * sottrarre ai pesi della fattura — imponibile già col segno invertito, così
 * chi chiama deve solo concatenarle a `righeDaImputare` e passare tutto a
 * `calcolaPesiConIva`: la funzione fa già la sottrazione da sé (una riga
 * pulizia +122 / −122 somma a zero e sparisce col filtro esistente).
 *
 * Ritorna `null` quando una delle due guardie del Task 6 consiglia di
 * astenersi dall'INTERA ereditarietà (non solo dalla sottrazione), array
 * vuoto se non c'è nessuna nota collegata.
 *
 * - **Guardia 1**: una nota non imputata per intero. Sottrarne solo una
 *   parte darebbe un risultato peggiore di non sottrarre nulla, perché
 *   sembrerebbe corretto. La copertura si giudica come quella della fattura:
 *   numeri di linea DISTINTI imputati (righe vere + righe di sistema della
 *   nota stessa), non un conteggio di righe.
 * - **Guardia 2**: un peso che risulterebbe negativo (la nota è più grande
 *   della riga che rettifica). Si confrontano i pesi calcolati
 *   SEPARATAMENTE su fattura e nota, PRIMA di combinarli: dopo il filtro di
 *   `calcolaPesiConIva` un totale esattamente zero (nota che azzera la riga,
 *   il caso atteso) e uno negativo sono indistinguibili — il filtro li
 *   scarta allo stesso modo — quindi il confronto va fatto prima, non dopo.
 *
 * **`documentType` filtrato a `TIPI_DOCUMENTO_NOTA_CREDITO`** (TD04/TD08):
 * `rettificaInvoiceId` si valorizza anche per le note di DEBITO (TD05/TD09,
 * vedi `route.ts`), che rettificano una fattura ma nel verso opposto —
 * aumentano il dovuto, non lo riducono. Sottrarre una nota di debito come se
 * fosse di credito inverte il segno due volte: un errore di importo doppio,
 * sul conto sbagliato. Il filtro sta nella query, non dopo averle lette: una
 * nota di debito non deve nemmeno entrare nel ciclo qui sotto.
 */
async function righeDaSottrarreNote(
  tx: TransactionClient,
  invoiceId: string,
  righeFattura: RigaDaImputare[]
): Promise<RigaDaImputare[] | null> {
  const note = await tx.electronicInvoice.findMany({
    where: { rettificaInvoiceId: invoiceId, documentType: { in: [...TIPI_DOCUMENTO_NOTA_CREDITO] } },
    select: { id: true, lineItems: true, xmlContent: true },
  })
  if (note.length === 0) return []

  const righeNota: RigaDaImputare[] = []
  for (const nota of note) {
    // Nessuna riga estratta: come per la fattura stessa (poco sopra in
    // `ereditaFetteDaFattura`), non si assume `righeAttese = 0` — sarebbe
    // vero per costruzione e nasconderebbe uno snapshot mancante o corrotto.
    // Si astiene e si logga, invece di trattare una nota "senza dati" come
    // se non avesse nulla da sottrarre.
    if (!Array.isArray(nota.lineItems)) {
      logger.info("Nota di credito senza righe estratte: l'ereditarietà si astiene dall'intera fattura", {
        invoiceId,
        notaId: nota.id,
      })
      return null
    }

    const righeSistemaNota = righeSistemaTolleranti(
      nota.xmlContent,
      'XML della nota di credito non parsabile: si assume nessuna riga di sistema',
      { invoiceId: nota.id }
    )

    const imputazioniNota = await tx.invoiceLineAccount.findMany({
      where: { invoiceId: nota.id, stato: 'confermata' },
      select: { accountId: true, importo: true, numeroLinea: true },
    })

    const numeroLineeImputate = new Set(imputazioniNota.map((r) => r.numeroLinea)).size
    const righeAttese = nota.lineItems.length + righeSistemaNota.length
    if (numeroLineeImputate < righeAttese) {
      logger.info("Nota di credito non imputata per intero: l'ereditarietà si astiene dall'intera fattura", {
        invoiceId,
        notaId: nota.id,
        righe: righeAttese,
        confermate: numeroLineeImputate,
      })
      return null
    }

    const aliquotePerLineaNota = aliquoteDelloSnapshot(nota.lineItems)
    for (const riga of righeSistemaNota) {
      aliquotePerLineaNota.set(riga.numeroLinea, riga.aliquota)
    }

    for (const r of imputazioniNota) {
      righeNota.push({
        accountId: r.accountId,
        imponibile: Number(r.importo),
        aliquota: aliquotePerLineaNota.get(r.numeroLinea),
      })
    }
  }

  if (righeNota.length === 0) return []

  const pesiFatturaSola = calcolaPesiConIva(righeFattura)
  const pesiNotaSola = calcolaPesiConIva(righeNota)
  const importoFatturaPerConto = new Map(pesiFatturaSola.map((p) => [p.accountId, p.importo]))

  const pesoNegativo = pesiNotaSola.find(
    (n) => n.importo > (importoFatturaPerConto.get(n.accountId) ?? 0) + TOLLERANZA_IMPORTI
  )
  if (pesoNegativo) {
    logger.warn(
      'Nota di credito più grande della riga che rettifica: il peso risultante sarebbe negativo, ereditarietà sospesa',
      {
        invoiceId,
        accountId: pesoNegativo.accountId,
        importoNota: pesoNegativo.importo,
        importoFattura: importoFatturaPerConto.get(pesoNegativo.accountId) ?? 0,
      }
    )
    return null
  }

  return righeNota.map((r) => ({ ...r, imponibile: -r.imponibile }))
}

/**
 * Eredità pro-quota: se la scadenza viene da una fattura le cui righe sono
 * TUTTE categorizzate per conto, il movimento che la salda eredita le stesse
 * fette (Fase 3). Chiamata dentro la transazione di `reconcileScheduleWithEntry`:
 * non è best-effort, se fallisce la riconciliazione fallisce con lei.
 *
 * Copertura totale: `lineItems` (snapshot JSON delle righe fattura) deve
 * essere un array e ogni riga deve avere una imputazione in
 * `invoice_line_accounts`, proposta o confermata che sia (una riga in
 * tabella conta come categorizzata). Copertura parziale o fattura senza
 * righe estratte → nessuna ereditarietà, silenziosa (solo un log info).
 *
 * Le fette 'manuale' già presenti sul movimento vincono sempre su una
 * riconciliazione NUOVA: se ce ne sono, questa funzione è un no-op. In
 * rigenerazione (`rigenerazione: true`) no: vedi il commento sulla guardia,
 * più sotto, per il perché.
 *
 * L'ereditarietà non rifiuta mai una riconciliazione per il centro di costo —
 * bloccarla per un dato che l'utente non sta toccando sarebbe peggio — ma il
 * centro va comunque rivalutato, e questo è un percorso automatico. Il
 * movimento importato dall'estratto conto nasce senza conto, quindi con il
 * centro che si dà a chi non ne ha uno; il conto arriva solo ora, con le
 * fette della fattura, e può essere di quelli che un centro lo pretendono.
 * Se ne occupa `aggiornaContoDominante` in contesto automatico, che imputa al
 * centro operativo predefinito quanto non è stato scelto da nessuno e lascia
 * il movimento da verificare.
 *
 * **Esportata e ritorna il numero di fette scritte** (0 se una guardia si è
 * astenuta) per essere richiamata una seconda volta dal riallineamento (Task
 * 7, `src/lib/invoices/riallineamento.ts`): stessa funzione, non una copia
 * della logica. Chi riallinea cancella prima le fette `ereditata` della
 * riconciliazione e richiama questa funzione con lo stesso `reconciliationId`
 * e la stessa `quota`: la rilettura di `invoice_line_accounts` che segue è
 * l'unica differenza, ed è proprio quella differenza a produrre fette nuove
 * dalle imputazioni correnti invece che da quelle di quando la fattura fu
 * pagata.
 */
export async function ereditaFetteDaFattura(
  tx: TransactionClient,
  {
    journalEntryId,
    invoiceId,
    reconciliationId,
    quota,
    importoUtileMovimento,
    rigenerazione = false,
  }: {
    journalEntryId: string
    invoiceId: string
    reconciliationId: string
    quota: number
    /** Importo utile del movimento (debit ?? credit): tetto che nessuna fetta, manuale o ereditata, può superare */
    importoUtileMovimento: number
    /**
     * `true` solo quando chiama `riallineaFette` (Task 7): salta la guardia
     * "le manuali vincono", non le altre sei. Vedi il commento sulla
     * guardia più sotto per il perché.
     */
    rigenerazione?: boolean
  }
): Promise<number> {
  const invoice = await tx.electronicInvoice.findUnique({
    where: { id: invoiceId },
    select: { lineItems: true, xmlContent: true },
  })

  if (!invoice || !Array.isArray(invoice.lineItems)) {
    logger.info('Fattura senza righe estratte: nessuna ereditarietà pro-quota', { invoiceId })
    return 0
  }

  // Bollo e arrotondamento (Task 4) sono righe imputabili ma vivono fuori da
  // `lineItems`: la copertura piena deve contarli anche loro, o la guardia
  // sotto si convincerebbe che una fattura col bollo è coperta anche quando
  // il bollo non è mai stato imputato a nessun conto. Si tiene l'ARRAY, non
  // solo la lunghezza: serve più sotto per dare un'aliquota (sempre 0, vedi
  // `RigaDiSistema`) anche a queste righe quando si costruisce
  // `aliquotePerLinea` — altrimenti `aliquotePerLinea.get(-1)` risulterebbe
  // `undefined` e farebbe cadere `ivaNota` in `calcolaPesiConIva` per l'INTERO
  // movimento (vedi commento più sotto, dove la mappa si costruisce).
  //
  // Serve l'XML, che qui può mancare (fatture importate prima che si
  // iniziasse a conservarlo, o create nei test senza) oppure non essere più
  // parsabile. In entrambi i casi si assume nessuna riga di sistema invece di
  // astenersi dall'intera ereditarietà: è lo stesso comportamento di prima di
  // questo task su ogni fattura che non ha mai avuto un bollo — cioè la
  // maggioranza — e non un rischio nuovo, perché lineItems viene dalla stessa
  // importazione che avrebbe scritto anche l'XML: se manca uno raramente c'è
  // l'altro.
  const righeSistema = righeSistemaTolleranti(
    invoice.xmlContent,
    'XML della fattura non parsabile: si assume nessuna riga di sistema',
    { invoiceId }
  )

  // SOLO le imputazioni che un essere umano ha confermato.
  //
  // Senza questo filtro esisteva un percorso interamente automatico
  // dall'ipotesi del modello fino al conto su cui il budget conta i soldi:
  // le righe 'proposta' — quelle gialle che nessuno ha ancora guardato —
  // pesavano quanto le confermate, `aggiornaContoDominante` riscriveva
  // `JournalEntry.accountId` con il conto della fetta più grossa, e il budget
  // imputava lì l'INTERO importo del movimento. Fattura mista da 1.200 €
  // ipotizzata 700 «Pulizie» / 500 «Alimentari» → 1.200 € su Pulizie.
  //
  // Il conto scelto dal titolare o da una regola dello scadenzario veniva
  // sovrascritto senza avviso, e l'audit registra la riconciliazione ma non la
  // riscrittura del conto: il valore precedente non è salvato da nessuna
  // parte. Un difetto che cancellava le proprie tracce.
  const imputazioni = await tx.invoiceLineAccount.findMany({
    where: { invoiceId, stato: 'confermata' },
    select: { accountId: true, importo: true, numeroLinea: true },
  })

  // La guardia contava le righe senza guardarne lo stato, quindi una fattura
  // interamente gialla la superava. Col filtro sopra, una fattura mezza
  // confermata non arriva al conteggio pieno e l'astensione scatta da sé.
  //
  // Si contano i numeri di linea DISTINTI imputati, non le righe: dal Task 5
  // una riga fattura potrà ricevere più imputazioni (un fornitore che
  // accorpa articoli diversi in una riga sola), e contare le righe
  // supererebbe la soglia anche col bollo mai imputato — due imputazioni su
  // due numeri di linea diversi e una riga divisa in due danno entrambe 3
  // righe, ma solo la prima copre davvero 3 numeri di linea. Oggi le due
  // misure coincidono, perché un vincolo unique ammette una sola imputazione
  // per numeroLinea, ma scriverla così non costa nulla e toglie un bug latente.
  const numeroLineeImputate = new Set(imputazioni.map((r) => r.numeroLinea)).size
  const righeAttese = invoice.lineItems.length + righeSistema.length
  if (numeroLineeImputate < righeAttese) {
    logger.info('Righe fattura non tutte confermate: nessuna ereditarietà pro-quota', {
      invoiceId,
      righe: righeAttese,
      confermate: numeroLineeImputate,
    })
    return 0
  }

  // I pesi sono i `PrezzoTotale` delle righe, cioè IMPONIBILI; la quota da
  // ripartire è un pagamento, cioè LORDO. Applicare proporzioni al netto su un
  // importo lordo sbaglia ogni volta che le aliquote non sono uniformi:
  // alimentari 1.000 € + 4% e detersivi 200 € + 22% fanno 1.284 € pagati, ma
  // sui soli imponibili la ripartizione dà 1.070 € e 214 € invece di 1.040 € e
  // 244 €. Trenta euro sul conto sbagliato, il 2,3% della fattura, e su una
  // fattura di sole bevande e detersivi lo scarto è più marcato ancora. Con
  // aliquote uguali fra le righe il fattore si semplifica e non cambia nulla.
  const aliquotePerLinea = aliquoteDelloSnapshot(invoice.lineItems)
  // Bollo e arrotondamento non hanno una riga in `lineItems`, quindi restano
  // fuori dalla mappa sopra: senza questo, `aliquotePerLinea.get(numeroLinea)`
  // sul bollo tornerebbe `undefined`, e in `calcolaPesiConIva` basta UNA riga
  // con aliquota `undefined` perché `ivaNota` cada per l'intero movimento —
  // ogni fetta, non solo quella del bollo, verrebbe scritta con `iva: null`.
  // La loro aliquota è sempre 0 (`RigaDiSistema.aliquota`), quindi qui si
  // dichiara esplicitamente zero invece di lasciarla assente.
  for (const riga of righeSistema) {
    aliquotePerLinea.set(riga.numeroLinea, riga.aliquota)
  }

  // Le fette già sul movimento, lette una volta sola perché servono a tre
  // cose: sapere se ce n'è una manuale (vince sempre su una riconciliazione
  // NUOVA, non in rigenerazione — vedi sotto), sommarne gli importi per il
  // tetto di capienza, e sapere quanta IVA dichiarano — è ciò che stabilisce
  // se l'IVA di testata è ancora nostra (`aggiornaIvaDiTestata`).
  const esistenti = await tx.journalEntryAllocation.findMany({
    where: { journalEntryId },
    select: { origine: true, importo: true, iva: true },
  })
  // "Le manuali vincono sempre" nasce per la riconciliazione NUOVA: non
  // aggiungere fette ereditate dove un umano ha già diviso a mano il
  // movimento, perché quella divisione non sapeva nulla di questa fattura.
  // In RIGENERAZIONE (`rigenerazione: true`, solo da `riallineaFette`, Task
  // 7) la premessa è diversa: le fette ereditate di QUESTA riconciliazione
  // esistevano già ed erano state appena cancellate per essere riscritte —
  // la fetta manuale coesisteva già con loro, è la divisione legittima del
  // residuo che la spec (sezione 3) prevede e che `setEntryAllocations`
  // ammette esplicitamente accanto alle ereditate. Bloccare la rigenerazione
  // per la sola presenza di quella fetta lascerebbe "le manuali vincono"
  // (spec sezione 2: le fette manuali restano intoccate) fraintesa come "le
  // manuali impediscono", e il movimento mostrerebbe per sempre un avviso
  // che nessuna azione può chiudere se non cancellando lo split manuale. Il
  // vincolo vero resta la capienza, verificata comunque due righe sotto con
  // gli stessi `esistenti`: qui si salta solo il rifiuto per la presenza in
  // sé di una fetta manuale, non il tetto che impedisce di sforare il
  // movimento.
  if (esistenti.some((f) => f.origine === 'manuale') && !rigenerazione) return 0 // le manuali vincono sempre

  // Un movimento può riconciliare più scadenze (es. un bonifico cumulativo):
  // ogni riconciliazione calcola la propria quota sul disponibile pieno del
  // movimento, senza sapere quanto le riconciliazioni precedenti hanno già
  // ereditato. Senza questo controllo la somma delle fette può superare
  // l'importo del movimento, rompendo l'invariante che setEntryAllocations
  // difende sullo split manuale. Se sfora, l'ereditarietà si astiene (skip
  // silenzioso, coerente con le altre guardie della funzione): la
  // riconciliazione della scadenza procede comunque.
  const sommaEsistenti = esistenti.reduce((s, f) => s + Number(f.importo), 0)
  if (sommaEsistenti + quota > importoUtileMovimento + 0.01) {
    logger.warn('Ereditarietà pro-quota: la quota sforerebbe l\'importo utile del movimento, si salta', {
      journalEntryId,
      invoiceId,
      quota,
      sommaEsistenti,
      importoUtileMovimento,
    })
    return 0
  }

  const righeDaImputare = imputazioni.map((r) => ({
    accountId: r.accountId,
    imponibile: Number(r.importo),
    aliquota: aliquotePerLinea.get(r.numeroLinea),
  }))

  // Task 6: le note di credito che rettificano questa fattura entrano nel
  // calcolo dei pesi, righe imputate col segno invertito — nessuna scadenza
  // negativa, nessuna modifica allo scadenzario, solo un'ereditarietà più
  // esatta. `null` significa che una delle due guardie ha chiesto di
  // astenersi dall'INTERA ereditarietà (già loggato da chi l'ha deciso).
  const righeNotaDaSottrarre = await righeDaSottrarreNote(tx, invoiceId, righeDaImputare)
  if (righeNotaDaSottrarre === null) return 0

  let righeCombinate = righeDaImputare.concat(righeNotaDaSottrarre)
  let pesi = calcolaPesiConIva(righeCombinate)

  // Guardia sulla premessa della sottrazione (Task 6, round 2): si sottrae la
  // nota perché si presume che QUESTO pagamento sia già al netto della nota.
  // Se la quota supera il totale ridotto, quella premessa è falsa — la nota
  // sarà compensata altrove, non qui — e sottrarla comunque sposterebbe tutto
  // sull'ultimo conto rimasto: `ripartisciProQuota` chiude sempre sull'intera
  // quota, quindi un pagamento pieno di 1.222 su pesi ridotti a 1.100 (sola
  // alimentari, pulizia azzerata dalla nota) darebbe 1.222 su alimentari e 0
  // su pulizia — un conto che non ha mai visto un centesimo di quella cifra.
  // Si torna ai pesi pieni della fattura, non ci si astiene: qui, a
  // differenza delle guardie 1 e 2, la risposta giusta esiste e si conosce.
  //
  // `pesi.every(iva !== null)`: il confronto regge solo se i pesi sono LORDI
  // quanto la quota. Basta una riga senza aliquota nello snapshot perché
  // `calcolaPesiConIva` cada nel tutto-o-niente — `iva: null` su ogni peso, e
  // il peso di quella riga resta l'imponibile nudo (`aliquota ?? 0`). Da lì
  // in poi si confronterebbe un pagamento lordo con una somma che lordo non
  // è: il divario è tutta l'IVA delle righe illeggibili, quindi `quota >
  // totaleRidotto` risulta vero quasi sempre e la nota di credito non
  // verrebbe MAI sottratta su quella classe di fatture — Task 6 spento in
  // silenzio, con un log che per giunta afferma il falso («non compensata su
  // questo pagamento»: compensata lo era, sbagliato era il confronto).
  // Quando l'IVA non è nota si rinuncia alla guardia, non alla sottrazione:
  // la premessa della sottrazione resta la migliore che si abbia.
  if (righeNotaDaSottrarre.length > 0 && pesi.every((p) => p.iva !== null)) {
    const totaleRidotto = pesi.reduce((s, p) => s + p.importo, 0)
    if (quota > totaleRidotto + TOLLERANZA_IMPORTI) {
      logger.info('Nota di credito non compensata su questo pagamento: si usano i pesi pieni della fattura', {
        invoiceId,
        journalEntryId,
        quota,
        totaleRidotto,
      })
      righeCombinate = righeDaImputare
      pesi = calcolaPesiConIva(righeCombinate)
    }
  } else if (righeNotaDaSottrarre.length > 0) {
    // Il ramo opposto (sopra) logga quando la guardia SCATTA; questo logga
    // quando la guardia SALTA — c'è una nota da sottrarre, ma il confronto
    // non si può fare perché almeno una riga non ha un'aliquota leggibile
    // (`pesi` sono `iva: null` su ogni fetta, tutto-o-niente di
    // `calcolaPesiConIva`). Si sottrae comunque, senza verificare la
    // compensazione — la premessa della sottrazione resta la migliore che si
    // abbia (vedi il commento sopra) — ma senza questo log, il giorno in cui
    // quella scelta si rivelasse sbagliata su un pagamento non compensato non
    // resterebbe traccia di quale dei due rami sia stato preso.
    logger.info(
      'Guardia sulla premessa della sottrazione saltata: aliquota non leggibile su almeno una riga, si sottrae comunque senza verificare la compensazione',
      { invoiceId, journalEntryId, quota }
    )
  }

  // Un conto sparito dai pesi portandosi via qualcosa è quasi sempre una riga
  // di sconto o di reso a `PrezzoTotale` negativo DENTRO QUESTA STESSA
  // fattura — che il parser non normalizza — non la nota di credito appena
  // sottratta qui sopra (documento a parte, con le sue guardie dedicate). La
  // quota si ripartisce comunque fra i conti rimasti, che si prendono anche
  // la sua parte, IVA compresa: ogni fetta resta fedele alla propria aliquota
  // ma il totale non è più quello del documento. È l'approssimazione minore
  // fra quelle disponibili — il perché, con i numeri, sta nel docblock di
  // `calcolaPesiConIva` — e finché anche questa riga non entrerà nei pesi col
  // proprio segno, l'unica cosa che si può fare in più è non lasciarla
  // silenziosa. Il conteggio ignora i conti che si annullano da sé (la riga
  // in omaggio, o la riga e il suo storno): spariscono anche loro, ma senza
  // togliere niente a nessuno. Si conta ancora sulle sole righe della
  // fattura: la nota, con le sue guardie, non aggiunge un caso nuovo qui.
  const scartati = contiScartatiConPeso(righeDaImputare)
  if (scartati > 0) {
    logger.warn('Fattura con righe scartate dai pesi: le fette quadrano con la quota, non con il documento', {
      invoiceId,
      journalEntryId,
      contiScartati: scartati,
      contiNeiPesi: pesi.length,
    })
  }

  const fette = ripartisciProQuotaConIva(pesi, quota)
  if (fette.length === 0) return 0

  await tx.journalEntryAllocation.createMany({
    data: fette.map((f) => ({
      journalEntryId,
      accountId: f.accountId,
      importo: new Prisma.Decimal(f.importo.toFixed(2)),
      iva: f.iva === null ? null : new Prisma.Decimal(f.iva.toFixed(2)),
      origine: 'ereditata',
      reconciliationId,
    })),
  })

  await aggiornaIvaDiTestata(tx, {
    journalEntryId,
    fettePrecedenti: esistenti,
    ivaScritte: fette.map((f) => f.iva),
  })

  await aggiornaContoDominante(tx, journalEntryId, 'automatico')

  return fette.length
}

/**
 * Il corpo della riconciliazione, dentro una transazione GIÀ APERTA.
 *
 * Esportata perché il pagamento in contanti deve creare il movimento di cassa
 * e riconciliarlo nello stesso atto: Prisma non annida transazioni
 * interattive, quindi chi ha già una `tx` in mano entra da qui invece che da
 * `reconcileScheduleWithEntry`, che la transazione la apre lui.
 *
 * Restituisce l'esito INTERNO, che porta con sé `stato`: il seguito —
 * ricalcolo delle stime del fornitore e log — vive in `dopoLaRiconciliazione`,
 * perché va fatto fuori dalla transazione da entrambi i chiamanti.
 */
export async function riconciliaInTransazione(
  tx: TransactionClient,
  {
    scheduleId,
    journalEntryId,
    venueId,
    userId,
    amount,
    source = 'MANUAL',
    confidence,
  }: ReconcileInput
) {
  const entry = await bloccaMovimento(tx, journalEntryId, venueId)
  if (!entry) return { outcome: 'entry_not_found' } as const

  const schedule = await bloccaScadenza(tx, scheduleId, venueId)
  if (!schedule) return { outcome: 'schedule_not_found' } as const

  if (schedule.stato === 'pagata' || schedule.stato === 'annullata') {
    return { outcome: 'schedule_closed', stato: schedule.stato } as const
  }

  const esistente = await tx.scheduleReconciliation.findFirst({
    where: { scheduleId, journalEntryId, status: 'VERIFIED' },
    select: { id: true },
  })
  if (esistente) return { outcome: 'already_reconciled' } as const

  const { utile, disponibile } = await capienzaResiduaMovimento(tx, entry, schedule.tipo)

  if (utile <= 0) {
    return {
      outcome: 'invalid_amount',
      motivo:
        schedule.tipo === 'attiva'
          ? 'Il movimento non è un incasso: non può saldare una scadenza attiva'
          : 'Il movimento non è un\'uscita: non può saldare una scadenza passiva',
    } as const
  }

  if (disponibile <= TOLLERANZA_IMPORTI) {
    return {
      outcome: 'amount_exceeds_capacity',
      motivo: `Il movimento è già interamente imputato ad altre scadenze (${formatCurrency(utile)} impegnati)`,
    } as const
  }

  // Il residuo si ricava dai pagamenti registrati, non dal contatore sulla
  // scadenza: se quel contatore è andato in deriva, la somma lo risana.
  const { pagato } = await sommaPagamenti(tx, scheduleId)
  const residuo = Number(schedule.importoTotale) - pagato

  // Senza indicazione esplicita si imputa il minore fra residuo e capienza
  // del movimento: un bonifico cumulativo copre la scadenza fino a concorrenza
  const quota = amount ?? Math.min(residuo, disponibile)

  if (quota <= 0) {
    return { outcome: 'invalid_amount', motivo: 'La quota da imputare deve essere positiva' } as const
  }
  if (quota > residuo + TOLLERANZA_IMPORTI) {
    return {
      outcome: 'amount_exceeds_capacity',
      motivo: `La quota supera il residuo della scadenza (${formatCurrency(residuo)})`,
    } as const
  }
  if (quota > disponibile + TOLLERANZA_IMPORTI) {
    return {
      outcome: 'amount_exceeds_capacity',
      motivo: `La quota supera la capienza residua del movimento (${formatCurrency(disponibile)} ancora liberi su ${formatCurrency(utile)})`,
    } as const
  }

  const payment = await tx.schedulePayment.create({
    data: {
      scheduleId,
      importo: new Prisma.Decimal(quota.toFixed(2)),
      dataPagamento: entry.date,
      note: `Riconciliato con il movimento: ${entry.description}`,
    },
  })

  const reconciliation = await tx.scheduleReconciliation.create({
    data: {
      scheduleId,
      journalEntryId,
      status: 'VERIFIED',
      source,
      amount: new Prisma.Decimal(quota.toFixed(2)),
      confidence: confidence !== undefined ? new Prisma.Decimal(confidence.toFixed(2)) : null,
      paymentId: payment.id,
      createdById: userId,
    },
  })

  // Aggancio pro-quota (Fase 3): dentro la transazione, non best-effort.
  if (schedule.invoiceId) {
    await ereditaFetteDaFattura(tx, {
      journalEntryId,
      invoiceId: schedule.invoiceId,
      reconciliationId: reconciliation.id,
      quota,
      importoUtileMovimento: utile,
    })
  }

  const stato = await ricalcolaStatoSchedule(tx, scheduleId)
  if (!stato) return { outcome: 'schedule_not_found' } as const

  return { outcome: 'ok', reconciliationId: reconciliation.id, quota, stato } as const
}

export type EsitoInterno = Awaited<ReturnType<typeof riconciliaInTransazione>>

/**
 * Collega un movimento a una scadenza e aggiorna lo stato di quest'ultima.
 *
 * Tutto in transazione, letture comprese: prima si bloccano movimento e
 * scadenza (in quest'ordine, sempre: l'ordine inverso in un altro percorso
 * produrrebbe deadlock), poi si decide. Leggere fuori dalla transazione e
 * decidere dentro — come faceva la versione precedente — significa prendere le
 * decisioni su numeri che nel frattempo possono essere cambiati.
 *
 * Due tetti, non uno: la quota non può superare il residuo della *scadenza*,
 * né la capienza ancora libera del *movimento*. Senza il secondo, un bonifico
 * da 100 € poteva figurare come saldo di 500 € di scadenze diverse.
 */
export async function reconcileScheduleWithEntry(
  input: ReconcileInput
): Promise<ReconcileOutcome> {
  const esegui = () => prisma.$transaction((tx) => riconciliaInTransazione(tx, input))

  let risultato: EsitoInterno
  try {
    risultato = await esegui()
  } catch (error) {
    // Rete di sicurezza del vincolo `ux_schedule_reconciliations_coppia_verificata`:
    // se due richieste arrivassero comunque in fondo insieme, la perdente
    // esce da qui come "già riconciliata" invece che come errore interno.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return { outcome: 'already_reconciled' }
    }
    throw error
  }

  return dopoLaRiconciliazione(risultato, input)
}

/**
 * Il seguito della riconciliazione, FUORI dalla transazione.
 *
 * Ricalcolo delle stime del fornitore e log: lo devono fare entrambi i
 * chiamanti — la rotta delle riconciliazioni e quella del pagamento in
 * contanti — e tenerlo dentro la transazione allungherebbe il blocco sulle
 * righe per un lavoro che non ha bisogno di essere atomico con esse.
 */
export async function dopoLaRiconciliazione(
  risultato: EsitoInterno,
  { scheduleId, journalEntryId, venueId, source = 'MANUAL' }: ReconcileInput
): Promise<ReconcileOutcome> {
  if (risultato.outcome !== 'ok') {
    return risultato
  }

  // La storia del fornitore è cambiata: le stime delle sue scadenze aperte
  // si aggiornano. Best-effort: non blocca mai la riconciliazione
  if (risultato.stato.saldata && risultato.stato.tipo === 'passiva' && risultato.stato.supplierId) {
    await ricalcolaStimeFornitore(risultato.stato.supplierId, venueId)
  }

  logger.info('Scadenza riconciliata con movimento', {
    scheduleId,
    journalEntryId,
    quota: risultato.quota,
    stato: risultato.stato.stato,
    source,
  })

  return {
    outcome: 'ok',
    reconciliationId: risultato.reconciliationId,
    scheduleStato: risultato.stato.stato,
    importoPagato: risultato.stato.importoPagato,
  }
}

/**
 * Registra il rifiuto di una proposta di match.
 * Non cancella nulla: il record REJECTED è la memoria di ciò che il sistema
 * aveva proposto e l'utente ha scartato, così non lo si ripropone all'infinito.
 */
export async function rejectScheduleMatch({
  scheduleId,
  journalEntryId,
  venueId,
  userId,
  amount = 0,
}: {
  scheduleId: string
  journalEntryId: string
  venueId: string
  userId: string | null
  amount?: number
}): Promise<{ outcome: 'ok'; reconciliationId: string } | { outcome: 'schedule_not_found' }> {
  const schedule = await prisma.schedule.findFirst({
    where: { id: scheduleId, venueId },
    select: { id: true },
  })

  if (!schedule) return { outcome: 'schedule_not_found' }

  const reconciliation = await prisma.scheduleReconciliation.create({
    data: {
      scheduleId,
      journalEntryId,
      status: 'REJECTED',
      source: 'PROPOSAL',
      amount: new Prisma.Decimal(amount.toFixed(2)),
      createdById: userId,
    },
  })

  return { outcome: 'ok', reconciliationId: reconciliation.id }
}

/**
 * Annulla una riconciliazione: rimuove il pagamento generato e riporta la
 * scadenza allo stato che i pagamenti rimasti descrivono. Serve quando il match
 * si rivela sbagliato.
 *
 * Il ritorno indietro riguarda anche la fattura: prima l'undo cancellava
 * riconciliazione e pagamento ma lasciava `ElectronicInvoice` su PAID, e la
 * fattura restava pagata per sempre. Se ne occupa `ricalcolaStatoSchedule`,
 * che allinea la fattura in entrambe le direzioni.
 */
export async function undoScheduleReconciliation({
  reconciliationId,
  venueId,
}: {
  reconciliationId: string
  venueId: string
}): Promise<{ outcome: 'ok'; scheduleStato: string } | { outcome: 'not_found' }> {
  const riferimento = await prisma.scheduleReconciliation.findFirst({
    where: { id: reconciliationId, status: 'VERIFIED', schedule: { venueId } },
    select: { id: true, scheduleId: true, journalEntryId: true },
  })

  if (!riferimento) return { outcome: 'not_found' }

  const esito = await prisma.$transaction(async (tx) => {
    // Stesso ordine di acquisizione dei lock della riconciliazione
    // (movimento, poi scadenza): invertirlo qui basterebbe a produrre deadlock
    // fra un annullo e una riconciliazione concorrenti.
    const movimento = await bloccaMovimento(tx, riferimento.journalEntryId)
    await bloccaScadenza(tx, riferimento.scheduleId)

    const reconciliation = await tx.scheduleReconciliation.findFirst({
      where: { id: reconciliationId, status: 'VERIFIED' },
      select: { id: true, scheduleId: true, journalEntryId: true, paymentId: true },
    })
    if (!reconciliation) return null

    // Le fette come stanno PRIMA della cancellazione: dopo la `deleteMany` la
    // domanda «quanta IVA dichiaravano in tutto» non è più rispondibile, e
    // senza quella risposta non si può decidere se l'IVA di testata sia
    // nostra da ritirare (vedi `ritiraIvaDiTestata`).
    const fettePrima = movimento
      ? await tx.journalEntryAllocation.findMany({
          where: { journalEntryId: reconciliation.journalEntryId },
          select: { iva: true, reconciliationId: true },
        })
      : []

    // Le fette ereditate (Fase 3) vanno ritirate PRIMA di cancellare la
    // riconciliazione: la FK JournalEntryAllocation.reconciliationId è
    // onDelete: SetNull, quindi cancellando prima la riconciliazione il DB
    // azzera solo il riferimento e le fette restano orfane invece di sparire.
    const fetteRitirate = await tx.journalEntryAllocation.deleteMany({
      where: { reconciliationId },
    })

    await tx.scheduleReconciliation.delete({ where: { id: reconciliationId } })

    if (reconciliation.paymentId) {
      await tx.schedulePayment.delete({ where: { id: reconciliation.paymentId } })
    }

    const stato = await ricalcolaStatoSchedule(tx, reconciliation.scheduleId)

    // Nessuna fetta ritirata: niente è cambiato sul movimento, non si tocca
    // (stesso principio del no-op di setEntryAllocations).
    //
    // Il movimento può anche non esserci più: eliminare una chiusura di cassa
    // cancella le scritture che ha generato, riconciliate comprese. L'annullo
    // deve comunque liberare la scadenza — altrimenti resterebbe pagata per
    // sempre a fronte di un movimento inesistente — ma su una riga cancellata
    // non si scrive.
    //
    // Il centro di costo non viene toccato: contesto interattivo, asimmetrico
    // rispetto all'ereditarietà e di proposito. L'undo è un gesto umano
    // deliberato, e il centro precedente non è ripristinabile perché non se ne
    // tiene lo storico. Il movimento conserva quindi il centro che
    // l'ereditarietà gli aveva dato, ma con la sua provenienza: se era
    // 'supposto' resta 'supposto', quindi nessuna automazione lo promuoverà a
    // verificato e la prossima riconciliazione lo rivaluterà da capo.
    if (movimento && fetteRitirate.count > 0) {
      // L'IVA di testata segue le fette anche all'indietro: se era la loro,
      // scende a quella delle rimaste, o torna a `null` se non ne resta
      // nessuna. Prima dell'ereditarietà con l'IVA questo passaggio non
      // serviva, perché `vatAmount` non veniva mai scritto.
      await ritiraIvaDiTestata(tx, {
        journalEntryId: reconciliation.journalEntryId,
        reconciliationId,
        fettePrima,
      })

      const numeroFette = await aggiornaContoDominante(tx, reconciliation.journalEntryId)
      if (numeroFette === 0) {
        // Fette ereditate ritirate e nessuna residua: il movimento torna alla
        // categorizzazione semplice, accountId resta l'ultimo valorizzato.
        await tx.journalEntry.update({
          where: { id: reconciliation.journalEntryId },
          data: { categorizationSource: 'manual' },
        })
      }
    }

    return stato
  })

  if (!esito) return { outcome: 'not_found' }

  // La scadenza è di nuovo aperta: se il fornitore ha una storia, la data
  // attesa torna a essere stimata invece di restare secca sulla contrattuale
  await applicaStimaSuScadenza(esito.scheduleId, venueId)

  // L'undo toglie anche un'osservazione dalla storia del fornitore: le stime
  // delle sue altre scadenze aperte non devono più incorporare il dato revocato
  if (esito.tipo === 'passiva' && esito.supplierId) {
    await ricalcolaStimeFornitore(esito.supplierId, venueId)
  }

  return { outcome: 'ok', scheduleStato: esito.stato }
}

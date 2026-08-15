'use client'

/**
 * Invoice Detail Sections - Sub-components for comprehensive invoice display
 * Displays all XML parsed data: causale, linee, riepilogo IVA, pagamenti, trasmissione SDI
 */

import { Fragment, useState } from 'react'
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Building2,
  FileText,
  CreditCard,
  Send,
  Receipt,
  Calculator,
  Banknote,
  Info,
  Cog,
  AlertTriangle,
  Loader2,
} from 'lucide-react'
import {
  getDocumentTypeAbbrev,
  getDocumentTypeColor,
  getDocumentTypeLabel,
  getPaymentMethodLabel,
  formatDateIT,
} from '@/lib/invoice-utils'
import { formatCurrencyOrZero as formatCurrency } from '@/lib/formatters'
import { NATURA_OPERAZIONE } from '@/lib/sdi/types'
import { AccountCombobox } from '@/components/prima-nota/shared/AccountCombobox'
import { LINEA_BOLLO, LINEA_ARROTONDAMENTO } from '@/lib/sdi/righe-di-sistema'
import { RigaDivisibile } from './RigaDivisibile'
// Tipi e utilità condivisi con RigaDivisibile.tsx: vivono in un terzo modulo
// (non qui) apposta, per non fare importare a RigaDivisibile.tsx questo
// stesso file — che a sua volta lo importa per il componente. Era un ciclo
// (revisione team lead, round 1, minor): funzionava perché ogni uso reale
// era dentro funzioni, mai a livello di modulo, ma restava fragile.
import { TOLLERANZA_IMPORTI, pallino, type ImputazioneQuota, type RigaVisualizzata } from './riga-fattura-condivisa'

// Type definitions for parsed data from API
interface CedentePrestatore {
  denominazione: string
  partitaIva: string
  codiceFiscale?: string
  sede: {
    indirizzo: string
    cap: string
    comune: string
    provincia?: string
    nazione: string
  }
}

interface CessionarioCommittente {
  denominazione: string
  partitaIva?: string
  codiceFiscale?: string
  sede: {
    indirizzo: string
    cap: string
    comune: string
    provincia?: string
    nazione: string
  }
}

interface DettaglioLinea {
  numeroLinea: number
  descrizione: string
  quantita?: number
  unitaMisura?: string
  prezzoUnitario: number
  prezzoTotale: number
  aliquotaIVA: number
  imputazioni: ImputazioneQuota[]
}

/**
 * Bollo virtuale e arrotondamento: righe imputabili come le altre ma fuori
 * da `dettaglioLinee` (vedi `righeDiSistema` in `src/lib/sdi/righe-di-sistema.ts`,
 * unica fonte del calcolo — qui si mostra solo quello che il server
 * restituisce già pronto, non si ricalcola nulla).
 */
interface RigaDiSistema {
  numeroLinea: number
  descrizione: string
  importo: number
  imputazioni: ImputazioneQuota[]
}

interface DatiRiepilogo {
  aliquotaIVA: number
  imponibileImporto: number
  imposta: number
  natura?: string
}

interface DettaglioPagamento {
  modalitaPagamento: string
  dataScadenzaPagamento?: string
  importoPagamento: number
  istitutoFinanziario?: string
  iban?: string
}

interface DatiPagamento {
  condizioniPagamento: string
  dettagliPagamento: DettaglioPagamento[]
}

interface DatiBollo {
  bolloVirtuale?: string
  importoBollo?: number
}

export interface ParsedInvoiceData {
  tipoDocumento?: string
  tipoDocumentoDesc?: string
  causale?: string[]
  cedentePrestatore?: CedentePrestatore
  cessionarioCommittente?: CessionarioCommittente
  dettaglioLinee?: DettaglioLinea[]
  righeSistema?: RigaDiSistema[]
  datiRiepilogo?: DatiRiepilogo[]
  datiPagamento?: DatiPagamento
  datiBollo?: DatiBollo
  progressivoInvio?: string
  formatoTrasmissione?: string
  pecDestinatario?: string
  codiceDestinatario?: string
  importoTotaleDocumento?: number
  arrotondamento?: number
}

// ==========================================
// DOCUMENT INFO SECTION (Header)
// ==========================================
interface DocumentInfoSectionProps {
  invoiceNumber: string
  invoiceDate: string
  documentType?: string
  status: string
}

export function DocumentInfoSection({
  invoiceNumber,
  invoiceDate,
  documentType,
  status,
}: DocumentInfoSectionProps) {
  const isRegistered = status === 'RECORDED' || status === 'PAID'

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="text-2xl font-bold">Fattura {invoiceNumber}</h1>
        {documentType && (
          <Badge className={getDocumentTypeColor(documentType)}>
            {getDocumentTypeAbbrev(documentType)} - {getDocumentTypeLabel(documentType)}
          </Badge>
        )}
        <Badge className={isRegistered ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-muted-foreground'}>
          {isRegistered ? 'Registrata' : 'Non registrata'}
        </Badge>
      </div>
      <p className="text-slate-500">{formatDateIT(invoiceDate)}</p>
    </div>
  )
}

// ==========================================
// SUPPLIER SECTION (Cedente/Prestatore)
// ==========================================
interface SupplierSectionProps {
  supplierName: string
  supplierVat: string
  cedentePrestatore?: CedentePrestatore
  isRegistered?: boolean
}

export function SupplierSection({
  supplierName,
  supplierVat,
  cedentePrestatore,
  isRegistered,
}: SupplierSectionProps) {
  const data = cedentePrestatore || {
    denominazione: supplierName,
    partitaIva: supplierVat,
    sede: { indirizzo: '', cap: '', comune: '', nazione: 'IT' },
  }

  return (
    <Card>
      <CardHeader className="py-4">
        <CardTitle className="flex items-center gap-2 text-base">
          <Building2 className="h-4 w-4" />
          Fornitore (Cedente)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1 pt-0">
        <p className="font-semibold">{data.denominazione}</p>
        <p className="text-sm text-muted-foreground">P.IVA: {data.partitaIva}</p>
        {data.codiceFiscale && (
          <p className="text-sm text-muted-foreground">C.F.: {data.codiceFiscale}</p>
        )}
        {data.sede.indirizzo && (
          <p className="text-sm text-slate-500">
            {data.sede.indirizzo}
            {data.sede.cap && `, ${data.sede.cap}`}
            {data.sede.comune && ` ${data.sede.comune}`}
            {data.sede.provincia && ` (${data.sede.provincia})`}
          </p>
        )}
        {isRegistered && (
          <Badge variant="outline" className="mt-2 text-xs">
            Fornitore registrato in anagrafica
          </Badge>
        )}
      </CardContent>
    </Card>
  )
}

// ==========================================
// CUSTOMER SECTION (Cessionario/Committente)
// ==========================================
interface CustomerSectionProps {
  cessionarioCommittente?: CessionarioCommittente
  codiceDestinatario?: string
}

export function CustomerSection({ cessionarioCommittente, codiceDestinatario }: CustomerSectionProps) {
  if (!cessionarioCommittente) {
    return null
  }

  const data = cessionarioCommittente

  return (
    <Card>
      <CardHeader className="py-4">
        <CardTitle className="flex items-center gap-2 text-base">
          <Building2 className="h-4 w-4" />
          Cliente (Cessionario)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1 pt-0">
        <p className="font-semibold">{data.denominazione}</p>
        {data.partitaIva && (
          <p className="text-sm text-muted-foreground">P.IVA: {data.partitaIva}</p>
        )}
        {data.codiceFiscale && (
          <p className="text-sm text-muted-foreground">C.F.: {data.codiceFiscale}</p>
        )}
        {data.sede.indirizzo && (
          <p className="text-sm text-slate-500">
            {data.sede.indirizzo}
            {data.sede.cap && `, ${data.sede.cap}`}
            {data.sede.comune && ` ${data.sede.comune}`}
            {data.sede.provincia && ` (${data.sede.provincia})`}
          </p>
        )}
        {codiceDestinatario && (
          <p className="text-sm text-slate-500">
            Codice SDI: <span className="font-mono">{codiceDestinatario}</span>
          </p>
        )}
      </CardContent>
    </Card>
  )
}

// ==========================================
// CAUSALE SECTION
// ==========================================
interface CausaleSectionProps {
  causale?: string[]
}

export function CausaleSection({ causale }: CausaleSectionProps) {
  if (!causale || causale.length === 0) {
    return null
  }

  return (
    <Card>
      <CardHeader className="py-4">
        <CardTitle className="flex items-center gap-2 text-base">
          <FileText className="h-4 w-4" />
          Causale
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="bg-slate-50 rounded-md p-3">
          {causale.map((c, idx) => (
            <p key={idx} className="text-sm text-foreground whitespace-pre-wrap">
              {c}
            </p>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

// ==========================================
// LINE ITEMS TABLE
// ==========================================
interface LineItemsTableProps {
  dettaglioLinee?: DettaglioLinea[]
  /** Bollo e arrotondamento: righe imputabili come le altre, già pronte con le loro imputazioni (righeDiSistema lato server). */
  righeSistema?: RigaDiSistema[]
  /** Mostra la colonna "Conto": solo per fatture passive/ricevute, decide il genitore. */
  showAccountColumn?: boolean
  /** false quando la fattura non è più modificabile (registrata/pagata) o durante una PATCH in corso. */
  canEditAccounts?: boolean
  /** Suggerimento non salvato (conto di default del fornitore) per le righe senza imputazione. */
  defaultAccountLabel?: string
  /** Suggerimento per la riga del bollo quando non ha ancora un'imputazione: es. "30.01 - Imposta di bollo" (CONTO_PROPOSTO_BOLLO). */
  defaultBolloAccountLabel?: string
  /** Totale del documento, righe di sistema comprese: denominatore del contatore di copertura. */
  totaleDocumento?: string | number
  onAccountChange?: (numeroLinea: number, accountId: string) => void
  onConfirmAllAccounts?: () => void
  /**
   * Salva l'intera divisione di una riga (Task 9): TUTTE le quote della riga
   * in una volta, mai una per volta. Il server tratta la richiesta come
   * autorevole sulla riga che nomina (righe-conti/route.ts) — cancella ogni
   * quota di quel numeroLinea non citata — quindi una chiamata con una sola
   * quota su una riga divisa ne cancellerebbe silenziosamente l'altra.
   * `RigaDivisibile` costruisce sempre l'insieme completo prima di chiamarla.
   */
  onSplitSave?: (
    numeroLinea: number,
    quote: Array<{ progressivo: number; accountId: string; importo: number }>
  ) => void
}

/** Quanto di una riga è coperto da imputazioni CONFERMATE — non le proposte
 * AI, ancora da rivedere. Specchia la guardia sul back end
 * (schedule-reconciliation-service.ts, "numeroLineeImputate"), che conta solo
 * le conferme umane per decidere se l'ereditarietà pro-quota può scattare:
 * il contatore qui deve dire «completa» esattamente quando quella guardia
 * passerebbe, non prima.
 *
 * Attenzione: questo è un importo NETTO. `q.importo` è quello scritto da
 * `righe-conti/route.ts`, che per una riga intera è `dettaglio.prezzoTotale`
 * — il `PrezzoTotale` di FatturaPA, cioè l'imponibile. Chi confronta questo
 * numero con `invoice.totalAmount` (lordo) deve prima passare da `alLordo()`.
 */
function importoConfermato(imputazioni: ImputazioneQuota[]): number {
  return imputazioni
    .filter((q) => q.stato === 'confermata')
    .reduce((somma, q) => somma + q.importo, 0)
}

/**
 * Porta un importo netto di una riga al lordo, con l'aliquota della riga
 * stessa — stesso schema di `aggregaPerConto` in
 * `src/lib/services/allocation-service.ts` (netto + netto × aliquota/100),
 * già rivisto e in produzione per lo stesso calcolo lato server.
 *
 * Copiata e non importata per la stessa ragione di `TOLLERANZA_IMPORTI`
 * (vedi `riga-fattura-condivisa.ts`): quel modulo porta `@prisma/client`, e
 * un import così dentro un componente `'use client'` rompe il bundle in un
 * modo che nessuna revisione del diff vede — bisogna lanciare `npm run build`
 * per accorgersene.
 *
 * Serve al confronto RIGA PER RIGA (`righeMancanti`), dove il fattore
 * (1 + aliquota/100) sta da entrambe le parti della differenza e non c'è
 * nessun arrotondamento dell'emittente da rispettare. Il totale attribuito
 * NON si calcola sommando questi lordi: vedi `attribuitoAlLordo`.
 *
 * Le righe di sistema hanno aliquota 0 per costruzione (né il bollo né
 * l'arrotondamento portano IVA, vedi `righeDiSistema`), quindi per loro il
 * lordo coincide col netto senza bisogno di un ramo a parte.
 */
function alLordo(importoNetto: number, riga: RigaVisualizzata): number {
  return importoNetto * (1 + (riga.aliquotaIVA ?? 0) / 100)
}

/**
 * Il totale attribuito al lordo, con l'imposta arrotondata UNA VOLTA per
 * aliquota: l'algoritmo dell'emittente, non la somma dei lordi di riga.
 *
 * Il denominatore del contatore è `ImportoTotaleDocumento`, un numero scritto
 * dal fornitore. FatturaPA gli fa dichiarare un `DatiRiepilogo` per ogni
 * aliquota, con l'imposta già arrotondata al centesimo una volta per gruppo,
 * e il totale del documento è la somma di quelle imposte. Sommare invece i
 * lordi di riga non arrotondati diverge fino a mezzo centesimo per aliquota:
 * con due aliquote supera già la tolleranza di 0,005 e il piede dichiarava
 * «manca 0,01 € non riconducibile a una riga» su una fattura interamente
 * attribuita — 100,05 al 10% (imposta 10,005, l'emittente scrive 10,01) più
 * 50,25 al 22% (11,055 → 11,06) fanno 171,37 sul documento e davano 171,36
 * qui. È esattamente la fattura mista per cui questo lavoro esiste.
 *
 * Allargare la tolleranza avrebbe nascosto anche gli scarti veri; replicare
 * l'arrotondamento dell'emittente no.
 *
 * Le righe di sistema non portano aliquota e finiscono nel gruppo a zero:
 * imposta zero, lordo uguale al netto, senza bisogno di un ramo a parte.
 */
function attribuitoAlLordo(righe: RigaVisualizzata[]): number {
  const imponibilePerAliquota = new Map<number, number>()
  for (const riga of righe) {
    const aliquota = riga.aliquotaIVA ?? 0
    imponibilePerAliquota.set(
      aliquota,
      (imponibilePerAliquota.get(aliquota) ?? 0) + importoConfermato(riga.imputazioni)
    )
  }

  let totale = 0
  for (const [aliquota, imponibile] of imponibilePerAliquota) {
    // `imponibile × aliquota` è l'imposta in centesimi, perché l'aliquota è
    // in punti percentuali: l'arrotondamento va fatto lì, una volta per
    // gruppo, com'è scritto nel DatiRiepilogo da cui nasce il totale.
    totale += imponibile + Math.round(imponibile * aliquota) / 100
  }
  return totale
}

/** Riferimento leggibile a una riga mancante nel messaggio del contatore: le
 * righe di sistema usano il loro numero riservato (LINEA_BOLLO/LINEA_ARROTONDAMENTO),
 * che non ha senso mostrare all'utente com'è ("riga -1"). */
function riferimentoRiga(riga: RigaVisualizzata): string {
  if (riga.numeroLinea === LINEA_BOLLO) return 'il bollo'
  if (riga.numeroLinea === LINEA_ARROTONDAMENTO) return "l'arrotondamento"
  return `la riga ${riga.numeroLinea}`
}

/**
 * «manca la riga 2» al singolare, «mancano la riga 2 e il bollo» al plurale.
 *
 * `righeMancanti` può essere vuoto anche a documento non completo: succede
 * quando ogni riga presente è coperta per intero ma la somma non arriva
 * comunque al totale del documento — un onere di testata che non sta in
 * nessuna riga (sconto, cassa previdenziale, ritenuta: nessuno di questi
 * diventa oggi una riga di sistema, vedi `righeDiSistema`). In quel caso non
 * c'è una riga da nominare: si dichiara l'importo residuo invece di stampare
 * un messaggio vuoto o un `undefined`.
 *
 * Il residuo si legge col segno, non in valore assoluto: la ritenuta
 * d'acconto si detrae da `ImportoTotaleDocumento`, quindi le righe attribuite
 * valgono più del documento e il residuo è negativo. Con `Math.abs` l'utente
 * leggeva «manca 200,00 €» mentre di euro ce n'erano 200 di troppo — il
 * contrario di quel che era successo. Stesse parole che il server usa già per
 * lo stesso scarto (`righe-conti/route.ts`).
 */
function messaggioRigheMancanti(righeMancanti: RigaVisualizzata[], residuo: number): string {
  if (righeMancanti.length === 0) {
    return residuo >= 0
      ? `manca ${formatCurrency(residuo)} non riconducibile a una riga`
      : `ci sono ${formatCurrency(-residuo)} di troppo, non riconducibili a una riga`
  }
  const riferimenti = righeMancanti.map(riferimentoRiga)
  if (riferimenti.length === 1) return `manca ${riferimenti[0]}`
  const ultimo = riferimenti[riferimenti.length - 1]
  const resto = riferimenti.slice(0, -1)
  return `mancano ${resto.join(', ')} e ${ultimo}`
}

/** Un movimento le cui fette ereditate raccontano ancora un'imputazione superata. */
export interface DivergenzaFattura {
  journalEntryId: string
  /** Data del movimento (ISO), non della modifica: è quella che identifica il movimento all'utente. */
  movimentoData: string
}

interface AvvisoRiallineamentoProps {
  divergenze: DivergenzaFattura[]
  onRiallinea: (journalEntryId: string) => void
  /** `journalEntryId` del riallineamento in corso, se ce n'è uno: disabilita solo il suo bottone. */
  journalEntryIdInCorso?: string | null
}

/**
 * L'avviso di divergenza fra le fette e la fattura (Task 7 rileva, Task 10
 * collega — spec sez. 2 «Le fette sono una fotografia, e la fotografia
 * parla»). Vive sul dettaglio fattura, non sul movimento: `imputazioniDivergenti`
 * lavora per movimento e la fattura è già quella sotto gli occhi, quindi
 * il testo non la rinomina — dice solo QUALE movimento è rimasto indietro.
 */
export function AvvisoRiallineamento({
  divergenze,
  onRiallinea,
  journalEntryIdInCorso,
}: AvvisoRiallineamentoProps) {
  if (divergenze.length === 0) return null

  return (
    <div className="space-y-2">
      {divergenze.map((d) => (
        <div
          key={d.journalEntryId}
          className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm dark:border-amber-800 dark:bg-amber-950/20"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <div className="flex-1">
            <p className="font-medium text-amber-800 dark:text-amber-200">
              Questa fattura è stata reimputata dopo il pagamento
            </p>
            <p className="mt-1 text-amber-700 dark:text-amber-300">
              Il movimento del {formatDateIT(d.movimentoData)} usa ancora l&apos;imputazione precedente.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="shrink-0 border-amber-300 text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-200 dark:hover:bg-amber-900/40"
            onClick={() => onRiallinea(d.journalEntryId)}
            disabled={journalEntryIdInCorso === d.journalEntryId}
          >
            {journalEntryIdInCorso === d.journalEntryId ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              'Riallinea'
            )}
          </Button>
        </div>
      ))}
    </div>
  )
}

export function LineItemsTable({
  dettaglioLinee = [],
  righeSistema = [],
  showAccountColumn = false,
  canEditAccounts = true,
  defaultAccountLabel,
  defaultBolloAccountLabel,
  totaleDocumento,
  onAccountChange,
  onConfirmAllAccounts,
  onSplitSave,
}: LineItemsTableProps) {
  // Righe con una divisione APERTA ma non ancora salvata sul server (l'utente
  // ha premuto ÷ su una riga a quota singola). Una riga con già 2+ quote sul
  // server è "divisa" a prescindere da questo set — non serve tenerla qui —
  // e ci resta ANCHE dopo un salvataggio riuscito o rifiutato: rimuoverla al
  // click su "Salva" farebbe sparire l'editor (e i valori digitati) proprio
  // nel caso in cui il server rifiuta e l'utente deve correggere e riprovare
  // (passo 3). Solo "Annulla" la rimuove, esplicitamente.
  const [righeAperte, setRigheAperte] = useState<Set<number>>(new Set())

  // Helper to format IVA display
  const formatIVA = (aliquota: number) => {
    if (aliquota === 0) return '0%'
    return `${aliquota}%`
  }

  // Un'unica lista, righe vere e di sistema mescolate nell'ordine in cui si
  // mostrano: stessa tabella, stesso rendering, nessuna riga "di serie B".
  const righe: RigaVisualizzata[] = [
    ...dettaglioLinee.map((linea) => ({
      numeroLinea: linea.numeroLinea,
      descrizione: linea.descrizione,
      isSistema: false,
      quantita: linea.quantita,
      unitaMisura: linea.unitaMisura,
      prezzoUnitario: linea.prezzoUnitario,
      aliquotaIVA: linea.aliquotaIVA,
      importo: linea.prezzoTotale,
      imputazioni: linea.imputazioni,
    })),
    ...righeSistema.map((riga) => ({
      numeroLinea: riga.numeroLinea,
      descrizione: riga.descrizione,
      isSistema: true,
      importo: riga.importo,
      imputazioni: riga.imputazioni,
    })),
  ]

  // Nessuna riga vera né di sistema: non c'è nulla da mostrare. Sostituisce
  // il vecchio controllo su `dettaglioLinee.length === 0`, che nascondeva
  // anche una fattura senza righe XML ma col bollo — un caso vero (bollo
  // isolato, XML minimale) che perdeva l'intera card.
  if (righe.length === 0) {
    return null
  }

  const hasProposte =
    showAccountColumn && righe.some((r) => r.imputazioni.some((q) => q.stato === 'proposta'))

  // Contatore di copertura (decisione 5, "attribuzione totale obbligatoria"):
  // quanto del documento è già coperto da imputazioni confermate, righe di
  // sistema comprese. Il denominatore è il totale del DOCUMENTO — non la
  // somma delle righe qui sotto — perché deve restare vero anche prima che
  // l'ultima riga sia stata imputata. `Number.isFinite` invece di un
  // confronto con `undefined`: una stringa non parsabile darebbe `NaN`, che
  // supererebbe quel confronto e mostrerebbe il piede con "/ € 0,00".
  const totaleGrezzo =
    totaleDocumento === undefined
      ? undefined
      : typeof totaleDocumento === 'string'
        ? parseFloat(totaleDocumento)
        : totaleDocumento
  const totale = totaleGrezzo !== undefined && Number.isFinite(totaleGrezzo) ? totaleGrezzo : undefined

  // Numeratore e confronto per riga sono al LORDO: `importo` e
  // `importoConfermato` sono netti, `totale` (invoice.totalAmount) è lordo —
  // sommarli direttamente sottostimava sempre il numeratore e "✓ completa"
  // non si raggiungeva mai su una fattura vera. Il numeratore raggruppa per
  // aliquota e arrotonda l'imposta una volta per gruppo (`attribuitoAlLordo`),
  // il confronto riga per riga no (`alLordo`): sono due usi diversi, il
  // perché sta nei due docblock.
  const attribuito = attribuitoAlLordo(righe)
  const righeMancanti = righe.filter(
    (r) =>
      Math.abs(alLordo(r.importo, r) - alLordo(importoConfermato(r.imputazioni), r)) >
      TOLLERANZA_IMPORTI
  )
  const completa =
    totale !== undefined && Math.abs(attribuito - totale) <= TOLLERANZA_IMPORTI

  return (
    <Card>
      <CardHeader className="py-4">
        <CardTitle className="flex items-center gap-2 text-base">
          <Receipt className="h-4 w-4" />
          Dettaglio Linee
        </CardTitle>
        {hasProposte && (
          <CardAction>
            <Button
              size="sm"
              variant="outline"
              disabled={!canEditAccounts}
              onClick={onConfirmAllAccounts}
            >
              Accetta tutte
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="pt-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50">
                <TableHead className="w-12">#</TableHead>
                <TableHead>Descrizione</TableHead>
                <TableHead className="w-20 text-right">Q.tà</TableHead>
                <TableHead className="w-24 text-right">Prezzo</TableHead>
                <TableHead className="w-16 text-right">IVA</TableHead>
                <TableHead className="w-28 text-right">Totale</TableHead>
                {showAccountColumn && <TableHead className="min-w-[240px]">Conto</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {righe.map((riga) => {
                // Divisa sul server: 2+ quote già salvate (Task 9, decisione
                // 3 dello spec). Aperta localmente: l'utente ha premuto ÷ su
                // una riga ancora a quota singola e non ha ancora salvato.
                // In entrambi i casi si mostrano le righe figlie al posto
                // della tendina — l'unica differenza è se resta un modo per
                // tornare indietro (vedi RigaDivisibile, prop onAnnulla).
                const divisa = !riga.isSistema && riga.imputazioni.length >= 2
                const inModifica = righeAperte.has(riga.numeroLinea)
                const mostraFigli = divisa || inModifica

                // Una riga a importo zero o negativo (sconto, reso: FatturaPA
                // li ammette come righe vere) non è divisibile per
                // costruzione: le quote di RigaDivisibile devono essere
                // positive E sommare all'importo della riga, e non esistono
                // due positivi la cui somma sia zero o negativa. Il pulsante
                // resta visibile ma spento, con un titolo che lo spiega — non
                // sparisce, sullo stesso principio del bottone "Registra" di
                // InvoiceDetail quando manca il centro di costo: l'utente
                // deve capire perché è spento, non chiedersi dove sia finito
                // (revisione team lead, round 1, minor).
                const divisibile = riga.importo > 0

                // imputazioni[0]: la quota col progressivo più basso (il
                // server le ordina già così), cioè "la" imputazione
                // principale finché la riga non è divisa fra più conti.
                // Rilevante solo quando NON si mostrano le righe figlie: una
                // riga divisa non ha più un'imputazione "principale" unica,
                // ogni quota mostra il proprio pallino (vedi `pallino` sopra).
                const principale = riga.imputazioni[0]
                const stato = pallino(principale)

                // Il bollo nasce proposto su CONTO_PROPOSTO_BOLLO (30.01):
                // solo un suggerimento in tendina finché nessuno lo sceglie
                // davvero, esattamente come il conto di default del
                // fornitore per le righe vere — non una proposta persistita,
                // altrimenti "Accetta tutte" dovrebbe saperla confermare
                // anche quando in database non esiste ancora nulla da
                // confermare.
                const suggerimento =
                  principale
                    ? undefined
                    : riga.numeroLinea === LINEA_BOLLO
                      ? defaultBolloAccountLabel
                      : !riga.isSistema
                        ? defaultAccountLabel
                        : undefined

                return (
                  <Fragment key={riga.numeroLinea}>
                    <TableRow>
                      <TableCell className="font-mono text-slate-500">
                        {riga.isSistema ? (
                          <Cog className="h-3.5 w-3.5" aria-label="Riga di sistema" />
                        ) : (
                          riga.numeroLinea
                        )}
                      </TableCell>
                      <TableCell className="max-w-xs truncate" title={riga.descrizione}>
                        {riga.descrizione}
                      </TableCell>
                      <TableCell className="text-right">
                        {riga.quantita !== undefined ? (
                          <>
                            {riga.quantita.toLocaleString('it-IT', { useGrouping: true })}
                            {riga.unitaMisura && (
                              <span className="text-xs text-slate-500 ml-1">
                                {riga.unitaMisura}
                              </span>
                            )}
                          </>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {riga.prezzoUnitario !== undefined ? formatCurrency(riga.prezzoUnitario) : '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        {riga.aliquotaIVA !== undefined ? formatIVA(riga.aliquotaIVA) : '—'}
                      </TableCell>
                      <TableCell className="text-right font-mono font-medium">
                        {formatCurrency(riga.importo)}
                      </TableCell>
                      {showAccountColumn && (
                        <TableCell>
                          {mostraFigli ? (
                            // Riga divisa (salvata o in bozza): niente tendina
                            // qui, ogni quota mostra il proprio conto e il
                            // proprio pallino nelle righe figlie sotto (vedi
                            // RigaDivisibile) — mai un conto solo per l'intera
                            // riga, che non esiste più una volta divisa.
                            <span className="text-sm text-muted-foreground">—</span>
                          ) : (
                            <>
                              {/*
                                Decisione: le righe di sistema NON si dividono fra
                                più conti (Task 8, in risposta al brief). Il bollo
                                e l'arrotondamento sono importi unici e piccoli, non
                                l'accorpamento di voci eterogenee che giustifica la
                                divisione di una riga vera (decisione 3 dello
                                spec) — dividere 2 € di bollo fra due conti non
                                serve a nessuno scenario reale, e l'arrotondamento
                                può essere negativo, dove il vincolo `.positive()`
                                sulle quote (righe-conti/route.ts) non potrebbe
                                comunque reggere una divisione.
                                Qui (Task 9) il pulsante `÷` non compare quando
                                `riga.isSistema` è vero, per lo stesso motivo. Il
                                server rifiuta già esplicitamente
                                (righe-conti/route.ts), non con l'errore generico
                                di Zod.
                              */}
                              <div className="flex items-center gap-2">
                                <AccountCombobox
                                  value={principale?.accountId}
                                  onChange={(accountId) => {
                                    if (accountId) onAccountChange?.(riga.numeroLinea, accountId)
                                  }}
                                  disabled={!canEditAccounts}
                                  // Un conto PATRIMONIALE è ammesso quanto uno di
                                  // COSTO: un frigorifero in fattura è un cespite,
                                  // non un costo, e prima non era imputabile
                                  // (Task 8, punto d). RICAVO resta escluso: lo
                                  // scarta già il server (righe-conti/route.ts),
                                  // qui evita solo di proporlo inutilmente.
                                  types={['COSTO', 'PATRIMONIALE']}
                                  placeholder={suggerimento ? `Suggerito: ${suggerimento}` : 'Seleziona conto'}
                                />
                                {stato && (
                                  <span
                                    className={`h-2.5 w-2.5 rounded-full shrink-0 ${stato.className}`}
                                    title={stato.title}
                                  />
                                )}
                                {!riga.isSistema && (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 shrink-0 font-mono"
                                    disabled={!canEditAccounts || !divisibile}
                                    onClick={() =>
                                      setRigheAperte((prev) => new Set(prev).add(riga.numeroLinea))
                                    }
                                    title={
                                      divisibile
                                        ? 'Dividi la riga fra più conti'
                                        : 'Una riga con importo zero o negativo non può essere divisa: le quote devono essere positive'
                                    }
                                    aria-label="Dividi la riga fra più conti"
                                  >
                                    ÷
                                  </Button>
                                )}
                              </div>
                            </>
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                    {showAccountColumn && mostraFigli && (
                      <RigaDivisibile
                        riga={riga}
                        canEditAccounts={canEditAccounts}
                        // Niente "Annulla" per una riga già divisa sul
                        // server: non c'è una riga a quota singola a cui
                        // tornare (decisione Task 9, vedi il report). Per una
                        // bozza ancora non salvata, Annulla la toglie da
                        // `righeAperte` e la riga torna alla tendina normale.
                        onAnnulla={
                          divisa
                            ? undefined
                            : () =>
                                setRigheAperte((prev) => {
                                  const next = new Set(prev)
                                  next.delete(riga.numeroLinea)
                                  return next
                                })
                        }
                        onSalva={(quote) => onSplitSave?.(riga.numeroLinea, quote)}
                      />
                    )}
                  </Fragment>
                )
              })}
            </TableBody>
            {showAccountColumn && totale !== undefined && (
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={7} className="text-sm">
                    <span className="font-medium">
                      Attribuito {formatCurrency(attribuito)} / {formatCurrency(totale)}
                    </span>
                    {completa ? (
                      <span className="ml-2 text-green-600">✓ completa</span>
                    ) : (
                      <span className="ml-2 text-amber-600">
                        — {messaggioRigheMancanti(righeMancanti, totale - attribuito)}
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              </TableFooter>
            )}
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}

// ==========================================
// VAT SUMMARY TABLE
// ==========================================
interface VATSummaryTableProps {
  datiRiepilogo?: DatiRiepilogo[]
}

export function VATSummaryTable({ datiRiepilogo }: VATSummaryTableProps) {
  if (!datiRiepilogo || datiRiepilogo.length === 0) {
    return null
  }

  const getNaturaDescription = (natura?: string) => {
    if (!natura) return null
    return NATURA_OPERAZIONE[natura] || natura
  }

  return (
    <Card>
      <CardHeader className="py-4">
        <CardTitle className="flex items-center gap-2 text-base">
          <Calculator className="h-4 w-4" />
          Riepilogo IVA
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead>Natura / Aliquota</TableHead>
              <TableHead className="text-right">Imponibile</TableHead>
              <TableHead className="text-right">Imposta</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {datiRiepilogo.map((riepilogo, idx) => (
              <TableRow key={idx}>
                <TableCell>
                  {riepilogo.natura ? (
                    <div>
                      <span className="font-mono text-sm">{riepilogo.natura}</span>
                      <span className="text-slate-500 text-sm ml-2">
                        {getNaturaDescription(riepilogo.natura)}
                      </span>
                    </div>
                  ) : (
                    <span>{riepilogo.aliquotaIVA}%</span>
                  )}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {formatCurrency(riepilogo.imponibileImporto)}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {formatCurrency(riepilogo.imposta)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

// ==========================================
// DOCUMENT TOTALS SECTION
// ==========================================
interface DocumentTotalsSectionProps {
  netAmount: string
  vatAmount: string
  totalAmount: string
  datiBollo?: DatiBollo
  arrotondamento?: number
}

export function DocumentTotalsSection({
  netAmount,
  vatAmount,
  totalAmount,
  datiBollo,
  arrotondamento,
}: DocumentTotalsSectionProps) {
  const hasBollo = datiBollo?.bolloVirtuale === 'SI' || (datiBollo?.importoBollo && datiBollo.importoBollo > 0)

  return (
    <Card>
      <CardHeader className="py-4">
        <CardTitle className="flex items-center gap-2 text-base">
          <Banknote className="h-4 w-4" />
          Riepilogo Documento
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Totale imponibile</span>
          <span className="font-mono">{formatCurrency(netAmount)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Totale IVA</span>
          <span className="font-mono">{formatCurrency(vatAmount)}</span>
        </div>
        {hasBollo && (
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Bollo virtuale</span>
            <span className="font-mono">{formatCurrency(datiBollo?.importoBollo || 2)}</span>
          </div>
        )}
        {arrotondamento !== undefined && arrotondamento !== 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Arrotondamento</span>
            <span className="font-mono">{formatCurrency(arrotondamento)}</span>
          </div>
        )}
        <div className="border-t pt-2 mt-2">
          <div className="flex justify-between text-lg font-semibold">
            <span>TOTALE DOCUMENTO</span>
            <span className="font-mono">{formatCurrency(totalAmount)}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ==========================================
// BOLLO SECTION
// ==========================================
interface BolloSectionProps {
  datiBollo?: DatiBollo
}

export function BolloSection({ datiBollo }: BolloSectionProps) {
  if (!datiBollo) return null

  const hasBollo = datiBollo.bolloVirtuale === 'SI' || (datiBollo.importoBollo && datiBollo.importoBollo > 0)
  if (!hasBollo) return null

  return (
    <Card>
      <CardHeader className="py-4">
        <CardTitle className="flex items-center gap-2 text-base">
          <Info className="h-4 w-4" />
          Bollo
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 space-y-1">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Bollo Virtuale</span>
          <Badge variant="outline">Sì</Badge>
        </div>
        {datiBollo.importoBollo && (
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Importo</span>
            <span className="font-mono">{formatCurrency(datiBollo.importoBollo)}</span>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ==========================================
// PAYMENT SECTION
// ==========================================
interface PaymentSectionProps {
  datiPagamento?: DatiPagamento
  deadlines?: Array<{
    id: string
    dueDate: string
    amount: string
    isPaid: boolean
    paymentMethod?: string
    iban?: string
  }>
  /**
   * Scadenze generate nello scadenzario da questa fattura: sono la fonte di
   * verità sui pagamenti, mentre InvoiceDeadline.isPaid resta al valore
   * iniziale perché nessun flusso lo aggiorna.
   */
  schedules?: Array<{
    id: string
    invoiceDeadlineId: string | null
    stato: string
    importoTotale: string | number
    importoPagato: string | number
  }>
}

export function PaymentSection({ datiPagamento, deadlines, schedules }: PaymentSectionProps) {
  // Use parsed data if available, otherwise fall back to deadlines from DB
  const payments = datiPagamento?.dettagliPagamento || []

  const scheduleByDeadline = new Map(
    (schedules ?? [])
      .filter((s) => s.invoiceDeadlineId)
      .map((s) => [s.invoiceDeadlineId as string, s])
  )

  /** Stato di pagamento della rata, letto dalla scadenza quando esiste. */
  function statoRata(deadlineId: string | undefined, fallback: boolean) {
    const schedule = deadlineId ? scheduleByDeadline.get(deadlineId) : undefined
    if (!schedule) return { isPaid: fallback, parziale: false, pagato: 0 }

    const pagato = Number(schedule.importoPagato)
    return {
      isPaid: schedule.stato === 'pagata',
      parziale: schedule.stato === 'parzialmente_pagata' || (pagato > 0 && schedule.stato !== 'pagata'),
      pagato,
    }
  }

  // Merge parsed data with deadlines for IBAN and payment status
  const paymentItems = payments.length > 0
    ? payments.map((p, idx) => ({
        ...p,
        ...statoRata(deadlines?.[idx]?.id, deadlines?.[idx]?.isPaid || false),
      }))
    : deadlines?.map(d => ({
        modalitaPagamento: d.paymentMethod || 'NON_SPECIFICATO',
        dataScadenzaPagamento: d.dueDate,
        importoPagamento: parseFloat(d.amount),
        iban: d.iban,
        ...statoRata(d.id, d.isPaid),
      })) || []

  if (paymentItems.length === 0) {
    return null
  }

  return (
    <Card>
      <CardHeader className="py-4">
        <CardTitle className="flex items-center gap-2 text-base">
          <CreditCard className="h-4 w-4" />
          Dati Relativi ai Pagamenti
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50">
                <TableHead>Modalità</TableHead>
                <TableHead>Scadenza</TableHead>
                <TableHead>IBAN / Dettagli</TableHead>
                <TableHead className="text-right">Importo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paymentItems.map((payment, idx) => (
                <TableRow key={idx}>
                  <TableCell>
                    <div>
                      <span className="font-mono text-xs text-slate-500">
                        {payment.modalitaPagamento}
                      </span>
                      <p className="text-sm">
                        {getPaymentMethodLabel(payment.modalitaPagamento)}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell>
                    {payment.dataScadenzaPagamento
                      ? formatDateIT(payment.dataScadenzaPagamento)
                      : '-'}
                  </TableCell>
                  <TableCell>
                    {payment.iban ? (
                      <span className="font-mono text-xs break-all">{payment.iban}</span>
                    ) : 'istitutoFinanziario' in payment && payment.istitutoFinanziario ? (
                      <span className="text-sm text-muted-foreground">{payment.istitutoFinanziario}</span>
                    ) : (
                      <span className="text-slate-400">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div>
                      <span className="font-mono font-medium">
                        {formatCurrency(payment.importoPagamento)}
                      </span>
                      <div className="mt-1">
                        {payment.isPaid ? (
                          <Badge className="bg-green-100 text-green-700 text-xs">
                            Pagato
                          </Badge>
                        ) : payment.parziale ? (
                          <Badge className="bg-amber-100 text-amber-700 text-xs">
                            Pagato {formatCurrency(payment.pagato)}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs">
                            Da pagare
                          </Badge>
                        )}
                      </div>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}

// ==========================================
// TRANSMISSION DATA SECTION (SDI)
// ==========================================
interface TransmissionDataSectionProps {
  progressivoInvio?: string
  formatoTrasmissione?: string
  pecDestinatario?: string
  codiceDestinatario?: string
}

export function TransmissionDataSection({
  progressivoInvio,
  formatoTrasmissione,
  pecDestinatario,
  codiceDestinatario,
}: TransmissionDataSectionProps) {
  // If no data at all, don't render
  if (!progressivoInvio && !formatoTrasmissione && !pecDestinatario && !codiceDestinatario) {
    return null
  }

  return (
    <Card>
      <CardHeader className="py-4">
        <CardTitle className="flex items-center gap-2 text-base">
          <Send className="h-4 w-4" />
          Dati Trasmissione SDI
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="grid gap-3 md:grid-cols-2 text-sm">
          {progressivoInvio && (
            <div>
              <p className="text-slate-500">Progressivo invio</p>
              <p className="font-mono">{progressivoInvio}</p>
            </div>
          )}
          {formatoTrasmissione && (
            <div>
              <p className="text-slate-500">Formato trasmissione</p>
              <p className="font-mono">{formatoTrasmissione}</p>
            </div>
          )}
          {codiceDestinatario && (
            <div>
              <p className="text-slate-500">Codice destinatario</p>
              <p className="font-mono">{codiceDestinatario}</p>
            </div>
          )}
          {pecDestinatario && (
            <div>
              <p className="text-slate-500">PEC destinatario</p>
              <p className="font-mono text-xs break-all">{pecDestinatario}</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// ==========================================
// METADATA SECTION
// ==========================================
interface MetadataSectionProps {
  venueName?: string
  importedAt: string
  fileName?: string
}

export function MetadataSection({
  venueName,
  importedAt,
  fileName,
}: MetadataSectionProps) {
  return (
    <Card>
      <CardHeader className="py-4">
        <CardTitle className="flex items-center gap-2 text-base">
          <Info className="h-4 w-4" />
          Informazioni
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="grid gap-4 md:grid-cols-3 text-sm">
          {venueName && (
            <div>
              <p className="text-slate-500">Sede</p>
              <p className="font-medium">{venueName}</p>
            </div>
          )}
          <div>
            <p className="text-slate-500">Importata il</p>
            <p className="font-medium">{formatDateIT(importedAt)}</p>
          </div>
          {fileName && (
            <div>
              <p className="text-slate-500">File originale</p>
              <p className="font-medium font-mono text-xs">{fileName}</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

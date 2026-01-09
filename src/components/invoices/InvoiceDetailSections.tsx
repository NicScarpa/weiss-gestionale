'use client'

/**
 * Invoice Detail Sections - Sub-components for comprehensive invoice display
 * Displays all XML parsed data: causale, linee, riepilogo IVA, pagamenti, trasmissione SDI
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
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
} from 'lucide-react'
import {
  getDocumentTypeAbbrev,
  getDocumentTypeColor,
  getDocumentTypeLabel,
  getPaymentMethodLabel,
  formatCurrency,
  formatDateIT,
} from '@/lib/invoice-utils'
import { NATURA_OPERAZIONE } from '@/lib/sdi/types'

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
        <Badge className={isRegistered ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'}>
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
        <p className="text-sm text-slate-600">P.IVA: {data.partitaIva}</p>
        {data.codiceFiscale && (
          <p className="text-sm text-slate-600">C.F.: {data.codiceFiscale}</p>
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
          <p className="text-sm text-slate-600">P.IVA: {data.partitaIva}</p>
        )}
        {data.codiceFiscale && (
          <p className="text-sm text-slate-600">C.F.: {data.codiceFiscale}</p>
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
            <p key={idx} className="text-sm text-slate-700 whitespace-pre-wrap">
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
}

export function LineItemsTable({ dettaglioLinee }: LineItemsTableProps) {
  if (!dettaglioLinee || dettaglioLinee.length === 0) {
    return null
  }

  // Helper to format IVA display
  const formatIVA = (aliquota: number) => {
    if (aliquota === 0) return '0%'
    return `${aliquota}%`
  }

  return (
    <Card>
      <CardHeader className="py-4">
        <CardTitle className="flex items-center gap-2 text-base">
          <Receipt className="h-4 w-4" />
          Dettaglio Linee
        </CardTitle>
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
              </TableRow>
            </TableHeader>
            <TableBody>
              {dettaglioLinee.map((linea) => (
                <TableRow key={linea.numeroLinea}>
                  <TableCell className="font-mono text-slate-500">
                    {linea.numeroLinea}
                  </TableCell>
                  <TableCell className="max-w-xs truncate" title={linea.descrizione}>
                    {linea.descrizione}
                  </TableCell>
                  <TableCell className="text-right">
                    {linea.quantita !== undefined ? (
                      <>
                        {linea.quantita.toLocaleString('it-IT')}
                        {linea.unitaMisura && (
                          <span className="text-xs text-slate-500 ml-1">
                            {linea.unitaMisura}
                          </span>
                        )}
                      </>
                    ) : (
                      '-'
                    )}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatCurrency(linea.prezzoUnitario)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatIVA(linea.aliquotaIVA)}
                  </TableCell>
                  <TableCell className="text-right font-mono font-medium">
                    {formatCurrency(linea.prezzoTotale)}
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
          <span className="text-slate-600">Totale imponibile</span>
          <span className="font-mono">{formatCurrency(netAmount)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-slate-600">Totale IVA</span>
          <span className="font-mono">{formatCurrency(vatAmount)}</span>
        </div>
        {hasBollo && (
          <div className="flex justify-between text-sm">
            <span className="text-slate-600">Bollo virtuale</span>
            <span className="font-mono">{formatCurrency(datiBollo?.importoBollo || 2)}</span>
          </div>
        )}
        {arrotondamento !== undefined && arrotondamento !== 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-slate-600">Arrotondamento</span>
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
          <span className="text-slate-600">Bollo Virtuale</span>
          <Badge variant="outline">Sì</Badge>
        </div>
        {datiBollo.importoBollo && (
          <div className="flex justify-between text-sm">
            <span className="text-slate-600">Importo</span>
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
}

export function PaymentSection({ datiPagamento, deadlines }: PaymentSectionProps) {
  // Use parsed data if available, otherwise fall back to deadlines from DB
  const payments = datiPagamento?.dettagliPagamento || []

  // Merge parsed data with deadlines for IBAN and isPaid info
  const paymentItems = payments.length > 0
    ? payments.map((p, idx) => ({
        ...p,
        isPaid: deadlines?.[idx]?.isPaid || false,
      }))
    : deadlines?.map(d => ({
        modalitaPagamento: d.paymentMethod || 'NON_SPECIFICATO',
        dataScadenzaPagamento: d.dueDate,
        importoPagamento: parseFloat(d.amount),
        iban: d.iban,
        isPaid: d.isPaid,
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
                      <span className="text-sm text-slate-600">{payment.istitutoFinanziario}</span>
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
  recordedAt?: string
  journalEntryDescription?: string
}

export function MetadataSection({
  venueName,
  importedAt,
  fileName,
  recordedAt,
  journalEntryDescription,
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
        {recordedAt && journalEntryDescription && (
          <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
            <p className="text-sm font-medium text-green-800">
              Registrata in Prima Nota
            </p>
            <p className="text-xs text-green-600">
              {formatDateIT(recordedAt)} - {journalEntryDescription}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

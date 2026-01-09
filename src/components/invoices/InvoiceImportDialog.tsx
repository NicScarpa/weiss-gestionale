'use client'

import { useState, useCallback } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { useSession } from 'next-auth/react'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import {
  Upload,
  FileText,
  Check,
  AlertCircle,
  Building2,
  Receipt,
  CreditCard,
  Loader2,
  X,
  Plus,
  ShieldCheck,
} from 'lucide-react'
import { extractXmlFromP7m, isP7mFile } from '@/lib/p7m-utils'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { toast } from 'sonner'

interface InvoiceImportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

interface ParsedInvoice {
  parsed: {
    tipoDocumento: string
    tipoDocumentoDesc: string
    numero: string
    data: string
    causale?: string
    fornitore: {
      denominazione: string
      partitaIva: string
      codiceFiscale?: string
      indirizzo: string
    }
    importi: {
      netAmount: number
      vatAmount: number
      totalAmount: number
    }
    linee: Array<{
      descrizione: string
      quantita?: number
      prezzoUnitario: number
      prezzoTotale: number
      aliquotaIVA: number
    }>
    riepilogoIVA: Array<{
      aliquota: number
      imponibile: number
      imposta: number
    }>
    scadenze: Array<{
      dataScadenza: string
      importo: number
      modalita: string
      modalitaDesc: string
    }>
  }
  supplierMatch: {
    found: boolean
    supplier: { id: string; name: string; vatNumber: string } | null
    suggestedData: {
      name: string
      vatNumber: string | null
      fiscalCode: string | null
      address: string | null
      city: string | null
      province: string | null
      postalCode: string | null
    }
  }
  suggestedAccount: { id: string; code: string; name: string } | null
  existingInvoice: { id: string; status: string } | null
}

interface Venue {
  id: string
  name: string
  code: string
}

interface Account {
  id: string
  code: string
  name: string
  type: string
}

async function parseInvoice(
  xmlContent: string,
  fileName?: string
): Promise<ParsedInvoice> {
  const res = await fetch('/api/invoices/parse', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ xmlContent, fileName }),
  })
  if (!res.ok) {
    const data = await res.json()
    throw new Error(data.error || 'Errore parsing')
  }
  return res.json()
}

async function importInvoice(data: {
  xmlContent: string
  fileName?: string
  venueId: string
  supplierId?: string
  createSupplier: boolean
  supplierData?: Record<string, unknown>
  accountId?: string
}): Promise<unknown> {
  const res = await fetch('/api/invoices', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) {
    const data = await res.json()
    throw new Error(data.error || 'Errore import')
  }
  return res.json()
}

async function fetchVenues(): Promise<Venue[]> {
  const res = await fetch('/api/venues')
  if (!res.ok) throw new Error('Errore caricamento sedi')
  const data = await res.json()
  return data.venues || []
}

async function fetchAccounts(): Promise<Account[]> {
  const res = await fetch('/api/accounts?type=COSTO')
  if (!res.ok) throw new Error('Errore caricamento conti')
  const data = await res.json()
  return data.accounts || []
}

export function InvoiceImportDialog({
  open,
  onOpenChange,
  onSuccess,
}: InvoiceImportDialogProps) {
  const { data: session } = useSession()
  const [step, setStep] = useState<'upload' | 'preview' | 'confirm'>('upload')
  const [xmlContent, setXmlContent] = useState<string>('')
  const [fileName, setFileName] = useState<string>('')
  const [isSignedFile, setIsSignedFile] = useState<boolean>(false)
  const [parsedData, setParsedData] = useState<ParsedInvoice | null>(null)
  const [selectedVenueId, setSelectedVenueId] = useState<string>('')
  const [selectedAccountId, setSelectedAccountId] = useState<string>('_none')
  const [createNewSupplier, setCreateNewSupplier] = useState(false)

  // Query per sedi e conti
  const { data: venues } = useQuery({
    queryKey: ['venues'],
    queryFn: fetchVenues,
    enabled: open,
  })

  const { data: accounts } = useQuery({
    queryKey: ['accounts-cost'],
    queryFn: fetchAccounts,
    enabled: open,
  })

  // Mutation per parsing
  const parseMutation = useMutation({
    mutationFn: () => parseInvoice(xmlContent, fileName),
    onSuccess: (data) => {
      setParsedData(data)

      // Set default venue
      if (session?.user?.venueId) {
        setSelectedVenueId(session.user.venueId)
      } else if (venues?.length === 1) {
        setSelectedVenueId(venues[0].id)
      }

      // Set suggested account
      if (data.suggestedAccount) {
        setSelectedAccountId(data.suggestedAccount.id)
      }

      // Set createNewSupplier se non trovato match
      setCreateNewSupplier(!data.supplierMatch.found)

      setStep('preview')
    },
    onError: (err: Error) => {
      toast.error(err.message)
    },
  })

  // Mutation per import
  const importMutation = useMutation({
    mutationFn: () =>
      importInvoice({
        xmlContent,
        fileName,
        venueId: selectedVenueId,
        supplierId: parsedData?.supplierMatch.supplier?.id,
        createSupplier: createNewSupplier,
        supplierData: createNewSupplier
          ? parsedData?.supplierMatch.suggestedData
          : undefined,
        accountId: selectedAccountId && selectedAccountId !== '_none' ? selectedAccountId : undefined,
      }),
    onSuccess: () => {
      toast.success('Fattura importata con successo')
      resetDialog()
      onSuccess()
    },
    onError: (err: Error) => {
      toast.error(err.message)
    },
  })

  const resetDialog = useCallback(() => {
    setStep('upload')
    setXmlContent('')
    setFileName('')
    setIsSignedFile(false)
    setParsedData(null)
    setSelectedVenueId('')
    setSelectedAccountId('_none')
    setCreateNewSupplier(false)
  }, [])

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const lowerName = file.name.toLowerCase()
    const isXml = lowerName.endsWith('.xml')
    const isP7m = isP7mFile(file.name)

    if (!isXml && !isP7m) {
      toast.error('Seleziona un file XML o P7M')
      return
    }

    setFileName(file.name)
    setIsSignedFile(isP7m)

    try {
      if (isP7m) {
        // Extract XML from P7M envelope
        const buffer = await file.arrayBuffer()
        const extractedXml = extractXmlFromP7m(buffer)
        setXmlContent(extractedXml)
        toast.success('XML estratto dal file firmato')
      } else {
        const content = await file.text()
        setXmlContent(content)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Errore lettura file'
      toast.error(message)
      setFileName('')
      setIsSignedFile(false)
    }
  }

  const handleDrop = useCallback(
    async (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      const file = e.dataTransfer.files[0]
      if (!file) return

      const lowerName = file.name.toLowerCase()
      const isXml = lowerName.endsWith('.xml')
      const isP7m = isP7mFile(file.name)

      if (!isXml && !isP7m) {
        toast.error('Seleziona un file XML o P7M')
        return
      }

      setFileName(file.name)
      setIsSignedFile(isP7m)

      try {
        if (isP7m) {
          // Extract XML from P7M envelope
          const buffer = await file.arrayBuffer()
          const extractedXml = extractXmlFromP7m(buffer)
          setXmlContent(extractedXml)
          toast.success('XML estratto dal file firmato')
        } else {
          const content = await file.text()
          setXmlContent(content)
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Errore lettura file'
        toast.error(message)
        setFileName('')
        setIsSignedFile(false)
      }
    },
    []
  )

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('it-IT', {
      style: 'currency',
      currency: 'EUR',
    }).format(value)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(open) => {
        if (!open) resetDialog()
        onOpenChange(open)
      }}
    >
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {step === 'upload' && 'Importa Fattura Elettronica'}
            {step === 'preview' && 'Anteprima Fattura'}
            {step === 'confirm' && 'Conferma Import'}
          </DialogTitle>
        </DialogHeader>

        {/* Step 1: Upload */}
        {step === 'upload' && (
          <div className="space-y-4">
            <div
              className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-amber-500 transition-colors"
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => document.getElementById('file-input')?.click()}
            >
              <input
                id="file-input"
                type="file"
                accept=".xml,.p7m"
                className="hidden"
                onChange={handleFileChange}
              />
              <Upload className="h-12 w-12 mx-auto text-slate-400 mb-4" />
              <p className="font-medium">
                Trascina qui il file XML o P7M o clicca per selezionare
              </p>
              <p className="text-sm text-slate-500 mt-1">
                Supporta il formato FatturaPA (XML e P7M firmato)
              </p>
            </div>

            {xmlContent && (
              <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-lg">
                <FileText className="h-5 w-5 text-amber-500" />
                <span className="flex-1 font-medium">{fileName}</span>
                {isSignedFile && (
                  <Badge className="bg-green-100 text-green-700">
                    <ShieldCheck className="h-3 w-3 mr-1" />
                    Firmato
                  </Badge>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setXmlContent('')
                    setFileName('')
                    setIsSignedFile(false)
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Step 2: Preview */}
        {step === 'preview' && parsedData && (
          <div className="space-y-6">
            {/* Warning se già importata */}
            {parsedData.existingInvoice && (
              <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800">
                <AlertCircle className="h-5 w-5" />
                <span>
                  Questa fattura è già stata importata (stato:{' '}
                  {parsedData.existingInvoice.status})
                </span>
              </div>
            )}

            {/* Info documento */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-slate-500">Tipo Documento</Label>
                <p className="font-medium">{parsedData.parsed.tipoDocumentoDesc}</p>
              </div>
              <div>
                <Label className="text-slate-500">Numero</Label>
                <p className="font-medium">{parsedData.parsed.numero}</p>
              </div>
              <div>
                <Label className="text-slate-500">Data</Label>
                <p className="font-medium">
                  {format(new Date(parsedData.parsed.data), 'dd/MM/yyyy', {
                    locale: it,
                  })}
                </p>
              </div>
              <div>
                <Label className="text-slate-500">Importo Totale</Label>
                <p className="font-medium text-lg">
                  {formatCurrency(parsedData.parsed.importi.totalAmount)}
                </p>
              </div>
            </div>

            <Separator />

            {/* Fornitore */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-slate-500" />
                <span className="font-medium">Fornitore</span>
                {parsedData.supplierMatch.found ? (
                  <Badge className="bg-green-100 text-green-700">
                    <Check className="h-3 w-3 mr-1" />
                    Trovato
                  </Badge>
                ) : (
                  <Badge className="bg-amber-100 text-amber-700">
                    <Plus className="h-3 w-3 mr-1" />
                    Nuovo
                  </Badge>
                )}
              </div>

              <div className="p-3 bg-slate-50 rounded-lg">
                <p className="font-medium">
                  {parsedData.parsed.fornitore.denominazione}
                </p>
                <p className="text-sm text-slate-500">
                  P.IVA: {parsedData.parsed.fornitore.partitaIva}
                </p>
                <p className="text-sm text-slate-500">
                  {parsedData.parsed.fornitore.indirizzo}
                </p>
              </div>
            </div>

            <Separator />

            {/* Selezione sede */}
            <div className="space-y-2">
              <Label>Sede *</Label>
              <Select value={selectedVenueId} onValueChange={setSelectedVenueId}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleziona sede" />
                </SelectTrigger>
                <SelectContent>
                  {venues?.map((venue) => (
                    <SelectItem key={venue.id} value={venue.id}>
                      {venue.name} ({venue.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Selezione conto */}
            <div className="space-y-2">
              <Label>Conto di spesa (opzionale)</Label>
              <Select
                value={selectedAccountId}
                onValueChange={setSelectedAccountId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleziona conto" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">Nessun conto</SelectItem>
                  {accounts?.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.code} - {account.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {parsedData.suggestedAccount && (
                <p className="text-xs text-slate-500">
                  Suggerito: {parsedData.suggestedAccount.code} -{' '}
                  {parsedData.suggestedAccount.name}
                </p>
              )}
            </div>

            {/* Riepilogo importi */}
            <div className="p-4 bg-slate-50 rounded-lg space-y-2">
              <div className="flex justify-between text-sm">
                <span>Imponibile</span>
                <span>{formatCurrency(parsedData.parsed.importi.netAmount)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>IVA</span>
                <span>{formatCurrency(parsedData.parsed.importi.vatAmount)}</span>
              </div>
              <Separator />
              <div className="flex justify-between font-medium">
                <span>Totale</span>
                <span>{formatCurrency(parsedData.parsed.importi.totalAmount)}</span>
              </div>
            </div>

            {/* Scadenze */}
            {parsedData.parsed.scadenze.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <CreditCard className="h-5 w-5 text-slate-500" />
                  <span className="font-medium">Scadenze</span>
                </div>
                {parsedData.parsed.scadenze.map((scadenza, i) => (
                  <div
                    key={i}
                    className="flex justify-between text-sm p-2 bg-slate-50 rounded"
                  >
                    <span>
                      {format(new Date(scadenza.dataScadenza), 'dd/MM/yyyy', {
                        locale: it,
                      })}{' '}
                      - {scadenza.modalitaDesc}
                    </span>
                    <span className="font-medium">
                      {formatCurrency(scadenza.importo)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          {step === 'upload' && (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Annulla
              </Button>
              <Button
                onClick={() => parseMutation.mutate()}
                disabled={!xmlContent || parseMutation.isPending}
              >
                {parseMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Analisi...
                  </>
                ) : (
                  'Analizza'
                )}
              </Button>
            </>
          )}

          {step === 'preview' && (
            <>
              <Button variant="outline" onClick={() => setStep('upload')}>
                Indietro
              </Button>
              <Button
                onClick={() => importMutation.mutate()}
                disabled={
                  !selectedVenueId ||
                  importMutation.isPending ||
                  !!parsedData?.existingInvoice
                }
              >
                {importMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Importazione...
                  </>
                ) : (
                  'Importa Fattura'
                )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

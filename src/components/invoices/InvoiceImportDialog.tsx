'use client'

/**
 * Invoice Import Dialog - Upload and import FatturaPA XML files
 * Supports Batch Upload
 */

import { useState, useCallback, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSession } from 'next-auth/react'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import {
  Upload,
  FileText,
  Check,
  AlertCircle,
  Building2,
  CreditCard,
  Loader2,
  X,
  Plus,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  Pencil,
  ArrowRight,
  Play
} from 'lucide-react'
import { extractXmlFromP7m, isP7mFile } from '@/lib/p7m-utils'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Progress } from '@/components/ui/progress'
import { ScrollArea } from '@/components/ui/scroll-area'
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

// Editable supplier data structure
interface EditableSupplierData {
  name: string
  vatNumber: string
  fiscalCode: string
  address: string
  city: string
  province: string
  postalCode: string
}

// File status in the batch process
interface FileItem {
  id: string
  file: File
  fileName: string
  xmlContent?: string
  status: 'pending' | 'parsing' | 'importing' | 'completed' | 'skipped' | 'needs_review' | 'error'
  error?: string
  parsedData?: ParsedInvoice
  isSigned: boolean
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

// Helper outside component
const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
  }).format(value)
}

export function InvoiceImportDialog({
  open,
  onOpenChange,
  onSuccess,
}: InvoiceImportDialogProps) {
  const { data: session } = useSession()
  const queryClient = useQueryClient()
  
  // Dialog State
  const [step, setStep] = useState<'upload' | 'processing' | 'review' | 'summary'>('upload')
  const [files, setFiles] = useState<FileItem[]>([])
  const [currentReviewIndex, setCurrentReviewIndex] = useState(0)
  
  // Review Item State
  const [selectedVenueId, setSelectedVenueId] = useState<string>('')
  const [selectedAccountId, setSelectedAccountId] = useState<string>('_none')
  const [createNewSupplier, setCreateNewSupplier] = useState(false)
  const [supplierFormOpen, setSupplierFormOpen] = useState(true)
  const [editableSupplier, setEditableSupplier] = useState<EditableSupplierData>({
    name: '', vatNumber: '', fiscalCode: '', address: '', city: '', province: '', postalCode: '',
  })
  
  // Processing ref to avoid double execution
  const isProcessing = useRef(false)

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

  // Set default venue from session
  useEffect(() => {
    if (session?.user?.venueId && !selectedVenueId) {
      setSelectedVenueId(session.user.venueId)
    } else if (venues?.length === 1 && !selectedVenueId) {
      setSelectedVenueId(venues[0].id)
    }
  }, [session, venues, selectedVenueId])

  const resetDialog = useCallback(() => {
    setStep('upload')
    setFiles([])
    setCurrentReviewIndex(0)
    isProcessing.current = false
  }, [])

  // 1. Handle File Selection
  const handleFiles = async (inputFiles: FileList | null) => {
    if (!inputFiles || inputFiles.length === 0) return

    const newFiles: FileItem[] = []
    
    for (let i = 0; i < inputFiles.length; i++) {
      const file = inputFiles[i]
      const lowerName = file.name.toLowerCase()
      const isXml = lowerName.endsWith('.xml')
      const isP7m = isP7mFile(file.name)

      if (isXml || isP7m) {
        newFiles.push({
          id: Math.random().toString(36).substr(2, 9),
          file,
          fileName: file.name,
          status: 'pending',
          isSigned: isP7m
        })
      }
    }

    if (newFiles.length === 0) {
      toast.error('Nessun file XML o P7M valido selezionato')
      return
    }

    setFiles(prev => [...prev, ...newFiles])
  }

  // 2. Process Queue
  const processQueue = useCallback(async () => {
    if (files.length === 0 || isProcessing.current) return
    
    setStep('processing')
    isProcessing.current = true

    const updatedFiles = [...files]
    let needsReviewCount = 0

    // Use default venue if available
    let currentVenueId = selectedVenueId
    if (!currentVenueId && session?.user?.venueId) currentVenueId = session.user.venueId
    if (!currentVenueId && venues?.length === 1) currentVenueId = venues[0].id

    for (let i = 0; i < updatedFiles.length; i++) {
      const item = updatedFiles[i]
      if (item.status !== 'pending') continue

      // Update UI to parsing
      updatedFiles[i] = { ...item, status: 'parsing' }
      setFiles([...updatedFiles])

      try {
        // Read file
        let content = ''
        if (item.isSigned) {
          const buffer = await item.file.arrayBuffer()
          content = extractXmlFromP7m(buffer)
        } else {
          content = await item.file.text()
        }
        updatedFiles[i].xmlContent = content

        // Parse
        const parsed = await parseInvoice(content, item.fileName)
        updatedFiles[i].parsedData = parsed

        // Logic Check
        if (parsed.existingInvoice) {
          updatedFiles[i].status = 'skipped'
        } else if (parsed.supplierMatch.found && currentVenueId) {
          // Auto-Import
          updatedFiles[i].status = 'importing'
          setFiles([...updatedFiles])

          await importInvoice({
            xmlContent: content,
            fileName: item.fileName,
            venueId: currentVenueId,
            supplierId: parsed.supplierMatch.supplier!.id,
            createSupplier: false,
            accountId: parsed.suggestedAccount?.id
          })
          
          updatedFiles[i].status = 'completed'
        } else {
          // Needs Review (New Supplier OR Missing Venue)
          updatedFiles[i].status = 'needs_review'
          needsReviewCount++
        }
      } catch (err) {
        console.error(err)
        updatedFiles[i].status = 'error'
        updatedFiles[i].error = err instanceof Error ? err.message : 'Errore sconosciuto'
      }

      setFiles([...updatedFiles])
    }

    isProcessing.current = false
    
    // Refresh queries
    queryClient.invalidateQueries({ queryKey: ['invoices'] })
    onSuccess() // Notify parent list to refresh

    // Move to next step
    if (needsReviewCount > 0) {
      // Find first index needing review
      const firstReviewIndex = updatedFiles.findIndex(f => f.status === 'needs_review')
      setCurrentReviewIndex(firstReviewIndex)
      prepareReviewItem(updatedFiles[firstReviewIndex])
      setStep('review')
    } else {
      setStep('summary')
    }
  }, [files, selectedVenueId, session, venues, queryClient, onSuccess])

  // Prepare review item state
  const prepareReviewItem = (item: FileItem) => {
    if (!item.parsedData) return

    // Set suggested data
    if (item.parsedData.supplierMatch.suggestedData) {
      const s = item.parsedData.supplierMatch.suggestedData
      setEditableSupplier({
        name: s.name || '',
        vatNumber: s.vatNumber || '',
        fiscalCode: s.fiscalCode || '',
        address: s.address || '',
        city: s.city || '',
        province: s.province || '',
        postalCode: s.postalCode || '',
      })
    } else {
      // Fallback to parsed raw data
      const f = item.parsedData.parsed.fornitore
      setEditableSupplier({
        name: f.denominazione || '',
        vatNumber: f.partitaIva || '',
        fiscalCode: f.codiceFiscale || '',
        address: f.indirizzo || '',
        city: '', province: '', postalCode: '',
      })
    }

    setCreateNewSupplier(!item.parsedData.supplierMatch.found)
    setSupplierFormOpen(!item.parsedData.supplierMatch.found)
    
    if (item.parsedData.suggestedAccount) {
      setSelectedAccountId(item.parsedData.suggestedAccount.id)
    } else {
      setSelectedAccountId('_none')
    }
  }

  // Handle Review Actions
  const handleImportReviewItem = async () => {
    const currentFile = files[currentReviewIndex]
    if (!currentFile || !currentFile.parsedData || !currentFile.xmlContent) return

    try {
      // Optimistic update
      const updatedFiles = [...files]
      updatedFiles[currentReviewIndex].status = 'importing'
      setFiles(updatedFiles)

      await importInvoice({
        xmlContent: currentFile.xmlContent,
        fileName: currentFile.fileName,
        venueId: selectedVenueId,
        supplierId: currentFile.parsedData.supplierMatch.supplier?.id,
        createSupplier: createNewSupplier,
        supplierData: createNewSupplier ? (editableSupplier as any) : undefined,
        accountId: selectedAccountId !== '_none' ? selectedAccountId : undefined
      })

      updatedFiles[currentReviewIndex].status = 'completed'
      setFiles(updatedFiles)
      toast.success('Fattura importata')
      
      // Move to next review item
      const nextIndex = updatedFiles.findIndex((f, idx) => idx > currentReviewIndex && f.status === 'needs_review')
      if (nextIndex !== -1) {
        setCurrentReviewIndex(nextIndex)
        prepareReviewItem(updatedFiles[nextIndex])
      } else {
        setStep('summary')
      }
    } catch (err) {
      const updatedFiles = [...files]
      updatedFiles[currentReviewIndex].status = 'error'
      updatedFiles[currentReviewIndex].error = err instanceof Error ? err.message : 'Errore import'
      setFiles(updatedFiles)
      toast.error('Errore importazione')
    }
  }

  const handleSkipReviewItem = () => {
    const updatedFiles = [...files]
    updatedFiles[currentReviewIndex].status = 'skipped'
    setFiles(updatedFiles)

    const nextIndex = updatedFiles.findIndex((f, idx) => idx > currentReviewIndex && f.status === 'needs_review')
    if (nextIndex !== -1) {
      setCurrentReviewIndex(nextIndex)
      prepareReviewItem(updatedFiles[nextIndex])
    } else {
      setStep('summary')
    }
  }

  // Stats
  const stats = {
    total: files.length,
    completed: files.filter(f => f.status === 'completed').length,
    skipped: files.filter(f => f.status === 'skipped').length,
    error: files.filter(f => f.status === 'error').length,
    pending: files.filter(f => f.status === 'pending' || f.status === 'parsing' || f.status === 'importing' || f.status === 'needs_review').length
  }

  const handleSupplierFieldChange = (field: keyof EditableSupplierData, value: string) => {
    setEditableSupplier((prev) => ({ ...prev, [field]: value }))
  }

  const currentFile = files[currentReviewIndex]

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetDialog(); onOpenChange(v); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importazione Fatture</DialogTitle>
          <DialogDescription>
            {step === 'upload' && 'Carica uno o più file XML/P7M'}
            {step === 'processing' && 'Elaborazione in corso...'}
            {step === 'review' && 'Revisione fatture (Fornitori nuovi)'}
            {step === 'summary' && 'Riepilogo Importazione'}
          </DialogDescription>
        </DialogHeader>

        {/* STEP 1: UPLOAD */}
        {step === 'upload' && (
          <div className="space-y-4">
             <div
              className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-amber-500 transition-colors"
              onDrop={(e) => { e.preventDefault(); handleFiles(e.dataTransfer.files); }}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => document.getElementById('file-input')?.click()}
            >
              <input
                id="file-input"
                type="file"
                multiple
                accept=".xml,.p7m"
                className="hidden"
                onChange={(e) => handleFiles(e.target.files)}
              />
              <Upload className="h-12 w-12 mx-auto text-slate-400 mb-4" />
              <p className="font-medium">
                Trascina qui i file XML o P7M (Multi-upload supportato)
              </p>
              <p className="text-sm text-slate-500 mt-1">
                Le fatture con fornitore già censito verranno importate automaticamente.
              </p>
            </div>

            {files.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">{files.length} file selezionati</p>
                <ScrollArea className="h-40 border rounded-md p-2">
                  {files.map((file, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm p-1">
                      <FileText className="h-4 w-4 text-slate-400" />
                      <span className="truncate flex-1">{file.fileName}</span>
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => {
                        const newFiles = [...files];
                        newFiles.splice(i, 1);
                        setFiles(newFiles);
                      }}>
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </ScrollArea>
              </div>
            )}
          </div>
        )}

        {/* STEP 2: PROCESSING */}
        {step === 'processing' && (
          <div className="space-y-6 py-8 text-center">
            <Loader2 className="h-12 w-12 mx-auto text-amber-500 animate-spin" />
            <div className="space-y-2">
              <h3 className="font-medium">Elaborazione file...</h3>
              <Progress value={((stats.total - stats.pending) / stats.total) * 100} />
              <p className="text-sm text-muted-foreground">
                {stats.total - stats.pending} di {stats.total} elaborati
              </p>
            </div>
            <div className="text-sm text-left bg-slate-50 p-4 rounded-lg space-y-1">
              {files.map(f => (
                <div key={f.id} className="flex items-center gap-2">
                  {f.status === 'pending' && <span className="text-slate-400">Attesa...</span>}
                  {f.status === 'parsing' && <Loader2 className="h-3 w-3 animate-spin" />}
                  {f.status === 'completed' && <Check className="h-3 w-3 text-green-500" />}
                  {f.status === 'skipped' && <span className="text-amber-500 text-xs">Già presente</span>}
                  {f.status === 'needs_review' && <span className="text-blue-500 text-xs">Da rivedere</span>}
                  {f.status === 'error' && <X className="h-3 w-3 text-red-500" />}
                  <span className="truncate max-w-[200px]">{f.fileName}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* STEP 3: REVIEW (Wizard) */}
        {step === 'review' && currentFile && currentFile.parsedData && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <Badge variant="outline">
                File {files.indexOf(currentFile) + 1} di {stats.total}
              </Badge>
              <Badge className="bg-blue-100 text-blue-700">Nuovo Fornitore</Badge>
            </div>

            {/* Preview Card */}
            <div className="bg-slate-50 p-4 rounded-lg border space-y-3">
               <div className="flex justify-between items-start">
                  <div>
                    <h4 className="font-medium">{currentFile.parsedData.parsed.fornitore.denominazione}</h4>
                    <p className="text-sm text-slate-500">{currentFile.parsedData.parsed.numero} del {format(new Date(currentFile.parsedData.parsed.data), 'dd/MM/yyyy')}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold">{formatCurrency(currentFile.parsedData.parsed.importi.totalAmount)}</p>
                  </div>
               </div>
            </div>

             {/* Fornitore Form */}
            <div className="space-y-4 border p-4 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <Pencil className="h-4 w-4 text-amber-500" />
                  <h4 className="font-medium">Dati Anagrafici Fornitore</h4>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Ragione Sociale *</Label>
                    <Input 
                      value={editableSupplier.name} 
                      onChange={(e) => handleSupplierFieldChange('name', e.target.value)}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                     <div className="space-y-2">
                        <Label>P.IVA</Label>
                        <Input 
                          value={editableSupplier.vatNumber} 
                          onChange={(e) => handleSupplierFieldChange('vatNumber', e.target.value)}
                        />
                     </div>
                     <div className="space-y-2">
                        <Label>Codice Fiscale</Label>
                        <Input 
                          value={editableSupplier.fiscalCode} 
                          onChange={(e) => handleSupplierFieldChange('fiscalCode', e.target.value)}
                        />
                     </div>
                  </div>
                   <div className="space-y-2">
                        <Label>Indirizzo</Label>
                        <Input 
                          value={editableSupplier.address} 
                          onChange={(e) => handleSupplierFieldChange('address', e.target.value)}
                        />
                  </div>
                  <div className="grid grid-cols-5 gap-4">
                      <div className="col-span-2 space-y-2">
                          <Label>Città</Label>
                          <Input value={editableSupplier.city} onChange={(e) => handleSupplierFieldChange('city', e.target.value)} />
                      </div>
                       <div className="space-y-2">
                          <Label>Prov.</Label>
                          <Input value={editableSupplier.province} onChange={(e) => handleSupplierFieldChange('province', e.target.value.toUpperCase())} maxLength={2} className="uppercase" />
                      </div>
                      <div className="col-span-2 space-y-2">
                          <Label>CAP</Label>
                          <Input value={editableSupplier.postalCode} onChange={(e) => handleSupplierFieldChange('postalCode', e.target.value)} maxLength={5} />
                      </div>
                  </div>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
               <div className="space-y-2">
                <Label>Sede *</Label>
                <Select value={selectedVenueId} onValueChange={setSelectedVenueId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleziona sede" />
                  </SelectTrigger>
                  <SelectContent>
                    {venues?.map((venue) => (
                      <SelectItem key={venue.id} value={venue.id}>
                        {venue.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Conto Spesa</Label>
                <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleziona conto" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">Nessuno</SelectItem>
                    {accounts?.map((acc) => (
                      <SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

          </div>
        )}

        {/* STEP 4: SUMMARY */}
        {step === 'summary' && (
          <div className="space-y-6 text-center py-4">
             <div className="flex justify-center mb-4">
                <div className="bg-green-100 p-4 rounded-full">
                  <Check className="h-8 w-8 text-green-600" />
                </div>
             </div>
             <h3 className="text-xl font-bold">Importazione Completata</h3>
             
             <div className="grid grid-cols-3 gap-4 text-center">
                <div className="p-3 bg-slate-50 rounded-lg">
                   <p className="text-2xl font-bold text-slate-700">{stats.total}</p>
                   <p className="text-xs text-slate-500 uppercase">Totali</p>
                </div>
                <div className="p-3 bg-green-50 rounded-lg">
                   <p className="text-2xl font-bold text-green-700">{stats.completed}</p>
                   <p className="text-xs text-green-600 uppercase">Importate</p>
                </div>
                <div className="p-3 bg-amber-50 rounded-lg">
                   <p className="text-2xl font-bold text-amber-700">{stats.skipped}</p>
                   <p className="text-xs text-amber-600 uppercase">Già Presenti</p>
                </div>
             </div>
             
             {stats.error > 0 && (
                <div className="bg-red-50 p-3 rounded-lg text-sm text-red-600 mt-4">
                   {stats.error} errori durante l'importazione
                </div>
             )}
          </div>
        )}

        <DialogFooter>
          {step === 'upload' && (
             <Button 
              onClick={processQueue} 
              disabled={files.length === 0}
              className="w-full sm:w-auto"
            >
              Avvia Importazione ({files.length} file)
            </Button>
          )}
          
          {step === 'review' && (
             <div className="flex gap-2 w-full justify-end">
                <Button variant="outline" onClick={handleSkipReviewItem}>
                  Salta
                </Button>
                <Button onClick={handleImportReviewItem}>
                  Importa e Continua
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
             </div>
          )}

          {step === 'summary' && (
             <Button onClick={() => onOpenChange(false)}>
                Chiudi
             </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
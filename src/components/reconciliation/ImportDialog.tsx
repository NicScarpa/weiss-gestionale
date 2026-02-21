'use client'

import { useState, useRef, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'
import type { ImportResult, ImportError } from '@/types/reconciliation'

import { logger } from '@/lib/logger'
interface ImportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

export function ImportDialog({
  open,
  onOpenChange,
  onSuccess,
}: ImportDialogProps) {
  const [venues, setVenues] = useState<Array<{ id: string; name: string; code: string }>>([])
  const [venueId, setVenueId] = useState<string>('')

  useEffect(() => {
    if (open) {
      fetch('/api/venues').then(r => r.json()).then(data => {
        const venueList = data.venues || data.data || []
        setVenues(venueList)
        if (venueList.length === 1) setVenueId(venueList[0].id)
      })
    }
  }, [open])
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [errors, setErrors] = useState<ImportError[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) {
      // Validate file type by extension
      const fileName = selectedFile.name.toLowerCase()
      const isValidExt =
        fileName.endsWith('.csv') ||
        fileName.endsWith('.xls') ||
        fileName.endsWith('.xlsx') ||
        fileName.endsWith('.xml') ||
        fileName.endsWith('.txt')
      if (!isValidExt) {
        toast.error('Formato file non supportato. Usa CSV, XLS, XLSX, XML o TXT.')
        return
      }
      setFile(selectedFile)
      setResult(null)
      setErrors([])
    }
  }

  const handleImport = async () => {
    if (!file || !venueId) {
      toast.error('Seleziona sede e file')
      return
    }

    setLoading(true)
    setResult(null)
    setErrors([])

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('venueId', venueId)

      const res = await fetch('/api/bank-transactions/import', {
        method: 'POST',
        body: formData,
      })

      const data = await res.json()

      if (!res.ok) {
        if (data.errors) {
          setErrors(data.errors)
        }
        throw new Error(data.error || 'Errore durante l\'import')
      }

      setResult(data)

      if (data.recordsImported > 0) {
        toast.success(`Importate ${data.recordsImported} transazioni`)
        onSuccess?.()
      } else if (data.duplicatesSkipped > 0) {
        toast.info(`Tutte le ${data.duplicatesSkipped} transazioni erano già presenti`)
      }
    } catch (error) {
      logger.error('Import error', error)
      toast.error(error instanceof Error ? error.message : 'Errore durante l\'import')
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    setFile(null)
    setResult(null)
    setErrors([])
    setVenueId('')
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Importa Estratto Conto</DialogTitle>
          <DialogDescription>
            Carica un file con i movimenti bancari da riconciliare.
            Formati supportati: CSV, XLS, XLSX, CBI XML, CBI TXT
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="venue">Sede</Label>
            <Select value={venueId} onValueChange={setVenueId}>
              <SelectTrigger>
                <SelectValue placeholder="Seleziona sede" />
              </SelectTrigger>
              <SelectContent>
                {venues.map((venue) => (
                  <SelectItem key={venue.id} value={venue.id}>
                    {venue.name} ({venue.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>File</Label>
            <div
              className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:bg-muted/50 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xls,.xlsx,.xml,.txt"
                onChange={handleFileChange}
                className="hidden"
              />
              {file ? (
                <div className="flex items-center justify-center gap-2">
                  <FileSpreadsheet className="h-8 w-8 text-muted-foreground" />
                  <div className="text-left">
                    <p className="font-medium">{file.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {(file.size / 1024).toFixed(1)} KB
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">
                    Clicca o trascina un file
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    CSV, XLS, XLSX, XML, TXT
                  </p>
                </>
              )}
            </div>
          </div>

          {result && (
            <Alert variant={result.recordsImported > 0 ? 'default' : 'destructive'}>
              <CheckCircle2 className="h-4 w-4" />
              <AlertTitle>Import completato</AlertTitle>
              <AlertDescription>
                <ul className="list-disc list-inside">
                  <li>Transazioni importate: {result.recordsImported}</li>
                  <li>Duplicati saltati: {result.duplicatesSkipped}</li>
                  {result.errors.length > 0 && (
                    <li>Errori: {result.errors.length}</li>
                  )}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          {errors.length > 0 && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Errori nel file</AlertTitle>
              <AlertDescription>
                <ul className="list-disc list-inside max-h-32 overflow-y-auto">
                  {errors.slice(0, 10).map((err, i) => (
                    <li key={i} className="text-sm">
                      Riga {err.row}: {err.message}
                      {err.value && ` (${err.value})`}
                    </li>
                  ))}
                  {errors.length > 10 && (
                    <li className="text-sm">...e altri {errors.length - 10} errori</li>
                  )}
                </ul>
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Chiudi
          </Button>
          <Button onClick={handleImport} disabled={!file || !venueId || loading}>
            {loading ? 'Importazione...' : 'Importa'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

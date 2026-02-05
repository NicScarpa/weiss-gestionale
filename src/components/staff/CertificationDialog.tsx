'use client'

import { useState, useRef } from 'react'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Upload, FileText, X, Loader2 } from 'lucide-react'
import {
  CERTIFICATION_TYPES,
  type CertificationType,
  type Certification,
} from '@/types/certifications'

const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB
const ACCEPTED_TYPES = '.pdf,.jpg,.jpeg,.png'

interface CertificationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  certification?: Certification | null
  existingTypes: CertificationType[]
  onSubmit: (data: {
    type: CertificationType
    obtainedDate: string
    expiryDate: string
    documentUrl?: string | null
  }) => void
  isSubmitting: boolean
}

export function CertificationDialog({
  open,
  onOpenChange,
  certification,
  existingTypes,
  onSubmit,
  isSubmitting,
}: CertificationDialogProps) {
  const isEditing = !!certification
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [type, setType] = useState<CertificationType | ''>(
    certification?.type || ''
  )
  const [obtainedDate, setObtainedDate] = useState(
    certification?.obtainedDate?.split('T')[0] || ''
  )
  const [expiryDate, setExpiryDate] = useState(
    certification?.expiryDate?.split('T')[0] || ''
  )
  const [documentUrl, setDocumentUrl] = useState<string | null>(
    certification?.documentUrl || null
  )
  const [hasDocument, setHasDocument] = useState(
    !!certification?.documentUrl || !!certification?.hasDocument
  )
  const [fileError, setFileError] = useState('')
  const [attempted, setAttempted] = useState(false)

  // Tipi disponibili: escludi quelli già presenti (tranne quello corrente in modifica)
  const availableTypes = (
    Object.keys(CERTIFICATION_TYPES) as CertificationType[]
  ).filter(
    (t) => !existingTypes.includes(t) || (isEditing && t === certification?.type)
  )

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    setFileError('')

    if (!file) return

    if (file.size > MAX_FILE_SIZE) {
      setFileError('Il file supera il limite di 5MB')
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      setDocumentUrl(reader.result as string)
      setHasDocument(true)
    }
    reader.readAsDataURL(file)
  }

  const handleRemoveDocument = () => {
    setDocumentUrl(null)
    setHasDocument(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setAttempted(true)
    if (!isValid) return

    onSubmit({
      type,
      obtainedDate,
      expiryDate,
      documentUrl,
    })
  }

  const isValid =
    type !== '' &&
    obtainedDate !== '' &&
    expiryDate !== '' &&
    new Date(expiryDate) > new Date(obtainedDate) &&
    hasDocument

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? 'Modifica Certificazione' : 'Nuova Certificazione'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Tipo attestato */}
          <div className="space-y-2">
            <Label htmlFor="cert-type">Tipo attestato</Label>
            <Select
              value={type}
              onValueChange={(v) => setType(v as CertificationType)}
              disabled={isEditing}
            >
              <SelectTrigger id="cert-type">
                <SelectValue placeholder="Seleziona tipo..." />
              </SelectTrigger>
              <SelectContent>
                {availableTypes.map((t) => (
                  <SelectItem key={t} value={t}>
                    {CERTIFICATION_TYPES[t].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {type && (
              <p className="text-xs text-muted-foreground">
                {CERTIFICATION_TYPES[type].description}
              </p>
            )}
          </div>

          {/* Data conseguimento */}
          <div className="space-y-2">
            <Label htmlFor="obtained-date">Data conseguimento</Label>
            <Input
              id="obtained-date"
              type="date"
              value={obtainedDate}
              onChange={(e) => setObtainedDate(e.target.value)}
              required
            />
          </div>

          {/* Data scadenza */}
          <div className="space-y-2">
            <Label htmlFor="expiry-date">Data scadenza</Label>
            <Input
              id="expiry-date"
              type="date"
              value={expiryDate}
              onChange={(e) => setExpiryDate(e.target.value)}
              required
            />
            {obtainedDate &&
              expiryDate &&
              new Date(expiryDate) <= new Date(obtainedDate) && (
                <p className="text-xs text-destructive">
                  La data di scadenza deve essere successiva alla data di
                  conseguimento
                </p>
              )}
          </div>

          {/* Upload documento */}
          <div className="space-y-2">
            <Label>Documento</Label>
            {hasDocument ? (
              <div className="flex items-center gap-2 p-2 border rounded-md bg-muted/30">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <Badge variant="secondary" className="text-xs">
                  Documento caricato
                </Badge>
                <div className="flex-1" />
                {documentUrl && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      const w = window.open()
                      if (w) {
                        if (documentUrl.startsWith('data:application/pdf')) {
                          w.document.write(
                            `<iframe src="${documentUrl}" style="width:100%;height:100%;border:none;"></iframe>`
                          )
                        } else {
                          w.document.write(
                            `<img src="${documentUrl}" style="max-width:100%;height:auto;" />`
                          )
                        }
                      }
                    }}
                  >
                    Visualizza
                  </Button>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={handleRemoveDocument}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ) : (
              <div>
                <Input
                  ref={fileInputRef}
                  type="file"
                  accept={ACCEPTED_TYPES}
                  onChange={handleFileChange}
                  className="hidden"
                  id="cert-file"
                />
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Carica documento (PDF, JPG, PNG - max 5MB)
                </Button>
              </div>
            )}
            {fileError && (
              <p className="text-xs text-destructive">{fileError}</p>
            )}
          </div>

          {attempted && !isValid && (
            <p className="text-sm text-destructive">
              Tutti i campi sono obbligatori
            </p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Annulla
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              {isEditing ? 'Salva' : 'Aggiungi'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

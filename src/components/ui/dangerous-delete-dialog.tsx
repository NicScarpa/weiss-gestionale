'use client'

import { useState, useCallback } from 'react'
import {
  Dialog,
  DialogContent,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AlertTriangle, Loader2, X } from 'lucide-react'

interface DangerousDeleteDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: React.ReactNode
  entityName?: string
  items?: Array<{ id: string; label: string; detail?: string }>
  confirmationWord?: string
  onConfirm: () => Promise<void> | void
  cancelLabel?: string
  confirmLabel?: string
  loadingLabel?: string
  infoNote?: React.ReactNode
}

export function DangerousDeleteDialog({
  open,
  onOpenChange,
  title,
  description,
  entityName,
  items,
  confirmationWord = 'elimina',
  onConfirm,
  cancelLabel = 'Annulla',
  confirmLabel = 'Elimina Definitivamente',
  loadingLabel = 'Eliminazione...',
  infoNote,
}: DangerousDeleteDialogProps) {
  const [confirmInput, setConfirmInput] = useState('')
  const [isDeleting, setIsDeleting] = useState(false)
  const [error, setError] = useState('')

  const isConfirmed = confirmInput.trim().toLowerCase() === confirmationWord.toLowerCase()

  const resetState = useCallback(() => {
    setTimeout(() => {
      setConfirmInput('')
      setIsDeleting(false)
      setError('')
    }, 200)
  }, [])

  const handleOpenChange = (newOpen: boolean) => {
    if (isDeleting) return
    onOpenChange(newOpen)
    if (!newOpen) resetState()
  }

  const handleConfirm = async () => {
    if (!isConfirmed || isDeleting) return
    setIsDeleting(true)
    setError('')
    try {
      await onConfirm()
      onOpenChange(false)
      resetState()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Errore durante l\'eliminazione')
      setIsDeleting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent showCloseButton={!isDeleting} className="max-w-md">
        {/* Banner rosso */}
        <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-lg p-4">
          <AlertTriangle className="h-6 w-6 text-red-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h2 className="text-red-900 text-lg font-semibold">{title}</h2>
            <p className="text-red-700/80 text-sm">{description}</p>
          </div>
        </div>

        {/* Nome entità singola */}
        {entityName && (
          <div className="rounded-md border bg-muted/30 p-3">
            <p className="font-medium text-sm">{entityName}</p>
          </div>
        )}

        {/* Lista entità (bulk) */}
        {items && items.length > 0 && (
          <div className="space-y-2">
            <Label className="text-sm font-medium text-muted-foreground">
              Elementi da eliminare ({items.length}):
            </Label>
            <div className="max-h-[200px] overflow-y-auto border rounded-md">
              <div className="p-2 space-y-1">
                {items.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-2 p-2 rounded-sm bg-muted/30 hover:bg-muted/50"
                  >
                    <X className="h-4 w-4 text-red-500 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sm">{item.label}</p>
                      {item.detail && (
                        <p className="text-xs text-muted-foreground font-mono">
                          {item.detail}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Nota informativa */}
        {infoNote && (
          <div className="bg-amber-50 border border-amber-200 rounded-md p-3 flex gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-xs text-amber-800">{infoNote}</div>
          </div>
        )}

        {/* Input di conferma */}
        <div className="space-y-2">
          <Label htmlFor="dangerous-delete-confirm" className="text-sm">
            Digita <span className="font-bold">{confirmationWord}</span> per confermare
          </Label>
          <Input
            id="dangerous-delete-confirm"
            type="text"
            value={confirmInput}
            onChange={(e) => {
              setConfirmInput(e.target.value)
              setError('')
            }}
            placeholder={confirmationWord}
            disabled={isDeleting}
            autoComplete="off"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && isConfirmed && !isDeleting) {
                handleConfirm()
              }
            }}
          />
          {error && (
            <p className="text-sm text-red-600 flex items-center gap-1">
              <X className="h-3.5 w-3.5" />
              {error}
            </p>
          )}
        </div>

        <DialogFooter className="gap-2 mt-2">
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={isDeleting}
          >
            {cancelLabel}
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={!isConfirmed || isDeleting}
          >
            {isDeleting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {loadingLabel}
              </>
            ) : (
              confirmLabel
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

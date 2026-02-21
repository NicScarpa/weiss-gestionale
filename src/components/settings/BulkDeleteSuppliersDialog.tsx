'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AlertTriangle, Lock, Loader2, Trash2, X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Supplier {
  id: string
  name: string
  vatNumber?: string | null
}

interface BulkDeleteSuppliersDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  suppliers: Supplier[]
  onDeleted: (count: number) => void
}

export function BulkDeleteSuppliersDialog({
  open,
  onOpenChange,
  suppliers,
  onDeleted,
}: BulkDeleteSuppliersDialogProps) {
  const [step, setStep] = useState<'confirm' | 'password'>('confirm')
  const [password, setPassword] = useState('')
  const [isDeleting, setIsDeleting] = useState(false)
  const [error, setError] = useState('')

  const handleOpenChange = (newOpen: boolean) => {
    onOpenChange(newOpen)
    if (!newOpen) {
      setTimeout(() => {
        setStep('confirm')
        setPassword('')
        setError('')
      }, 200)
    }
  }

  const handleContinue = () => {
    setStep('password')
    setError('')
  }

  const handleDelete = async () => {
    if (suppliers.length === 0) return

    if (!password.trim()) {
      setError('Inserisci la password')
      return
    }

    setIsDeleting(true)
    setError('')

    try {
      // Step 1: Verify password
      const verifyRes = await fetch('/api/auth/verify-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })

      const verifyData = await verifyRes.json()

      if (!verifyRes.ok || !verifyData.valid) {
        setError('Password non corretta')
        setIsDeleting(false)
        return
      }

      // Step 2: Bulk delete suppliers
      const deleteRes = await fetch('/api/suppliers', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: suppliers.map(s => s.id) }),
      })

      if (!deleteRes.ok) {
        const deleteData = await deleteRes.json()
        setError(deleteData.error || 'Errore durante l\'eliminazione')
        setIsDeleting(false)
        return
      }

      const result = await deleteRes.json()

      // Success
      handleOpenChange(false)
      onDeleted(result.count || suppliers.length)
    } catch {
      setError('Errore di connessione')
      setIsDeleting(false)
    }
  }

  if (suppliers.length === 0) return null

  const count = suppliers.length
  const supplierLabel = count === 1 ? 'fornitore' : 'fornitori'

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent showCloseButton={!isDeleting} className="max-w-md">
        {step === 'confirm' ? (
          <>
            {/* Warning Header */}
            <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-lg p-4">
              <AlertTriangle className="h-6 w-6 text-red-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <DialogTitle className="text-red-900 text-lg">
                  Elimina {count} {supplierLabel}?
                </DialogTitle>
                <DialogDescription className="text-red-700/80 text-sm">
                  Questa azione disattiverà i fornitori selezionati. I dati storici verranno mantenuti.
                </DialogDescription>
              </div>
            </div>

            {/* Lista fornitori */}
            <div className="space-y-2">
              <Label className="text-sm font-medium text-muted-foreground">
                Fornitori da eliminare ({count}):
              </Label>
              <div className="max-h-[240px] overflow-y-auto border rounded-md">
                <div className="p-2 space-y-1">
                  {suppliers.map((supplier) => (
                    <div
                      key={supplier.id}
                      className="flex items-center gap-2 p-2 rounded-sm bg-muted/30 hover:bg-muted/50"
                    >
                      <X className="h-4 w-4 text-red-500 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-sm">{supplier.name}</p>
                        {supplier.vatNumber && (
                          <p className="text-xs text-muted-foreground font-mono">
                            P.IVA: {supplier.vatNumber}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Nota informativa */}
            <div className="bg-amber-50 border border-amber-200 rounded-md p-3 flex gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-800">
                I fornitori verranno solo disattivati. Tutti i movimenti esistenti (fatture, registrazioni bancarie, prima nota) rimarranno collegati per storico.
              </p>
            </div>

            <DialogFooter className="gap-2 mt-2">
              <Button
                variant="outline"
                onClick={() => handleOpenChange(false)}
                className="flex-1"
              >
                Annulla
              </Button>
              <Button
                variant="destructive"
                onClick={handleContinue}
                className="flex-1"
              >
                Elimina
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Lock className="h-5 w-5 text-muted-foreground" />
                Conferma Password
              </DialogTitle>
              <DialogDescription className="pt-2">
                Inserisci la tua password per confermare l&apos;eliminazione di{' '}
                <strong>{count} {supplierLabel}</strong>.
              </DialogDescription>
            </DialogHeader>

            <div className="py-4 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="bulk-delete-password">Password amministratore</Label>
                <Input
                  id="bulk-delete-password"
                  type="password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value)
                    setError('')
                  }}
                  placeholder="Inserisci la password..."
                  className={cn(
                    "h-11",
                    error && "border-red-500 focus-visible:ring-red-500"
                  )}
                  disabled={isDeleting}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !isDeleting) {
                      handleDelete()
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
            </div>

            <DialogFooter className="gap-2">
              <Button
                variant="outline"
                onClick={() => setStep('confirm')}
                disabled={isDeleting}
                className="flex-1"
              >
                Indietro
              </Button>
              <Button
                variant="destructive"
                onClick={handleDelete}
                disabled={isDeleting || !password.trim()}
                className="flex-1"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Eliminazione...
                  </>
                ) : (
                  <>
                    <Trash2 className="mr-2 h-4 w-4" />
                    Conferma Elimina
                  </>
                )}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

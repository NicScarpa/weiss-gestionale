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
import { AlertTriangle, Lock, Loader2 } from 'lucide-react'

interface Supplier {
  id: string
  name: string
  vatNumber?: string | null
  fiscalCode?: string | null
}

interface DeleteSupplierDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  supplier: Supplier | null
  onDeleted: () => void
}

export function DeleteSupplierDialog({
  open,
  onOpenChange,
  supplier,
  onDeleted,
}: DeleteSupplierDialogProps) {
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
    if (!supplier) return

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

      // Step 2: Delete supplier (soft delete)
      const deleteRes = await fetch(`/api/suppliers?id=${supplier.id}`, {
        method: 'DELETE',
      })

      if (!deleteRes.ok) {
        const deleteData = await deleteRes.json()
        setError(deleteData.error || 'Errore durante l\'eliminazione')
        setIsDeleting(false)
        return
      }

      // Success
      handleOpenChange(false)
      onDeleted()
    } catch {
      setError('Errore di connessione')
      setIsDeleting(false)
    }
  }

  if (!supplier) return null

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent showCloseButton={!isDeleting}>
        {step === 'confirm' ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-5 w-5" />
                Elimina Fornitore
              </DialogTitle>
              <DialogDescription className="pt-2">
                Stai per eliminare il fornitore:
                <span className="block mt-2 font-semibold text-foreground">
                  {supplier.name}
                </span>
                {(supplier.vatNumber || supplier.fiscalCode) && (
                  <span className="block text-xs text-muted-foreground">
                    {supplier.vatNumber && `P.IVA: ${supplier.vatNumber}`}
                    {supplier.vatNumber && supplier.fiscalCode && ' - '}
                    {supplier.fiscalCode && `C.F.: ${supplier.fiscalCode}`}
                  </span>
                )}
                <span className="block mt-4 text-sm">
                  Il fornitore verrà disattivato. Tutti i movimenti esistenti
                  (fatture, registrazioni banca, prima nota) rimarranno
                  collegati per storico.
                </span>
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="mt-4">
              <Button
                variant="outline"
                onClick={() => handleOpenChange(false)}
              >
                Annulla
              </Button>
              <Button
                variant="destructive"
                onClick={handleContinue}
              >
                Continua
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Lock className="h-5 w-5" />
                Conferma con Password
              </DialogTitle>
              <DialogDescription className="pt-2">
                Inserisci la tua password per confermare l&apos;eliminazione del
                fornitore <strong>{supplier.name}</strong>.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <Label htmlFor="delete-supplier-password">Password</Label>
              <Input
                id="delete-supplier-password"
                type="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value)
                  setError('')
                }}
                placeholder="Inserisci la password"
                className="mt-1.5"
                disabled={isDeleting}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !isDeleting) {
                    handleDelete()
                  }
                }}
              />
              {error && (
                <p className="text-sm text-destructive mt-2">{error}</p>
              )}
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setStep('confirm')}
                disabled={isDeleting}
              >
                Indietro
              </Button>
              <Button
                variant="destructive"
                onClick={handleDelete}
                disabled={isDeleting}
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Eliminazione...
                  </>
                ) : (
                  'Elimina Fornitore'
                )}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

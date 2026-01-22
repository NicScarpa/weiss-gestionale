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
import { ScrollArea } from '@/components/ui/scroll-area'
import { AlertTriangle, Lock, Loader2, Trash2 } from 'lucide-react'

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
  const plurale = count === 1 ? '' : 'i'

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent showCloseButton={!isDeleting} className="max-w-md">
        {step === 'confirm' ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-5 w-5" />
                Elimina {count} Fornitore{plurale}
              </DialogTitle>
              <DialogDescription className="pt-2">
                Stai per eliminare {count === 1 ? 'il seguente fornitore' : `i seguenti ${count} fornitori`}:
              </DialogDescription>
            </DialogHeader>

            <ScrollArea className="max-h-[200px] pr-4">
              <div className="space-y-2">
                {suppliers.map((supplier) => (
                  <div
                    key={supplier.id}
                    className="flex items-center gap-2 p-2 rounded bg-muted/50"
                  >
                    <Trash2 className="h-4 w-4 text-destructive shrink-0" />
                    <div className="min-w-0">
                      <p className="font-medium truncate">{supplier.name}</p>
                      {supplier.vatNumber && (
                        <p className="text-xs text-muted-foreground font-mono">
                          P.IVA: {supplier.vatNumber}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>

            <p className="text-sm text-muted-foreground">
              {count === 1 ? 'Il fornitore verrà disattivato' : 'I fornitori verranno disattivati'}.
              Tutti i movimenti esistenti (fatture, registrazioni banca, prima nota)
              rimarranno collegati per storico.
            </p>

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
                Inserisci la tua password per confermare l&apos;eliminazione di{' '}
                <strong>{count} fornitore{plurale}</strong>.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <Label htmlFor="bulk-delete-password">Password</Label>
              <Input
                id="bulk-delete-password"
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
                  `Elimina ${count} Fornitore${plurale}`
                )}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

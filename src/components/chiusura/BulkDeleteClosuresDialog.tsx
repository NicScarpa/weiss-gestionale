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

interface BulkDeleteClosuresDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  selectedIds: string[]
  hasValidated: boolean
  onDeleted: () => void
}

export function BulkDeleteClosuresDialog({
  open,
  onOpenChange,
  selectedIds,
  hasValidated,
  onDeleted,
}: BulkDeleteClosuresDialogProps) {
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

      // Step 2: Bulk delete
      const deleteRes = await fetch('/api/chiusure/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedIds }),
      })

      const deleteData = await deleteRes.json()

      if (!deleteRes.ok) {
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

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent showCloseButton={!isDeleting}>
        {step === 'confirm' ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-5 w-5" />
                Elimina {selectedIds.length} Chiusure
              </DialogTitle>
              <DialogDescription className="pt-2">
                Sei sicuro di voler eliminare <strong>{selectedIds.length}</strong> chiusure selezionate?
                {hasValidated && (
                  <span className="block mt-2 text-destructive font-medium">
                    Attenzione: alcune chiusure sono già state validate.
                    L&apos;eliminazione rimuoverà anche le scritture contabili generate.
                  </span>
                )}
                <span className="block mt-2">
                  Questa azione è <strong>irreversibile</strong>.
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
                Inserisci la tua password per confermare l&apos;eliminazione di{' '}
                <strong>{selectedIds.length}</strong> chiusure.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <Label htmlFor="bulk-password">Password</Label>
              <Input
                id="bulk-password"
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
                  'Elimina Definitivamente'
                )}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

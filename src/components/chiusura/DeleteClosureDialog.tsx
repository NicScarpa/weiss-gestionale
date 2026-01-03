'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AlertTriangle, Lock, Loader2 } from 'lucide-react'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'

interface DeleteClosureDialogProps {
  closureId: string
  closureDate: Date | string
  closureStatus: string
  onDeleted: () => void
  trigger: React.ReactNode
}

export function DeleteClosureDialog({
  closureId,
  closureDate,
  closureStatus,
  onDeleted,
  trigger,
}: DeleteClosureDialogProps) {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<'confirm' | 'password'>('confirm')
  const [password, setPassword] = useState('')
  const [isDeleting, setIsDeleting] = useState(false)
  const [error, setError] = useState('')

  const formattedDate = format(
    typeof closureDate === 'string' ? new Date(closureDate) : closureDate,
    'dd MMMM yyyy',
    { locale: it }
  )

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen)
    if (!newOpen) {
      // Reset state when dialog closes
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

      // Step 2: Delete closure
      const deleteRes = await fetch(`/api/chiusure/${closureId}`, {
        method: 'DELETE',
      })

      if (!deleteRes.ok) {
        const deleteData = await deleteRes.json()
        setError(deleteData.error || 'Errore durante l\'eliminazione')
        setIsDeleting(false)
        return
      }

      // Success
      setOpen(false)
      onDeleted()
    } catch {
      setError('Errore di connessione')
      setIsDeleting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent showCloseButton={!isDeleting}>
        {step === 'confirm' ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-5 w-5" />
                Elimina Chiusura
              </DialogTitle>
              <DialogDescription className="pt-2">
                Sei sicuro di voler eliminare la chiusura del{' '}
                <strong>{formattedDate}</strong>?
                {closureStatus === 'VALIDATED' && (
                  <span className="block mt-2 text-destructive font-medium">
                    Attenzione: questa chiusura è già stata validata.
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
                onClick={() => setOpen(false)}
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
                Inserisci la tua password per confermare l&apos;eliminazione della
                chiusura del <strong>{formattedDate}</strong>.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
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

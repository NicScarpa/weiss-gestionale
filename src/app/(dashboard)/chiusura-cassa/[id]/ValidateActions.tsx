'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { toast } from 'sonner'

interface ValidateActionsProps {
  closureId: string
}

export function ValidateActions({ closureId }: ValidateActionsProps) {
  const router = useRouter()
  const [isApproving, setIsApproving] = useState(false)
  const [isRejecting, setIsRejecting] = useState(false)
  const [rejectionNotes, setRejectionNotes] = useState('')
  const [showRejectDialog, setShowRejectDialog] = useState(false)

  const handleApprove = async () => {
    setIsApproving(true)
    try {
      const res = await fetch(`/api/chiusure/${closureId}/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve' }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Errore nella validazione')
      }

      toast.success('Chiusura validata con successo')
      router.refresh()
    } catch (error: any) {
      toast.error(error.message)
    } finally {
      setIsApproving(false)
    }
  }

  const handleReject = async () => {
    if (!rejectionNotes.trim()) {
      toast.error('Inserisci un motivo per il rifiuto')
      return
    }

    setIsRejecting(true)
    try {
      const res = await fetch(`/api/chiusure/${closureId}/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'reject',
          rejectionNotes: rejectionNotes.trim(),
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Errore nel rifiuto')
      }

      toast.success('Chiusura rifiutata e riportata in bozza')
      setShowRejectDialog(false)
      router.refresh()
    } catch (error: any) {
      toast.error(error.message)
    } finally {
      setIsRejecting(false)
    }
  }

  return (
    <Card className="border-primary">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Validazione Richiesta</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col sm:flex-row gap-3">
          <Button
            onClick={handleApprove}
            disabled={isApproving || isRejecting}
            className="gap-2 bg-green-600 hover:bg-green-700"
          >
            <CheckCircle className="h-4 w-4" />
            {isApproving ? 'Validazione...' : 'Approva Chiusura'}
          </Button>

          <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
            <DialogTrigger asChild>
              <Button
                variant="destructive"
                disabled={isApproving || isRejecting}
                className="gap-2"
              >
                <XCircle className="h-4 w-4" />
                Rifiuta
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Rifiuta Chiusura</DialogTitle>
                <DialogDescription>
                  La chiusura verrà riportata in bozza e l&apos;operatore dovrà
                  correggerla.
                </DialogDescription>
              </DialogHeader>
              <div className="py-4">
                <Textarea
                  value={rejectionNotes}
                  onChange={(e) => setRejectionNotes(e.target.value)}
                  placeholder="Motivo del rifiuto..."
                  rows={3}
                />
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setShowRejectDialog(false)}
                >
                  Annulla
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleReject}
                  disabled={isRejecting}
                >
                  {isRejecting ? 'Rifiuto...' : 'Conferma Rifiuto'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardContent>
    </Card>
  )
}

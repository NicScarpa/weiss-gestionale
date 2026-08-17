'use client'

import * as React from 'react'
import { toast } from 'sonner'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import type { RigaEstrattoConto } from '@/types/reconciliation'

interface Props {
  riga: RigaEstrattoConto | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onFatto: () => void
}

/**
 * Scollega: la conferma dice cosa succede davvero, che dipende da chi ha
 * creato la scrittura (spec, «promuoviRigaBancaria»): se la promozione, viene
 * ritirata con le sue riconciliazioni; se esisteva già, la riga si slega e
 * basta.
 */
export function ScollegaDialog({ riga, open, onOpenChange, onFatto }: Props) {
  const [inCorso, setInCorso] = React.useState(false)
  const nostra = !!riga?.origineScrittura

  const conferma = async () => {
    if (!riga) return
    setInCorso(true)
    try {
      const r = await fetch(`/api/bank-transactions/${riga.id}/scollega`, { method: 'POST' })
      const json = (await r.json().catch(() => ({}))) as { error?: string; scritturaRitirata?: boolean }
      if (!r.ok) throw new Error(json.error || 'Scollegamento non riuscito')
      toast.success(json.scritturaRitirata ? 'Movimento scollegato: la scrittura è stata ritirata' : 'Movimento scollegato')
      onFatto()
      onOpenChange(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Errore sconosciuto')
    } finally {
      setInCorso(false)
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Scollegare il movimento?</AlertDialogTitle>
          <AlertDialogDescription>
            {nostra
              ? 'La scrittura di prima nota creata da questa riga verrà ritirata e le scadenze collegate torneranno aperte. Il movimento bancario resta com\'è, da lavorare di nuovo.'
              : 'La riga verrà slegata dalla scrittura, che resta in prima nota con le sue riconciliazioni.'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={inCorso}>Annulla</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              // La conferma resta aperta finché la rotta non risponde: si chiude
              // da `conferma`, non dal clic.
              e.preventDefault()
              void conferma()
            }}
            disabled={inCorso}
          >
            {inCorso ? 'Scollegamento…' : 'Scollega'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

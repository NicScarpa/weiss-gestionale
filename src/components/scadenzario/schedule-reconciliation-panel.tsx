'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { LinkIcon, XIcon, Undo2Icon, CheckCircle2Icon } from 'lucide-react'

interface Props {
  scheduleId: string
  /** Chiamato dopo ogni operazione, per ricaricare la scadenza nel padre */
  onChange?: () => void
}

interface Riconciliazione {
  id: string
  status: 'VERIFIED' | 'REJECTED'
  source: string
  amount: string
  confidence: string | null
  createdAt: string
  journalEntry: {
    id: string
    date: string
    description: string
    debitAmount: string | null
    creditAmount: string | null
    registerType: string
  }
}

interface Candidato {
  journalEntryId: string
  confidence: number
  description: string
  date: string
  amount: number
}

const SOURCE_LABELS: Record<string, string> = {
  MANUAL: 'Manuale',
  AUTOMATIC: 'Automatica',
  PROPOSAL: 'Proposta',
  RULE: 'Da regola',
}

function formatCurrency(value: number | string) {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(
    Number(value)
  )
}

/**
 * Collega i movimenti di prima nota a una scadenza.
 *
 * È il punto in cui il ciclo si chiude: la scadenza dice cosa andava pagato,
 * il movimento testimonia che il denaro si è mosso. Riconciliarli salda la
 * scadenza e, se era l'ultima rata, chiude anche la fattura.
 */
export function ScheduleReconciliationPanel({ scheduleId, onChange }: Props) {
  const queryClient = useQueryClient()
  const [pending, setPending] = useState<string | null>(null)

  const queryKey = ['schedule-reconciliations', scheduleId]

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const res = await fetch(`/api/scadenzario/${scheduleId}/riconciliazioni`)
      if (!res.ok) throw new Error('Errore nel caricamento')
      return res.json() as Promise<{ riconciliazioni: Riconciliazione[]; candidati: Candidato[] }>
    },
  })

  const collega = useMutation({
    mutationFn: async ({ journalEntryId, confidence, reject }: { journalEntryId: string; confidence?: number; reject?: boolean }) => {
      const res = await fetch(`/api/scadenzario/${scheduleId}/riconciliazioni`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ journalEntryId, confidence, reject }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Errore nella riconciliazione')
      return json
    },
    onSuccess: (result) => {
      toast.success(result.message)
      queryClient.invalidateQueries({ queryKey })
      onChange?.()
    },
    onError: (e: Error) => toast.error(e.message),
    onSettled: () => setPending(null),
  })

  const annulla = useMutation({
    mutationFn: async (reconciliationId: string) => {
      const res = await fetch(
        `/api/scadenzario/${scheduleId}/riconciliazioni/${reconciliationId}`,
        { method: 'DELETE' }
      )
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Errore nell\'annullamento')
      return json
    },
    onSuccess: (result) => {
      toast.success(result.message)
      queryClient.invalidateQueries({ queryKey })
      onChange?.()
    },
    onError: (e: Error) => toast.error(e.message),
    onSettled: () => setPending(null),
  })

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="py-4">
          <CardTitle className="text-base">Riconciliazione</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    )
  }

  const collegate = data?.riconciliazioni.filter((r) => r.status === 'VERIFIED') ?? []
  const scartate = data?.riconciliazioni.filter((r) => r.status === 'REJECTED') ?? []
  const candidati = data?.candidati ?? []

  return (
    <Card>
      <CardHeader className="py-4">
        <CardTitle className="text-base">Riconciliazione</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Movimenti collegati */}
        <div className="space-y-2">
          <h4 className="text-sm font-medium">Movimenti collegati</h4>
          {collegate.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nessun movimento collegato a questa scadenza.
            </p>
          ) : (
            collegate.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between rounded-lg border p-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <CheckCircle2Icon className="h-4 w-4 text-green-600 shrink-0" />
                    <span className="font-medium truncate">{r.journalEntry.description}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {format(new Date(r.journalEntry.date), 'd MMMM yyyy', { locale: it })} ·{' '}
                    {formatCurrency(r.amount)} · {SOURCE_LABELS[r.source] ?? r.source}
                    {r.confidence && ` · affinità ${Math.round(Number(r.confidence) * 100)}%`}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={pending === r.id}
                  onClick={() => {
                    setPending(r.id)
                    annulla.mutate(r.id)
                  }}
                >
                  <Undo2Icon className="h-4 w-4 mr-1" />
                  Annulla
                </Button>
              </div>
            ))
          )}
        </div>

        {/* Movimenti proposti */}
        {candidati.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Movimenti che potrebbero saldarla</h4>
            {candidati.map((c) => (
              <div
                key={c.journalEntryId}
                className="flex items-center justify-between rounded-lg border border-dashed p-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium truncate">{c.description}</span>
                    <Badge variant="secondary" className="text-[10px] shrink-0">
                      {Math.round(c.confidence * 100)}%
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {format(new Date(c.date), 'd MMMM yyyy', { locale: it })} ·{' '}
                    {formatCurrency(c.amount)}
                  </p>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button
                    size="sm"
                    disabled={pending === c.journalEntryId}
                    onClick={() => {
                      setPending(c.journalEntryId)
                      collega.mutate({
                        journalEntryId: c.journalEntryId,
                        confidence: c.confidence,
                      })
                    }}
                  >
                    <LinkIcon className="h-4 w-4 mr-1" />
                    Collega
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={pending === c.journalEntryId}
                    onClick={() => {
                      setPending(c.journalEntryId)
                      collega.mutate({ journalEntryId: c.journalEntryId, reject: true })
                    }}
                  >
                    <XIcon className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {collegate.length === 0 && candidati.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Nessun movimento compatibile trovato. Registra il movimento in prima nota:
            comparirà qui fra le proposte.
          </p>
        )}

        {scartate.length > 0 && (
          <p className="text-xs text-muted-foreground">
            {scartate.length}{' '}
            {scartate.length === 1 ? 'proposta scartata' : 'proposte scartate'} in precedenza,
            non verranno riproposte.
          </p>
        )}
      </CardContent>
    </Card>
  )
}

'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ExternalLinkIcon, Undo2Icon, LinkIcon } from 'lucide-react'
import { formatCurrency } from '@/lib/formatters'
import type { JournalEntry } from '@/types/prima-nota'

interface RiconciliazioneMovimento {
  id: string
  scheduleId: string
  importo: number
  source: string
  createdAt: string
  altraRigaDelTrasferimento: boolean
  schedule: {
    id: string
    descrizione: string
    dataScadenza: string
    importoTotale: number
    stato: string
    tipo: string
    numeroDocumento: string | null
    controparteNome: string | null
    eliminata: boolean
  }
}

const ETICHETTE_ORIGINE: Record<string, string> = {
  MANUAL: 'Manuale',
  AUTOMATIC: 'Automatica',
  PROPOSAL: 'Proposta accettata',
  RULE: 'Da regola',
}

interface Props {
  /** Il movimento di cui si guardano gli agganci; null tiene chiuso il dialog */
  entry: JournalEntry | null
  onOpenChange: (open: boolean) => void
  /** Chiamato dopo ogni annullamento, per ricaricare la lista dei movimenti */
  onAnnullata: () => void
}

/**
 * Le scadenze saldate da un movimento, con lo sgancio a portata di mano.
 *
 * Esiste perché il rifiuto della cancellazione («annulla prima le
 * riconciliazioni») indicava un'azione che dal lato movimento non si poteva
 * compiere: il pulsante viveva solo nella pagina della singola scadenza, e per
 * arrivarci bisognava già sapere quale fosse.
 */
export function RiconciliazioniMovimentoDialog({ entry, onOpenChange, onAnnullata }: Props) {
  const [inCorso, setInCorso] = useState<string | null>(null)

  const { data, isLoading, refetch } = useQuery<{ riconciliazioni: RiconciliazioneMovimento[] }>({
    queryKey: ['riconciliazioni-movimento', entry?.id],
    enabled: !!entry,
    queryFn: async () => {
      const res = await fetch(`/api/prima-nota/${entry!.id}/riconciliazioni`)
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Errore nel recupero delle riconciliazioni')
      }
      return res.json()
    },
  })

  const annulla = async (r: RiconciliazioneMovimento) => {
    setInCorso(r.id)
    try {
      const res = await fetch(
        `/api/scadenzario/${r.scheduleId}/riconciliazioni/${r.id}`,
        { method: 'DELETE' }
      )
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Errore nell\'annullamento')
      }
      toast.success('Riconciliazione annullata')
      await refetch()
      onAnnullata()
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Errore sconosciuto')
    } finally {
      setInCorso(null)
    }
  }

  const riconciliazioni = data?.riconciliazioni ?? []

  return (
    <Dialog open={!!entry} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Scadenze collegate</DialogTitle>
          <DialogDescription>
            {entry?.description
              ? `Movimento «${entry.description}»`
              : 'Movimento di prima nota'}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : riconciliazioni.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">
            Nessuna scadenza collegata: il movimento si può eliminare.
          </p>
        ) : (
          <div className="space-y-2">
            {riconciliazioni.map((r) => (
              <div key={r.id} className="rounded-lg border p-3 space-y-2">
                <div className="flex items-start gap-2">
                  <LinkIcon className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm truncate">
                      {r.schedule.descrizione}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      scadenza{' '}
                      {format(new Date(r.schedule.dataScadenza), 'd MMMM yyyy', { locale: it })} ·{' '}
                      {formatCurrency(r.importo)} imputati
                      {r.schedule.numeroDocumento && ` · doc. ${r.schedule.numeroDocumento}`}
                      {ETICHETTE_ORIGINE[r.source] && ` · ${ETICHETTE_ORIGINE[r.source]}`}
                    </p>
                    {r.altraRigaDelTrasferimento && (
                      <p className="text-xs text-amber-600 mt-1">
                        L&apos;aggancio è sull&apos;altra riga del trasferimento, ma trattiene
                        anche questa.
                      </p>
                    )}
                    {r.schedule.eliminata && (
                      <p className="text-xs text-amber-600 mt-1">
                        La scadenza è stata eliminata: annullare l&apos;aggancio libera comunque
                        il movimento.
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2">
                  <Button variant="ghost" size="sm" asChild>
                    <Link href={`/scadenzario/${r.scheduleId}`}>
                      <ExternalLinkIcon className="h-4 w-4 mr-1" />
                      Apri scadenza
                    </Link>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={inCorso === r.id}
                    onClick={() => annulla(r)}
                  >
                    <Undo2Icon className="h-4 w-4 mr-1" />
                    Annulla riconciliazione
                  </Button>
                </div>
              </div>
            ))}
            <p className="text-xs text-muted-foreground pt-1">
              Annullare l&apos;aggancio riapre la scadenza e cancella il pagamento che la
              riconciliazione aveva generato. Il movimento resta dov&apos;è.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

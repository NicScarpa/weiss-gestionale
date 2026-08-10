'use client'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { formatCurrency } from '@/lib/formatters'
import { Plus, Trash2 } from 'lucide-react'
import { ConfidenceBadge } from './ConfidenceBadge'
import {
  CONFIDENZE,
  CONFIDENCE_LABELS,
  ConfidenceLevel,
  FlowType,
  TIPI_RIGA,
  giornoItaliano,
  type DettaglioPrevisione,
} from './previsioni'

/**
 * Il dettaglio di una previsione: le sue righe e i totali che ne derivano.
 *
 * Il saldo progressivo lo calcola la route (`GET /api/cashflow/forecasts/[id]`)
 * a partire dal saldo di partenza della previsione: qui non si somma nulla, si
 * mostra quello che il server ha già calcolato.
 */

interface ForecastDetailProps {
  forecastId: string
}

async function leggiDettaglio(id: string): Promise<DettaglioPrevisione> {
  const risposta = await fetch(`/api/cashflow/forecasts/${id}`)
  if (!risposta.ok) throw new Error('Impossibile caricare la previsione')
  return risposta.json()
}

export function ForecastDetail({ forecastId }: ForecastDetailProps) {
  const queryClient = useQueryClient()
  const [data, setData] = useState('')
  const [tipo, setTipo] = useState<FlowType>(FlowType.USCITA)
  const [importo, setImporto] = useState('')
  const [descrizione, setDescrizione] = useState('')
  const [confidenza, setConfidenza] = useState<ConfidenceLevel>(ConfidenceLevel.MEDIA)

  const { data: dettaglio, isLoading } = useQuery({
    queryKey: ['cashflow', 'forecast', forecastId],
    queryFn: () => leggiDettaglio(forecastId),
  })

  function ricarica() {
    queryClient.invalidateQueries({ queryKey: ['cashflow', 'forecast', forecastId] })
    queryClient.invalidateQueries({ queryKey: ['cashflow', 'forecasts'] })
  }

  const aggiungiRiga = useMutation({
    mutationFn: async () => {
      const risposta = await fetch(`/api/cashflow/forecasts/${forecastId}/lines`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          data,
          tipo,
          importo: Number(importo.replace(',', '.')),
          descrizione: descrizione.trim() || undefined,
          confidenza,
        }),
      })
      if (!risposta.ok) {
        const dettaglioErrore = await risposta.json().catch(() => null)
        throw new Error(dettaglioErrore?.error || 'Riga non aggiunta')
      }
      return risposta.json()
    },
    onSuccess: () => {
      toast.success('Riga aggiunta')
      setImporto('')
      setDescrizione('')
      ricarica()
    },
    onError: (errore: Error) => toast.error(errore.message),
  })

  const eliminaRiga = useMutation({
    mutationFn: async (lineId: string) => {
      const risposta = await fetch(`/api/cashflow/forecasts/${forecastId}/lines/${lineId}`, {
        method: 'DELETE',
      })
      if (!risposta.ok) throw new Error('Riga non eliminata')
      return risposta.json()
    },
    onSuccess: () => {
      toast.success('Riga eliminata')
      ricarica()
    },
    onError: (errore: Error) => toast.error(errore.message),
  })

  function inviaRiga(evento: React.FormEvent) {
    evento.preventDefault()
    const valore = Number(importo.replace(',', '.'))
    if (!data) {
      toast.error('Indica la data della riga')
      return
    }
    if (!Number.isFinite(valore) || valore <= 0) {
      toast.error("L'importo deve essere maggiore di zero")
      return
    }
    aggiungiRiga.mutate()
  }

  if (isLoading || !dettaglio) {
    return <Skeleton className="h-40 rounded-lg" />
  }

  const { summary, lines } = dettaglio

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { titolo: 'Partenza', valore: Number(dettaglio.saldoIniziale) },
          { titolo: 'Entrate', valore: summary.totaleEntrate, colore: 'text-green-600' },
          { titolo: 'Uscite', valore: summary.totaleUscite, colore: 'text-red-600' },
          { titolo: 'Saldo finale', valore: summary.saldoFinale },
        ].map((voce) => (
          <div key={voce.titolo} className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">{voce.titolo}</p>
            <p className={`font-mono text-lg font-semibold break-words ${voce.colore ?? ''}`}>
              {formatCurrency(voce.valore)}
            </p>
          </div>
        ))}
      </div>

      {summary.saldoMinimo < 0 && (
        <p className="rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-300">
          Con queste righe il saldo scende fino a {formatCurrency(summary.saldoMinimo)}: la
          cassa non copre tutte le uscite previste.
        </p>
      )}

      <Card>
        <CardContent className="py-4">
          <form onSubmit={inviaRiga} className="space-y-3">
            <p className="text-sm font-medium">Aggiungi una voce</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <div className="space-y-1">
                <Label htmlFor={`data-${forecastId}`} className="text-xs">
                  Data
                </Label>
                <Input
                  id={`data-${forecastId}`}
                  type="date"
                  value={data}
                  min={String(dettaglio.dataInizio).slice(0, 10)}
                  max={String(dettaglio.dataFine).slice(0, 10)}
                  onChange={(e) => setData(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`tipo-${forecastId}`} className="text-xs">
                  Tipo
                </Label>
                <Select value={tipo} onValueChange={(v) => setTipo(v as FlowType)}>
                  <SelectTrigger id={`tipo-${forecastId}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIPI_RIGA.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t === FlowType.ENTRATA ? 'Entrata' : 'Uscita'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor={`importo-${forecastId}`} className="text-xs">
                  Importo
                </Label>
                <Input
                  id={`importo-${forecastId}`}
                  inputMode="decimal"
                  value={importo}
                  onChange={(e) => setImporto(e.target.value)}
                  placeholder="500.00"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`descrizione-${forecastId}`} className="text-xs">
                  Descrizione
                </Label>
                <Input
                  id={`descrizione-${forecastId}`}
                  value={descrizione}
                  onChange={(e) => setDescrizione(e.target.value)}
                  placeholder="Saldo fornitore"
                  autoComplete="off"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`confidenza-${forecastId}`} className="text-xs">
                  Confidenza
                </Label>
                <Select value={confidenza} onValueChange={(v) => setConfidenza(v as ConfidenceLevel)}>
                  <SelectTrigger id={`confidenza-${forecastId}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CONFIDENZE.map((c) => (
                      <SelectItem key={c} value={c}>
                        {CONFIDENCE_LABELS[c]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button type="submit" size="sm" className="gap-2" disabled={aggiungiRiga.isPending}>
              <Plus className="h-4 w-4" />
              {aggiungiRiga.isPending ? 'Aggiunta…' : 'Aggiungi'}
            </Button>
          </form>
        </CardContent>
      </Card>

      {lines.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          Nessuna voce: la previsione resta ferma al saldo di partenza.
        </p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {lines.map((riga) => (
            <li key={riga.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-mono text-muted-foreground">
                    {giornoItaliano(riga.data)}
                  </span>
                  <span className="break-words">{riga.descrizione || '—'}</span>
                  {riga.confidenza !== ConfidenceLevel.CERTA && (
                    <ConfidenceBadge level={riga.confidenza} />
                  )}
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  saldo dopo questa voce: {formatCurrency(riga.saldoProgressivo)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`font-mono text-sm font-semibold ${
                    riga.tipo === FlowType.ENTRATA ? 'text-green-600' : 'text-red-600'
                  }`}
                >
                  {riga.tipo === FlowType.ENTRATA ? '+' : '-'}
                  {formatCurrency(Number(riga.importo))}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Elimina riga"
                  onClick={() => eliminaRiga.mutate(riga.id)}
                  disabled={eliminaRiga.isPending}
                >
                  <Trash2 className="h-4 w-4 text-red-600" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

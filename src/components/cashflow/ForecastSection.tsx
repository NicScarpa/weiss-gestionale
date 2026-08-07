'use client'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
import { formatCurrency } from '@/lib/constants'
import { ChevronDown, ChevronRight, LineChart, Pencil, Plus, Trash2 } from 'lucide-react'
import { ForecastDialog, type DatiPrevisione } from './ForecastDialog'
import { ForecastDetail } from './ForecastDetail'
import {
  FORECAST_STATUS_LABELS,
  FORECAST_TYPE_LABELS,
  ForecastStatus,
  STATI_PREVISIONE,
  giornoItaliano,
  type Previsione,
} from './previsioni'

/**
 * Le previsioni di cassa salvate.
 *
 * Cinque route CRUD stavano nel codice da gennaio senza un solo consumatore:
 * si potevano creare previsioni solo con `curl`. Questa sezione è la loro
 * interfaccia, ed è dentro la pagina Cash Flow perché è lì che si guardano i
 * numeri a cui si riferiscono.
 */

interface ForecastSectionProps {
  /** Liquidità di oggi, da `/api/cashflow/summary`: la partenza predefinita. */
  saldoAttuale?: number
}

const COLORE_STATO: Record<ForecastStatus, string> = {
  [ForecastStatus.BOZZA]: 'bg-slate-100 text-slate-700',
  [ForecastStatus.ATTIVA]: 'bg-green-100 text-green-700',
  [ForecastStatus.ARCHIVIATA]: 'bg-amber-100 text-amber-700',
}

async function chiedi(url: string, method: string, body?: unknown) {
  const risposta = await fetch(url, {
    method,
    ...(body ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}),
  })
  if (!risposta.ok) {
    const dettaglio = await risposta.json().catch(() => null)
    throw new Error(dettaglio?.error || 'Operazione non riuscita')
  }
  return risposta.json()
}

export function ForecastSection({ saldoAttuale }: ForecastSectionProps) {
  const queryClient = useQueryClient()
  const [dialogAperto, setDialogAperto] = useState(false)
  const [inModifica, setInModifica] = useState<Previsione | null>(null)
  const [daEliminare, setDaEliminare] = useState<Previsione | null>(null)
  const [aperta, setAperta] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['cashflow', 'forecasts'],
    queryFn: async (): Promise<{ data: Previsione[] }> => {
      const risposta = await fetch('/api/cashflow/forecasts')
      if (!risposta.ok) throw new Error('Impossibile caricare le previsioni')
      return risposta.json()
    },
  })

  const previsioni = data?.data ?? []

  function ricarica() {
    queryClient.invalidateQueries({ queryKey: ['cashflow', 'forecasts'] })
  }

  const salva = useMutation({
    mutationFn: (dati: DatiPrevisione) =>
      inModifica
        ? chiedi(`/api/cashflow/forecasts/${inModifica.id}`, 'PATCH', dati)
        : chiedi('/api/cashflow/forecasts', 'POST', dati),
    onSuccess: (creata: Previsione) => {
      toast.success(inModifica ? 'Previsione aggiornata' : 'Previsione creata')
      if (!inModifica && creata?.id) setAperta(creata.id)
      ricarica()
    },
  })

  const cambiaStato = useMutation({
    mutationFn: ({ id, stato }: { id: string; stato: ForecastStatus }) =>
      chiedi(`/api/cashflow/forecasts/${id}`, 'PATCH', { stato }),
    onSuccess: () => {
      toast.success('Stato aggiornato')
      ricarica()
    },
    onError: (errore: Error) => toast.error(errore.message),
  })

  const elimina = useMutation({
    mutationFn: (previsione: Previsione) =>
      chiedi(`/api/cashflow/forecasts/${previsione.id}`, 'DELETE'),
    onSuccess: (_, previsione) => {
      toast.success('Previsione eliminata')
      if (aperta === previsione.id) setAperta(null)
      setDaEliminare(null)
      ricarica()
    },
    onError: (errore: Error) => {
      toast.error(errore.message)
      setDaEliminare(null)
    },
  })

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2">
            <LineChart className="h-5 w-5" />
            Previsioni salvate
          </CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Scenari costruiti a mano: entrate e uscite che ti aspetti in un periodo, con il
            saldo che ne risulta.
          </p>
        </div>
        <Button
          onClick={() => {
            setInModifica(null)
            setDialogAperto(true)
          }}
          className="gap-2"
        >
          <Plus className="h-4 w-4" />
          Nuova previsione
        </Button>
      </CardHeader>

      <CardContent className="space-y-3">
        {isLoading ? (
          <Skeleton className="h-24 rounded-lg" />
        ) : previsioni.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Nessuna previsione salvata. Creane una per confrontare scenari diversi con il saldo
            reale mostrato qui sopra.
          </p>
        ) : (
          previsioni.map((previsione) => {
            const espansa = aperta === previsione.id
            return (
              <div key={previsione.id} className="rounded-lg border">
                <div className="flex flex-wrap items-center justify-between gap-3 p-3">
                  <button
                    type="button"
                    onClick={() => setAperta(espansa ? null : previsione.id)}
                    aria-expanded={espansa}
                    className="flex min-w-0 flex-1 items-start gap-2 text-left"
                  >
                    {espansa ? (
                      <ChevronDown className="mt-0.5 h-4 w-4 shrink-0" />
                    ) : (
                      <ChevronRight className="mt-0.5 h-4 w-4 shrink-0" />
                    )}
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-medium break-words">{previsione.nome}</span>
                        <Badge className={COLORE_STATO[previsione.stato]} variant="secondary">
                          {FORECAST_STATUS_LABELS[previsione.stato]}
                        </Badge>
                        <Badge variant="outline">{FORECAST_TYPE_LABELS[previsione.tipo]}</Badge>
                      </span>
                      <span className="mt-1 block text-sm text-muted-foreground">
                        {giornoItaliano(previsione.dataInizio)} –{' '}
                        {giornoItaliano(previsione.dataFine)} · parte da{' '}
                        {formatCurrency(Number(previsione.saldoIniziale))}
                        {previsione._count ? ` · ${previsione._count.lines} voci` : ''}
                      </span>
                    </span>
                  </button>

                  <div className="flex items-center gap-1">
                    <Select
                      value={previsione.stato}
                      onValueChange={(stato) =>
                        cambiaStato.mutate({ id: previsione.id, stato: stato as ForecastStatus })
                      }
                    >
                      <SelectTrigger
                        className="h-8 w-[130px]"
                        aria-label={`Stato di ${previsione.nome}`}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STATI_PREVISIONE.map((stato) => (
                          <SelectItem key={stato} value={stato}>
                            {FORECAST_STATUS_LABELS[stato]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Modifica ${previsione.nome}`}
                      onClick={() => {
                        setInModifica(previsione)
                        setDialogAperto(true)
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Elimina ${previsione.nome}`}
                      onClick={() => setDaEliminare(previsione)}
                    >
                      <Trash2 className="h-4 w-4 text-red-600" />
                    </Button>
                  </div>
                </div>

                {espansa && (
                  <div className="border-t p-3">
                    <ForecastDetail forecastId={previsione.id} />
                  </div>
                )}
              </div>
            )
          })
        )}
      </CardContent>

      <ForecastDialog
        open={dialogAperto}
        onOpenChange={setDialogAperto}
        previsione={inModifica}
        saldoAttuale={saldoAttuale}
        onSubmit={async (dati) => {
          await salva.mutateAsync(dati)
        }}
      />

      <AlertDialog
        open={daEliminare !== null}
        onOpenChange={(aperto) => !aperto && setDaEliminare(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare «{daEliminare?.nome}»?</AlertDialogTitle>
            <AlertDialogDescription>
              La previsione e le sue voci spariscono dall&apos;elenco. Una previsione in stato
              «Attiva» va prima archiviata.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => daEliminare && elimina.mutate(daEliminare)}
              className="bg-red-600 hover:bg-red-700"
            >
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}

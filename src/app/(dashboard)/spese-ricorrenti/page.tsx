'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
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
import { formatCurrency } from '@/lib/formatters'
import { ArrowRight, CalendarSync, Pencil, Plus, Trash2 } from 'lucide-react'
import {
  RecurringExpenseDialog,
  type DatiSpesa,
} from '@/components/recurring-expenses/RecurringExpenseDialog'
import {
  NOME_FREQUENZA,
  descriviRicorrenza,
  quotaMensile,
  type SpesaRicorrente,
} from '@/components/recurring-expenses/frequenza'

/**
 * Le spese ricorrenti: affitto, utenze, canoni, rate.
 *
 * Il CRUD dietro questa pagina esisteva da gennaio senza che una sola riga di
 * interfaccia lo chiamasse, mentre `/api/dashboard/forecast` leggeva già la
 * tabella per prevedere le uscite. Il cerchio era aperto da entrambi i lati: la
 * previsione dipendeva da dati che nessuno poteva inserire.
 */

interface RispostaSpese {
  data: SpesaRicorrente[]
  totals: { monthly: number; yearly: number }
}

async function leggiSpese(includeSospese: boolean): Promise<RispostaSpese> {
  const risposta = await fetch(
    `/api/recurring-expenses${includeSospese ? '?includeInactive=true' : ''}`
  )
  if (!risposta.ok) throw new Error('Impossibile caricare le spese ricorrenti')
  return risposta.json()
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

export default function SpeseRicorrentiPage() {
  const queryClient = useQueryClient()
  const [includeSospese, setIncludeSospese] = useState(false)
  const [dialogAperto, setDialogAperto] = useState(false)
  const [inModifica, setInModifica] = useState<SpesaRicorrente | null>(null)
  const [daEliminare, setDaEliminare] = useState<SpesaRicorrente | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['recurring-expenses', includeSospese],
    queryFn: () => leggiSpese(includeSospese),
  })

  const spese = data?.data ?? []
  const totali = data?.totals ?? { monthly: 0, yearly: 0 }

  function aggiorna() {
    queryClient.invalidateQueries({ queryKey: ['recurring-expenses'] })
    // La previsione di cassa si nutre di queste righe: lasciarla in cache
    // significherebbe mostrare un saldo futuro che ignora la spesa appena
    // inserita.
    queryClient.invalidateQueries({ queryKey: ['cashflow'] })
  }

  const salva = useMutation({
    mutationFn: async (dati: DatiSpesa) =>
      inModifica
        ? chiedi(`/api/recurring-expenses/${inModifica.id}`, 'PUT', dati)
        : chiedi('/api/recurring-expenses', 'POST', dati),
    onSuccess: () => {
      toast.success(inModifica ? 'Spesa aggiornata' : 'Spesa aggiunta alla previsione')
      aggiorna()
    },
  })

  const cambiaStato = useMutation({
    mutationFn: (spesa: SpesaRicorrente) =>
      chiedi(`/api/recurring-expenses/${spesa.id}`, 'PUT', { isActive: !spesa.isActive }),
    onSuccess: (_, spesa) => {
      toast.success(
        spesa.isActive
          ? 'Spesa sospesa: non peserà più sulla previsione'
          : 'Spesa riattivata'
      )
      aggiorna()
    },
    onError: (errore: Error) => toast.error(errore.message),
  })

  const elimina = useMutation({
    mutationFn: (spesa: SpesaRicorrente) =>
      chiedi(`/api/recurring-expenses/${spesa.id}`, 'DELETE'),
    onSuccess: () => {
      toast.success('Spesa eliminata')
      setDaEliminare(null)
      aggiorna()
    },
    onError: (errore: Error) => toast.error(errore.message),
  })

  function apriNuova() {
    setInModifica(null)
    setDialogAperto(true)
  }

  function apriModifica(spesa: SpesaRicorrente) {
    setInModifica(spesa)
    setDialogAperto(true)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Spese Ricorrenti</h1>
          <p className="text-muted-foreground">
            Le uscite che si ripetono: affitto, utenze, canoni, rate.
          </p>
        </div>
        <Button onClick={apriNuova} className="gap-2">
          <Plus className="h-4 w-4" />
          Nuova spesa
        </Button>
      </div>

      {/* Il legame con la previsione va detto, non lasciato intuire: è il
          motivo per cui questa pagina esiste. */}
      <Card className="border-blue-200 bg-blue-50/60 dark:border-blue-900 dark:bg-blue-950/20">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
          <p className="flex items-start gap-3 text-sm text-foreground">
            <CalendarSync className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" />
            <span>
              Ogni spesa attiva viene sottratta dal saldo previsto nel giorno in cui cadrà:
              è così che la <strong>previsione di cassa</strong> sa cosa deve ancora uscire.
            </span>
          </p>
          <Button variant="outline" asChild className="gap-2">
            <Link href="/cash-flow">
              Vedi la previsione
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Impegno mensile
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-mono text-2xl font-bold break-words">
              {formatCurrency(totali.monthly)}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Su un mese medio, considerando solo le spese attive
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Impegno annuo
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-mono text-2xl font-bold break-words">
              {formatCurrency(totali.yearly)}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {spese.filter((s) => s.isActive).length} spese attive
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center gap-2">
        <Switch
          id="mostra-sospese"
          checked={includeSospese}
          onCheckedChange={setIncludeSospese}
        />
        <Label htmlFor="mostra-sospese" className="text-sm font-normal">
          Mostra anche le spese sospese
        </Label>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-lg" />
          ))}
        </div>
      ) : spese.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <CalendarSync className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
            <p className="font-medium">Nessuna spesa ricorrente</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
              Finché questo elenco è vuoto, la previsione di cassa considera solo i movimenti
              già registrati: le uscite fisse che devono ancora arrivare non compaiono.
            </p>
            <Button onClick={apriNuova} className="mt-4 gap-2">
              <Plus className="h-4 w-4" />
              Aggiungi la prima
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {spese.map((spesa) => (
            <Card key={spesa.id} className={spesa.isActive ? undefined : 'opacity-60'}>
              <CardContent className="flex flex-wrap items-start justify-between gap-4 py-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium break-words">{spesa.name}</span>
                    <Badge variant="secondary">{NOME_FREQUENZA[spesa.frequency]}</Badge>
                    {spesa.category && <Badge variant="outline">{spesa.category}</Badge>}
                    {!spesa.isActive && <Badge variant="outline">Sospesa</Badge>}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {formatCurrency(Number(spesa.amount))} {descriviRicorrenza(spesa)} —{' '}
                    {formatCurrency(quotaMensile(spesa))} al mese
                  </p>
                  {spesa.description && (
                    <p className="mt-1 text-sm text-muted-foreground break-words">
                      {spesa.description}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => cambiaStato.mutate(spesa)}
                    disabled={cambiaStato.isPending}
                  >
                    {spesa.isActive ? 'Sospendi' : 'Riattiva'}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Modifica ${spesa.name}`}
                    onClick={() => apriModifica(spesa)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Elimina ${spesa.name}`}
                    onClick={() => setDaEliminare(spesa)}
                  >
                    <Trash2 className="h-4 w-4 text-red-600" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <RecurringExpenseDialog
        open={dialogAperto}
        onOpenChange={setDialogAperto}
        spesa={inModifica}
        onSubmit={async (dati) => {
          await salva.mutateAsync(dati)
        }}
      />

      <AlertDialog open={daEliminare !== null} onOpenChange={(aperto) => !aperto && setDaEliminare(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare «{daEliminare?.name}»?</AlertDialogTitle>
            <AlertDialogDescription>
              La spesa sparisce dall&apos;elenco e dalla previsione di cassa. Se ti serve solo
              metterla in pausa, usa «Sospendi»: resta qui e la puoi riattivare quando vuoi.
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
    </div>
  )
}

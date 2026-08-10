'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import { Brain, Search, Trash2, Check, X, Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { useDebounce } from '@/hooks/useDebounce'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

interface Memoria {
  id: string
  nomeNormalizzato: string
  codiceArticolo: string | null
  conferme: number
  aggiornataIl: string
  fornitore: { id: string; nome: string }
  conto: { id: string; codice: string; nome: string }
}

interface ElencoMemorie {
  memorie: Memoria[]
  totale: number
  pagina: number
  perPagina: number
}

interface Conto {
  id: string
  code: string
  name: string
}

async function fetchMemorie(q: string, pagina: number): Promise<ElencoMemorie> {
  const parametri = new URLSearchParams({ pagina: String(pagina) })
  if (q) parametri.set('q', q)
  const res = await fetch(`/api/memorie-fornitore?${parametri}`)
  if (!res.ok) {
    const dati = await res.json()
    throw new Error(dati.error || 'Errore nel caricamento delle memorie')
  }
  return res.json()
}

async function fetchConti(): Promise<Conto[]> {
  const res = await fetch('/api/accounts?type=COSTO')
  if (!res.ok) throw new Error('Errore caricamento conti')
  const dati = await res.json()
  return dati.accounts || []
}

/**
 * Cosa il sistema ha imparato a imputare da solo, per fornitore.
 *
 * Fino a ieri questa tabella non era mostrata da nessuna parte: una conferma
 * sbagliata tornava a ogni fattura di quel fornitore, scritta come confermata
 * — quindi verde e fuori da qualunque lista di controllo — e per correggerla
 * bisognava ritrovare una fattura con quella riga. Qui si vede cosa mappa a
 * cosa, quante volte è stato confermato, e si può correggere o dimenticare.
 */
export function MemorieFornitore() {
  const queryClient = useQueryClient()
  const [ricerca, setRicerca] = useState('')
  const ricercaDifferita = useDebounce(ricerca, 300)
  const [pagina, setPagina] = useState(1)
  const [daCancellare, setDaCancellare] = useState<Memoria | null>(null)
  const [inCorrezione, setInCorrezione] = useState<string | null>(null)
  const [contoScelto, setContoScelto] = useState('')

  const { data, isLoading, error } = useQuery({
    queryKey: ['memorie-fornitore', ricercaDifferita, pagina],
    queryFn: () => fetchMemorie(ricercaDifferita, pagina),
  })

  const { data: conti } = useQuery({ queryKey: ['accounts-cost'], queryFn: fetchConti })

  const invalida = () => queryClient.invalidateQueries({ queryKey: ['memorie-fornitore'] })

  const cancellazione = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/memorie-fornitore/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const dati = await res.json()
        throw new Error(dati.error || 'Errore nella cancellazione')
      }
    },
    onSuccess: () => {
      invalida()
      toast.success('Memoria dimenticata')
      setDaCancellare(null)
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const correzione = useMutation({
    mutationFn: async ({ id, accountId }: { id: string; accountId: string }) => {
      const res = await fetch(`/api/memorie-fornitore/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId }),
      })
      if (!res.ok) {
        const dati = await res.json()
        throw new Error(dati.error || 'Errore nella correzione')
      }
    },
    onSuccess: () => {
      invalida()
      toast.success('Memoria corretta')
      setInCorrezione(null)
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const apriCorrezione = (memoria: Memoria) => {
    setInCorrezione(memoria.id)
    setContoScelto(memoria.conto.id)
  }

  const pagineTotali = data ? Math.max(1, Math.ceil(data.totale / data.perPagina)) : 1

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Brain className="h-5 w-5" />
              Memorie fornitore
            </CardTitle>
            <CardDescription>
              Le imputazioni che il sistema riapplica da solo alle righe delle fatture. Sono nate
              dalle conferme date sulle fatture: se una è sbagliata, correggila o dimenticala qui.
            </CardDescription>
          </div>
          <div className="relative w-full sm:w-64 shrink-0">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Prodotto o fornitore..."
              className="pl-9"
              value={ricerca}
              onChange={(e) => {
                setRicerca(e.target.value)
                setPagina(1)
              }}
            />
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : error ? (
          <p className="py-8 text-center text-sm text-destructive">{(error as Error).message}</p>
        ) : !data || data.memorie.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            {ricercaDifferita
              ? 'Nessuna memoria corrisponde alla ricerca.'
              : 'Il sistema non ha ancora imparato niente. Le memorie nascono confermando le righe di una fattura.'}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fornitore</TableHead>
                    <TableHead>Prodotto</TableHead>
                    <TableHead>Codice</TableHead>
                    <TableHead>Conto</TableHead>
                    <TableHead className="text-right">Conferme</TableHead>
                    <TableHead>Aggiornata</TableHead>
                    <TableHead className="w-24" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.memorie.map((memoria) => (
                    <TableRow key={memoria.id}>
                      <TableCell className="font-medium">{memoria.fornitore.nome}</TableCell>
                      <TableCell>{memoria.nomeNormalizzato}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {memoria.codiceArticolo ?? '—'}
                      </TableCell>
                      <TableCell>
                        {inCorrezione === memoria.id ? (
                          <div className="flex items-center gap-2">
                            <Select value={contoScelto} onValueChange={setContoScelto}>
                              <SelectTrigger className="w-56">
                                <SelectValue placeholder="Scegli un conto" />
                              </SelectTrigger>
                              <SelectContent>
                                {(conti ?? []).map((conto) => (
                                  <SelectItem key={conto.id} value={conto.id}>
                                    {conto.code} · {conto.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Button
                              size="icon"
                              variant="ghost"
                              aria-label="Salva il conto"
                              disabled={correzione.isPending || !contoScelto}
                              onClick={() =>
                                correzione.mutate({ id: memoria.id, accountId: contoScelto })
                              }
                            >
                              <Check className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              aria-label="Annulla"
                              onClick={() => setInCorrezione(null)}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ) : (
                          <span>
                            {memoria.conto.codice} · {memoria.conto.nome}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant="secondary">{memoria.conferme}</Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {format(new Date(memoria.aggiornataIl), 'd MMM yyyy', { locale: it })}
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label="Correggi il conto"
                            onClick={() => apriCorrezione(memoria)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label="Dimentica questa memoria"
                            onClick={() => setDaCancellare(memoria)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {pagineTotali > 1 && (
              <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
                <span>
                  {data.totale} memorie · pagina {data.pagina} di {pagineTotali}
                </span>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pagina <= 1}
                    onClick={() => setPagina((p) => p - 1)}
                  >
                    Precedente
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pagina >= pagineTotali}
                    onClick={() => setPagina((p) => p + 1)}
                  >
                    Successiva
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>

      <AlertDialog open={!!daCancellare} onOpenChange={(aperto) => !aperto && setDaCancellare(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Dimenticare questa memoria?</AlertDialogTitle>
            <AlertDialogDescription>
              {daCancellare && (
                <>
                  «{daCancellare.nomeNormalizzato}» di {daCancellare.fornitore.nome} non verrà più
                  imputato automaticamente a {daCancellare.conto.nome}. Le righe già imputate sulle
                  fatture restano come sono: cambia solo cosa succederà d&apos;ora in poi.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              disabled={cancellazione.isPending}
              onClick={() => daCancellare && cancellazione.mutate(daCancellare.id)}
            >
              Dimentica
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}

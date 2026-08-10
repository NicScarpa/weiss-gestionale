'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { it } from 'date-fns/locale'
import { Plus, Clock, CheckCircle2, XCircle, Ban, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'

/**
 * Le richieste di correzione delle timbrature, lato dipendente: la strada per
 * la dimenticanza — che è il caso normale — e per chi dichiara le ore invece
 * di timbrarle. Un responsabile approva, e l'approvazione genera le
 * timbrature.
 */

interface RichiestaCorrezione {
  id: string
  date: string
  requestedClockIn: string | null
  requestedClockOut: string | null
  reason: string
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED'
  reviewNotes: string | null
  createdAt: string
  workLocation: { id: string; name: string } | null
  reviewedBy: { firstName: string; lastName: string } | null
}

interface LuogoAssegnato {
  id: string
  name: string
  trackingMode: string
}

const STATI: Record<
  RichiestaCorrezione['status'],
  { label: string; icon: typeof Clock; className: string }
> = {
  PENDING: { label: 'In attesa', icon: Clock, className: 'bg-amber-100 text-amber-800' },
  APPROVED: {
    label: 'Approvata',
    icon: CheckCircle2,
    className: 'bg-green-100 text-green-800',
  },
  REJECTED: { label: 'Rifiutata', icon: XCircle, className: 'bg-red-100 text-red-800' },
  CANCELLED: { label: 'Annullata', icon: Ban, className: 'bg-muted text-muted-foreground' },
}

function orarioToMinuti(orario: string): number | null {
  if (!orario) return null
  const [h, m] = orario.split(':').map(Number)
  if (Number.isNaN(h) || Number.isNaN(m)) return null

  return h * 60 + m
}

export default function CorrezioniPage() {
  const queryClient = useQueryClient()
  const [aperta, setAperta] = useState(false)
  const [data, setData] = useState('')
  const [entrata, setEntrata] = useState('')
  const [uscita, setUscita] = useState('')
  const [luogoId, setLuogoId] = useState<string>('nessuno')
  const [motivo, setMotivo] = useState('')

  const { data: richieste, isLoading } = useQuery<RichiestaCorrezione[]>({
    queryKey: ['richieste-correzione'],
    queryFn: async () => {
      const res = await fetch('/api/richieste-correzione')
      if (!res.ok) throw new Error('Errore nel caricamento delle richieste')
      const corpo = await res.json()
      return corpo.data
    },
  })

  // I luoghi assegnati arrivano dallo stato timbratura, che il portale già
  // interroga: se non ce ne sono il campo resta nascosto.
  const { data: statoCorrente } = useQuery<{ workLocations?: LuogoAssegnato[] }>({
    queryKey: ['attendance-current'],
    queryFn: async () => {
      const res = await fetch('/api/attendance/current')
      if (!res.ok) return {}
      return res.json()
    },
  })
  const luoghi = statoCorrente?.workLocations ?? []

  const crea = useMutation({
    mutationFn: async () => {
      const entrataMinuti = orarioToMinuti(entrata)
      let uscitaMinuti = orarioToMinuti(uscita)

      // Un'uscita "prima" dell'entrata si intende il giorno dopo: è il turno
      // serale che scavalca la mezzanotte.
      if (entrataMinuti !== null && uscitaMinuti !== null && uscitaMinuti <= entrataMinuti) {
        uscitaMinuti += 24 * 60
      }

      const res = await fetch('/api/richieste-correzione', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: data,
          requestedClockInMinutes: entrataMinuti,
          requestedClockOutMinutes: uscitaMinuti,
          workLocationId: luogoId === 'nessuno' ? null : luogoId,
          reason: motivo,
        }),
      })
      const corpo = await res.json()
      if (!res.ok) {
        const dettaglio = corpo?.details?.[0]?.message
        throw new Error(dettaglio ?? corpo?.error ?? 'Errore nella richiesta')
      }
      return corpo.data
    },
    onSuccess: () => {
      toast.success('Richiesta inviata: riceverai una notifica quando sarà decisa')
      setAperta(false)
      setData('')
      setEntrata('')
      setUscita('')
      setLuogoId('nessuno')
      setMotivo('')
      queryClient.invalidateQueries({ queryKey: ['richieste-correzione'] })
    },
    onError: (errore: Error) => toast.error(errore.message),
  })

  const annulla = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/richieste-correzione/${id}`, {
        method: 'DELETE',
      })
      const corpo = await res.json()
      if (!res.ok) throw new Error(corpo?.error ?? "Errore nell'annullamento")
    },
    onSuccess: () => {
      toast.success('Richiesta annullata')
      queryClient.invalidateQueries({ queryKey: ['richieste-correzione'] })
    },
    onError: (errore: Error) => toast.error(errore.message),
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Correzioni</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Hai dimenticato di timbrare? Chiedi qui la correzione
          </p>
        </div>
        <Button
          onClick={() => setAperta(true)}
          className="bg-gray-900 hover:bg-black text-white rounded-xl"
        >
          <Plus className="h-4 w-4 mr-2" />
          Nuova
        </Button>
      </div>

      {isLoading && (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full rounded-2xl" />
          <Skeleton className="h-24 w-full rounded-2xl" />
        </div>
      )}

      {richieste && richieste.length === 0 && (
        <Card className="rounded-2xl">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Nessuna richiesta finora. Quando dimentichi una timbratura, chiedi
            qui la correzione invece di passare dall&apos;ufficio.
          </CardContent>
        </Card>
      )}

      {richieste?.map((richiesta) => {
        const stato = STATI[richiesta.status]
        const StatoIcona = stato.icon

        return (
          <Card key={richiesta.id} className="rounded-2xl">
            <CardContent className="py-4 space-y-2">
              <div className="flex items-center justify-between">
                <div className="font-medium text-foreground">
                  {format(parseISO(richiesta.date), 'EEEE d MMMM', { locale: it })}
                </div>
                <Badge className={stato.className}>
                  <StatoIcona className="h-3 w-3 mr-1" />
                  {stato.label}
                </Badge>
              </div>
              <div className="text-sm text-muted-foreground">
                {richiesta.requestedClockIn && (
                  <span className="mr-3">
                    Entrata {format(parseISO(richiesta.requestedClockIn), 'HH:mm')}
                  </span>
                )}
                {richiesta.requestedClockOut && (
                  <span className="mr-3">
                    Uscita {format(parseISO(richiesta.requestedClockOut), 'HH:mm')}
                  </span>
                )}
                {richiesta.workLocation && <span>· {richiesta.workLocation.name}</span>}
              </div>
              <div className="text-sm text-muted-foreground">{richiesta.reason}</div>
              {richiesta.reviewNotes && (
                <div className="text-sm text-muted-foreground">
                  Risposta: {richiesta.reviewNotes}
                </div>
              )}
              {richiesta.status === 'PENDING' && (
                <div className="pt-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground"
                    onClick={() => annulla.mutate(richiesta.id)}
                    disabled={annulla.isPending}
                  >
                    <Trash2 className="h-4 w-4 mr-1" />
                    Annulla richiesta
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )
      })}

      <Dialog open={aperta} onOpenChange={setAperta}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nuova richiesta di correzione</DialogTitle>
            <DialogDescription>
              Indica il giorno e gli orari mancanti: un responsabile approverà e
              le timbrature verranno registrate.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="giorno">Giorno</Label>
              <Input
                id="giorno"
                type="date"
                value={data}
                onChange={(e) => setData(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="entrata">Entrata</Label>
                <Input
                  id="entrata"
                  type="time"
                  value={entrata}
                  onChange={(e) => setEntrata(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="uscita">Uscita</Label>
                <Input
                  id="uscita"
                  type="time"
                  value={uscita}
                  onChange={(e) => setUscita(e.target.value)}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Puoi indicare solo l&apos;orario che manca. Un&apos;uscita prima
              dell&apos;entrata si intende del giorno dopo (turno serale).
            </p>
            {luoghi.length > 0 && (
              <div className="space-y-2">
                <Label>Luogo</Label>
                <Select value={luogoId} onValueChange={setLuogoId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nessuno">Non indicato</SelectItem>
                    {luoghi.map((luogo) => (
                      <SelectItem key={luogo.id} value={luogo.id}>
                        {luogo.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="motivo">Motivo</Label>
              <Textarea
                id="motivo"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Es. ho dimenticato di timbrare l'uscita"
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAperta(false)}>
              Annulla
            </Button>
            <Button
              onClick={() => crea.mutate()}
              disabled={crea.isPending || !data || !motivo}
            >
              Invia richiesta
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

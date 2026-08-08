'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
  ChevronLeft,
  Plus,
  Pencil,
  Trash2,
  MapPin,
  UserPlus,
  X,
  AlertTriangle,
} from 'lucide-react'
import { toast } from 'sonner'
import { messaggioErroreApi } from '@/lib/utils/api-error'

interface Assegnazione {
  id: string
  trackingMode: 'GPS_GEOFENCE' | 'MANUAL_HOURS' | 'VIEW_ONLY'
  user: { id: string; firstName: string; lastName: string }
}

interface Luogo {
  id: string
  name: string
  address: string | null
  latitude: number | string | null
  longitude: number | string | null
  geofenceRadiusMeters: number
  isActive: boolean
  timekeepingPolicyId: string | null
  timekeepingPolicy: { id: string; name: string } | null
  assignments: Assegnazione[]
}

type BozzaLuogo = Omit<Luogo, 'id' | 'assignments' | 'timekeepingPolicy'> & {
  id?: string
}

const MODALITA: Record<Assegnazione['trackingMode'], string> = {
  GPS_GEOFENCE: 'Timbra con il GPS',
  MANUAL_HOURS: 'Dichiara le ore',
  VIEW_ONLY: 'Sola visualizzazione',
}

const luogoVuoto: BozzaLuogo = {
  name: '',
  address: null,
  latitude: null,
  longitude: null,
  geofenceRadiusMeters: 100,
  isActive: true,
  timekeepingPolicyId: null,
}

export default function LuoghiLavoroPage() {
  const queryClient = useQueryClient()
  const [inModifica, setInModifica] = useState<BozzaLuogo | null>(null)
  const [assegnaA, setAssegnaA] = useState<Luogo | null>(null)
  const [daEliminare, setDaEliminare] = useState<Luogo | null>(null)
  const [nuovaAssegnazione, setNuovaAssegnazione] = useState({
    userId: '',
    trackingMode: 'GPS_GEOFENCE' as Assegnazione['trackingMode'],
  })

  const { data: luoghi, isLoading, isError } = useQuery<Luogo[]>({
    queryKey: ['luoghi-lavoro'],
    queryFn: async () => {
      const response = await fetch('/api/luoghi-lavoro')
      if (!response.ok) throw new Error('Errore nel caricamento dei luoghi')
      const dati = await response.json()

      return dati.data ?? []
    },
  })

  const { data: dipendenti } = useQuery<
    { id: string; firstName: string; lastName: string }[]
  >({
    queryKey: ['staff-attivi'],
    queryFn: async () => {
      const response = await fetch('/api/staff?isActive=true')
      if (!response.ok) throw new Error('Errore nel caricamento dei dipendenti')
      const dati = await response.json()

      return dati.data ?? dati.staff ?? []
    },
  })

  const { data: regole } = useQuery<{ id: string; name: string }[]>({
    queryKey: ['politiche-orario'],
    queryFn: async () => {
      const response = await fetch('/api/politiche-orario')
      if (!response.ok) throw new Error('Errore nel caricamento delle regole')
      const dati = await response.json()

      return dati.data ?? []
    },
  })

  const salva = useMutation({
    mutationFn: async (luogo: BozzaLuogo) => {
      const modifica = Boolean(luogo.id)
      const response = await fetch(
        modifica ? `/api/luoghi-lavoro/${luogo.id}` : '/api/luoghi-lavoro',
        {
          method: modifica ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...luogo,
            latitude: luogo.latitude === null ? null : Number(luogo.latitude),
            longitude: luogo.longitude === null ? null : Number(luogo.longitude),
          }),
        }
      )
      const dati = await response.json()
      if (!response.ok) {
        throw new Error(messaggioErroreApi(dati, 'Errore nel salvataggio'))
      }

      return dati.data
    },
    onSuccess: () => {
      toast.success('Luogo salvato')
      queryClient.invalidateQueries({ queryKey: ['luoghi-lavoro'] })
      // Il conteggio sulla card della regola comprende i luoghi: cambiare la
      // regola di un luogo lo sposta da una regola all'altra.
      queryClient.invalidateQueries({ queryKey: ['politiche-orario'] })
      setInModifica(null)
    },
    onError: (errore: Error) => toast.error(errore.message),
  })

  const elimina = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/luoghi-lavoro/${id}`, { method: 'DELETE' })
      const dati = await response.json()
      if (!response.ok) {
        throw new Error(messaggioErroreApi(dati, "Errore nell'eliminazione"))
      }

      return dati
    },
    onSuccess: (dati) => {
      toast.success(dati.message ?? 'Luogo eliminato')
      queryClient.invalidateQueries({ queryKey: ['luoghi-lavoro'] })
      queryClient.invalidateQueries({ queryKey: ['politiche-orario'] })
      setDaEliminare(null)
    },
    onError: (errore: Error) => {
      toast.error(errore.message)
      setDaEliminare(null)
    },
  })

  const assegna = useMutation({
    mutationFn: async ({ luogoId, ...corpo }: { luogoId: string; userId: string; trackingMode: string }) => {
      const response = await fetch(`/api/luoghi-lavoro/${luogoId}/assegnazioni`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corpo),
      })
      const dati = await response.json()
      if (!response.ok) {
        throw new Error(messaggioErroreApi(dati, "Errore nell'assegnazione"))
      }

      return dati.data
    },
    onSuccess: () => {
      toast.success('Dipendente abilitato')
      queryClient.invalidateQueries({ queryKey: ['luoghi-lavoro'] })
      setNuovaAssegnazione({ userId: '', trackingMode: 'GPS_GEOFENCE' })
      setAssegnaA(null)
    },
    onError: (errore: Error) => toast.error(errore.message),
  })

  const revoca = useMutation({
    mutationFn: async ({ luogoId, userId }: { luogoId: string; userId: string }) => {
      const response = await fetch(
        `/api/luoghi-lavoro/${luogoId}/assegnazioni?userId=${userId}`,
        { method: 'DELETE' }
      )
      const dati = await response.json()
      if (!response.ok) {
        throw new Error(messaggioErroreApi(dati, 'Errore nella revoca'))
      }

      return dati
    },
    onSuccess: () => {
      toast.success('Abilitazione revocata')
      queryClient.invalidateQueries({ queryKey: ['luoghi-lavoro'] })
    },
    onError: (errore: Error) => toast.error(errore.message),
  })

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <Button variant="ghost" size="icon" className="shrink-0" asChild>
            <Link href="/presenze">
              <ChevronLeft className="h-5 w-5" />
            </Link>
          </Button>
          <div className="min-w-0">
            <h1 className="text-3xl font-bold tracking-tight">Luoghi di lavoro</h1>
            <p className="text-muted-foreground">
              Dove si timbra, con quale raggio e chi è abilitato in ciascun posto
            </p>
          </div>
        </div>

        <Button onClick={() => setInModifica({ ...luogoVuoto })}>
          <Plus className="h-4 w-4 mr-2" />
          Nuovo luogo
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      ) : isError ? (
        // "Nessun luogo configurato" davanti a un errore di rete farebbe
        // ricreare luoghi che esistono già, con le loro abilitazioni.
        <Card>
          <CardContent className="py-12 text-center space-y-3">
            <AlertTriangle className="h-10 w-10 mx-auto text-destructive" />
            <div>
              <p className="font-medium">Non è stato possibile caricare i luoghi</p>
              <p className="text-sm text-muted-foreground">
                Riprova fra poco: i luoghi configurati restano attivi.
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() =>
                queryClient.invalidateQueries({ queryKey: ['luoghi-lavoro'] })
              }
            >
              Riprova
            </Button>
          </CardContent>
        </Card>
      ) : !luoghi || luoghi.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center space-y-3">
            <MapPin className="h-10 w-10 mx-auto text-muted-foreground" />
            <div>
              <p className="font-medium">Nessun luogo configurato</p>
              <p className="text-sm text-muted-foreground">
                Finché non ne esiste uno, la timbratura resta agganciata alle
                coordinate della sede come prima.
              </p>
            </div>
            <Button onClick={() => setInModifica({ ...luogoVuoto })}>
              <Plus className="h-4 w-4 mr-2" />
              Crea il primo luogo
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {luoghi.map((luogo) => (
            <Card key={luogo.id}>
              <CardContent className="py-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{luogo.name}</span>
                      {!luogo.isActive && <Badge variant="outline">Non attivo</Badge>}
                      {luogo.timekeepingPolicy && (
                        <Badge variant="secondary">{luogo.timekeepingPolicy.name}</Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {luogo.address || 'Indirizzo non indicato'}
                      {luogo.latitude !== null
                        ? ` · raggio ${luogo.geofenceRadiusMeters} m`
                        : ' · senza coordinate, non si timbra col GPS'}
                    </p>
                  </div>

                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        setInModifica({
                          id: luogo.id,
                          name: luogo.name,
                          address: luogo.address,
                          latitude: luogo.latitude === null ? null : Number(luogo.latitude),
                          longitude:
                            luogo.longitude === null ? null : Number(luogo.longitude),
                          geofenceRadiusMeters: luogo.geofenceRadiusMeters,
                          isActive: luogo.isActive,
                          timekeepingPolicyId: luogo.timekeepingPolicyId,
                        })
                      }
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setDaEliminare(luogo)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <Separator />

                <div className="flex flex-wrap items-center gap-2">
                  {luogo.assignments.length === 0 ? (
                    <span className="text-sm text-muted-foreground">
                      Nessun dipendente abilitato
                    </span>
                  ) : (
                    luogo.assignments.map((a) => (
                      <Badge key={a.id} variant="outline" className="gap-1 py-1">
                        {a.user.firstName} {a.user.lastName}
                        <span className="text-muted-foreground">
                          · {MODALITA[a.trackingMode]}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            revoca.mutate({ luogoId: luogo.id, userId: a.user.id })
                          }
                          className="ml-1 hover:text-destructive"
                          aria-label={`Revoca ${a.user.firstName} ${a.user.lastName}`}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))
                  )}

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setAssegnaA(luogo)}
                  >
                    <UserPlus className="h-4 w-4 mr-1" />
                    Abilita
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Form del luogo */}
      <Dialog
        open={inModifica !== null}
        onOpenChange={(aperto) => !aperto && setInModifica(null)}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {inModifica?.id ? 'Modifica luogo' : 'Nuovo luogo di lavoro'}
            </DialogTitle>
            <DialogDescription>
              Le coordinate servono per il geofence: senza, chi vi lavora dichiara le
              ore invece di timbrarle.
            </DialogDescription>
          </DialogHeader>

          {inModifica && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="nome-luogo">Nome</Label>
                <Input
                  id="nome-luogo"
                  value={inModifica.name}
                  placeholder="Es. Weiss Cafè, Villa Varda"
                  onChange={(e) =>
                    setInModifica({ ...inModifica, name: e.target.value })
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="indirizzo">Indirizzo</Label>
                <Input
                  id="indirizzo"
                  value={inModifica.address ?? ''}
                  onChange={(e) =>
                    setInModifica({
                      ...inModifica,
                      address: e.target.value || null,
                    })
                  }
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="lat">Latitudine</Label>
                  <Input
                    id="lat"
                    type="number"
                    step="0.000001"
                    value={inModifica.latitude ?? ''}
                    placeholder="45.953621"
                    onChange={(e) =>
                      setInModifica({
                        ...inModifica,
                        latitude: e.target.value === '' ? null : Number(e.target.value),
                      })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lng">Longitudine</Label>
                  <Input
                    id="lng"
                    type="number"
                    step="0.000001"
                    value={inModifica.longitude ?? ''}
                    placeholder="12.503256"
                    onChange={(e) =>
                      setInModifica({
                        ...inModifica,
                        longitude: e.target.value === '' ? null : Number(e.target.value),
                      })
                    }
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="raggio">Raggio del geofence (metri)</Label>
                <Input
                  id="raggio"
                  type="number"
                  min={10}
                  max={5000}
                  value={inModifica.geofenceRadiusMeters}
                  onChange={(e) =>
                    setInModifica({
                      ...inModifica,
                      geofenceRadiusMeters: Number(e.target.value),
                    })
                  }
                />
                <p className="text-sm text-muted-foreground">
                  Oltre questa distanza la timbratura viene segnalata come anomalia.
                </p>
              </div>

              <div className="space-y-2">
                <Label>Regola orario del luogo</Label>
                <Select
                  value={inModifica.timekeepingPolicyId ?? '__nessuna__'}
                  onValueChange={(v) =>
                    setInModifica({
                      ...inModifica,
                      timekeepingPolicyId: v === '__nessuna__' ? null : v,
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__nessuna__">
                      Nessuna: vale la regola del dipendente
                    </SelectItem>
                    {(regole ?? []).map((regola) => (
                      <SelectItem key={regola.id} value={regola.id}>
                        {regola.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="attivo">Luogo attivo</Label>
                <Switch
                  id="attivo"
                  checked={inModifica.isActive}
                  onCheckedChange={(v) =>
                    setInModifica({ ...inModifica, isActive: v })
                  }
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setInModifica(null)}>
              Annulla
            </Button>
            <Button
              onClick={() => inModifica && salva.mutate(inModifica)}
              disabled={salva.isPending || !inModifica?.name}
            >
              {salva.isPending ? 'Salvataggio…' : 'Salva'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Abilitazione di un dipendente */}
      <Dialog
        open={assegnaA !== null}
        onOpenChange={(aperto) => !aperto && setAssegnaA(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Abilita un dipendente</DialogTitle>
            <DialogDescription>
              Su {assegnaA?.name}. La modalità vale solo per questo luogo: la stessa
              persona può timbrare col GPS qui e dichiarare le ore altrove.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Dipendente</Label>
              <Select
                value={nuovaAssegnazione.userId}
                onValueChange={(v) =>
                  setNuovaAssegnazione({ ...nuovaAssegnazione, userId: v })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Scegli" />
                </SelectTrigger>
                <SelectContent>
                  {(dipendenti ?? []).map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.firstName} {d.lastName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Modalità</Label>
              <Select
                value={nuovaAssegnazione.trackingMode}
                onValueChange={(v) =>
                  setNuovaAssegnazione({
                    ...nuovaAssegnazione,
                    trackingMode: v as Assegnazione['trackingMode'],
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(MODALITA).map(([valore, etichetta]) => (
                    <SelectItem key={valore} value={valore}>
                      {etichetta}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAssegnaA(null)}>
              Annulla
            </Button>
            <Button
              onClick={() =>
                assegnaA &&
                assegna.mutate({ luogoId: assegnaA.id, ...nuovaAssegnazione })
              }
              disabled={assegna.isPending || !nuovaAssegnazione.userId}
            >
              {assegna.isPending ? 'Salvataggio…' : 'Abilita'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Conferma di eliminazione */}
      <AlertDialog
        open={daEliminare !== null}
        onOpenChange={(aperto) => !aperto && setDaEliminare(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare il luogo?</AlertDialogTitle>
            <AlertDialogDescription>
              Se su {daEliminare?.name} sono già state registrate timbrature, il
              luogo viene disattivato: sparisce dalle scelte future ma le
              timbrature conservano il posto in cui sono avvenute. Se invece non
              ne ha nessuna, viene eliminato
              {daEliminare && daEliminare.assignments.length > 0
                ? ` insieme alle abilitazioni di ${daEliminare.assignments.length} ${
                    daEliminare.assignments.length === 1 ? 'dipendente' : 'dipendenti'
                  }`
                : ' con le sue abilitazioni'}
              .
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => daEliminare && elimina.mutate(daEliminare.id)}
            >
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

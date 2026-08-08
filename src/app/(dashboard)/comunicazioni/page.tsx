'use client'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Megaphone, Pencil, Trash2, Loader2, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
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
import { messaggioErroreApi } from '@/lib/utils/api-error'
import {
  PRIORITA_OPZIONI,
  etichettaPriorita,
  formattaGiorno,
  giornoDiScadenza,
  type PrioritaComunicazione,
} from '@/lib/comunicazioni-format'

interface Comunicazione {
  id: string
  title: string
  message: string
  priority: PrioritaComunicazione
  eventDate: string | null
  expiresAt: string | null
  targetRoles: string[]
  createdAt: string
  createdBy: { id: string; firstName: string; lastName: string }
  letta: boolean
  letture: number
  destinatari: number
}

interface Ruolo {
  id: string
  name: string
  description: string | null
}

/** Ruoli dell'applicazione, se la lista non è leggibile (è riservata agli admin). */
const RUOLI_NOTI = ['admin', 'manager', 'staff']

interface DatiForm {
  title: string
  message: string
  priority: PrioritaComunicazione
  eventDate: string
  expiresAt: string
  targetRoles: string[]
}

const FORM_VUOTO: DatiForm = {
  title: '',
  message: '',
  priority: 'NORMAL',
  eventDate: '',
  expiresAt: '',
  targetRoles: [],
}

const COLORE_PRIORITA: Record<PrioritaComunicazione, string> = {
  NORMAL: 'bg-slate-100 text-foreground',
  IMPORTANT: 'bg-amber-100 text-amber-800',
  URGENT: 'bg-red-100 text-red-700',
}

export default function ComunicazioniPage() {
  const queryClient = useQueryClient()
  const [formAperto, setFormAperto] = useState(false)
  const [inModifica, setInModifica] = useState<Comunicazione | null>(null)
  const [form, setForm] = useState<DatiForm>(FORM_VUOTO)
  const [daEliminare, setDaEliminare] = useState<Comunicazione | null>(null)

  const { data, isLoading } = useQuery<{ data: Comunicazione[] }>({
    queryKey: ['comunicazioni'],
    queryFn: async () => {
      const res = await fetch('/api/comunicazioni')
      if (!res.ok) throw new Error('Errore nel recupero delle comunicazioni')
      return res.json()
    },
  })

  // I ruoli sono visibili solo agli admin: a un manager la lista serve
  // comunque, e i nomi dei ruoli dell'applicazione sono questi tre.
  const { data: ruoli } = useQuery<string[]>({
    queryKey: ['comunicazioni', 'ruoli'],
    queryFn: async () => {
      const res = await fetch('/api/roles')
      if (!res.ok) return RUOLI_NOTI
      const corpo = (await res.json()) as { data: Ruolo[] }
      return corpo.data.map((ruolo) => ruolo.name)
    },
  })

  const salva = useMutation({
    mutationFn: async (dati: DatiForm) => {
      const corpo = {
        ...dati,
        eventDate: dati.eventDate || null,
        expiresAt: dati.expiresAt || null,
      }
      const res = await fetch(
        inModifica ? `/api/comunicazioni/${inModifica.id}` : '/api/comunicazioni',
        {
          method: inModifica ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(corpo),
        }
      )
      if (!res.ok) {
        throw new Error(
          messaggioErroreApi(
            await res.json().catch(() => null),
            'Errore nel salvataggio della comunicazione'
          )
        )
      }
      return res.json()
    },
    onSuccess: () => {
      toast.success(
        inModifica ? 'Comunicazione aggiornata' : 'Comunicazione pubblicata'
      )
      queryClient.invalidateQueries({ queryKey: ['comunicazioni'] })
      chiudiForm()
    },
    onError: (errore: Error) => toast.error(errore.message),
  })

  const elimina = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/comunicazioni/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        throw new Error(
          messaggioErroreApi(
            await res.json().catch(() => null),
            "Errore nell'eliminazione della comunicazione"
          )
        )
      }
    },
    onSuccess: () => {
      toast.success('Comunicazione eliminata')
      queryClient.invalidateQueries({ queryKey: ['comunicazioni'] })
      setDaEliminare(null)
    },
    onError: (errore: Error) => toast.error(errore.message),
  })

  function apriNuova() {
    setInModifica(null)
    setForm(FORM_VUOTO)
    setFormAperto(true)
  }

  function apriModifica(comunicazione: Comunicazione) {
    setInModifica(comunicazione)
    setForm({
      title: comunicazione.title,
      message: comunicazione.message,
      priority: comunicazione.priority,
      eventDate: comunicazione.eventDate?.slice(0, 10) ?? '',
      expiresAt: comunicazione.expiresAt
        ? giornoDiScadenza(comunicazione.expiresAt)
        : '',
      targetRoles: comunicazione.targetRoles,
    })
    setFormAperto(true)
  }

  function chiudiForm() {
    setFormAperto(false)
    setInModifica(null)
    setForm(FORM_VUOTO)
  }

  function alternaRuolo(ruolo: string) {
    setForm((precedente) => ({
      ...precedente,
      targetRoles: precedente.targetRoles.includes(ruolo)
        ? precedente.targetRoles.filter((r) => r !== ruolo)
        : [...precedente.targetRoles, ruolo],
    }))
  }

  const comunicazioni = data?.data ?? []

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-foreground">Comunicazioni</h1>
          <p className="mt-1 text-sm text-slate-500">
            La bacheca del portale: quello che pubblichi qui arriva a chi lavora
            con una notifica sul telefono
          </p>
        </div>
        <Button onClick={apriNuova}>
          <Plus className="mr-2 h-4 w-4" />
          Nuova comunicazione
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        </div>
      ) : comunicazioni.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-slate-500">
            <Megaphone className="mx-auto mb-3 h-10 w-10 text-slate-300" />
            <p className="text-sm">
              Nessuna comunicazione pubblicata: la bacheca del portale è vuota
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {comunicazioni.map((comunicazione) => {
            const scaduta =
              comunicazione.expiresAt !== null &&
              new Date(comunicazione.expiresAt) <= new Date()

            return (
              <Card key={comunicazione.id} className={scaduta ? 'opacity-60' : ''}>
                <CardContent className="flex items-start justify-between gap-4 py-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-foreground">
                        {comunicazione.title}
                      </span>
                      <Badge
                        variant="outline"
                        className={COLORE_PRIORITA[comunicazione.priority]}
                      >
                        {etichettaPriorita(comunicazione.priority)}
                      </Badge>
                      {scaduta && (
                        <Badge variant="outline" className="text-slate-500">
                          Scaduta
                        </Badge>
                      )}
                    </div>

                    <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                      {comunicazione.message}
                    </p>

                    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                      <span>
                        Destinatari:{' '}
                        {comunicazione.targetRoles.length === 0
                          ? 'tutti'
                          : comunicazione.targetRoles.join(', ')}
                      </span>
                      {comunicazione.eventDate && (
                        <span>
                          Evento del {formattaGiorno(comunicazione.eventDate)}
                        </span>
                      )}
                      {comunicazione.expiresAt && (
                        <span>
                          {scaduta ? 'Scaduta il' : 'Fino al'}{' '}
                          {formattaGiorno(
                            giornoDiScadenza(comunicazione.expiresAt)
                          )}
                        </span>
                      )}
                      <span className="font-medium text-muted-foreground">
                        {comunicazione.letture} su {comunicazione.destinatari}{' '}
                        {comunicazione.letture === 1 ? "l'ha letta" : "l'hanno letta"}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-shrink-0 gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => apriModifica(comunicazione)}
                      aria-label="Modifica comunicazione"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setDaEliminare(comunicazione)}
                      aria-label="Elimina comunicazione"
                    >
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <Dialog
        open={formAperto}
        onOpenChange={(aperto) => (aperto ? setFormAperto(true) : chiudiForm())}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {inModifica ? 'Modifica comunicazione' : 'Nuova comunicazione'}
            </DialogTitle>
            <DialogDescription>
              {inModifica
                ? 'La correzione non fa partire una nuova notifica'
                : 'Alla pubblicazione parte una notifica ai destinatari'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="titolo">Titolo</Label>
              <Input
                id="titolo"
                value={form.title}
                maxLength={120}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Chiusura straordinaria di lunedì"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="messaggio">Messaggio</Label>
              <Textarea
                id="messaggio"
                value={form.message}
                maxLength={2000}
                rows={5}
                onChange={(e) => setForm({ ...form, message: e.target.value })}
                placeholder="Scrivi qui il testo che leggeranno nel portale"
              />
              <p className="text-xs text-slate-400">
                {form.message.length}/2000 caratteri
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="priorita">Priorità</Label>
              <Select
                value={form.priority}
                onValueChange={(valore) =>
                  setForm({ ...form, priority: valore as PrioritaComunicazione })
                }
              >
                <SelectTrigger id="priorita">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITA_OPZIONI.map((opzione) => (
                    <SelectItem key={opzione.value} value={opzione.value}>
                      {opzione.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="data-evento">Data dell&apos;evento</Label>
                <Input
                  id="data-evento"
                  type="date"
                  value={form.eventDate}
                  onChange={(e) => setForm({ ...form, eventDate: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="scadenza">Visibile fino al</Label>
                <Input
                  id="scadenza"
                  type="date"
                  value={form.expiresAt}
                  onChange={(e) => setForm({ ...form, expiresAt: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Destinatari</Label>
              <p className="text-xs text-slate-400">
                Nessun ruolo selezionato: la comunicazione va a tutti
              </p>
              <div className="flex flex-wrap gap-4">
                {(ruoli ?? RUOLI_NOTI).map((ruolo) => (
                  <label
                    key={ruolo}
                    className="flex cursor-pointer items-center gap-2 text-sm text-foreground"
                  >
                    <Checkbox
                      checked={form.targetRoles.includes(ruolo)}
                      onCheckedChange={() => alternaRuolo(ruolo)}
                    />
                    {ruolo}
                  </label>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={chiudiForm}>
              Annulla
            </Button>
            <Button
              onClick={() => salva.mutate(form)}
              disabled={
                salva.isPending || !form.title.trim() || !form.message.trim()
              }
            >
              {salva.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {inModifica ? 'Salva' : 'Pubblica'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={daEliminare !== null}
        onOpenChange={(aperto) => !aperto && setDaEliminare(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare la comunicazione?</AlertDialogTitle>
            <AlertDialogDescription>
              &laquo;{daEliminare?.title}&raquo; sparisce dal portale, insieme al
              conteggio di chi l&apos;aveva letta. L&apos;operazione non si annulla.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => daEliminare && elimina.mutate(daEliminare.id)}
              disabled={elimina.isPending}
            >
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
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
  AlertTriangle,
  BellRing,
  ChevronLeft,
  LogIn,
  LogOut,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { romeDateKey } from '@/lib/timezone'
import { messaggioErroreApi } from '@/lib/utils/api-error'
import {
  minutiToOrario,
  orarioToMinuti,
} from '@/components/attendance/TimekeepingPolicyForm'

interface Dipendente {
  id: string
  firstName: string
  lastName: string
}

interface PromemoriaSalvato {
  id: string
  name: string
  punchType: 'IN' | 'OUT'
  timeMinutes: number
  daysOfWeek: number[]
  skipIfPunched: boolean
  title: string
  body: string
  isActive: boolean
  lastSentDate: string | null
  recipients: Array<{ userId: string }>
}

interface RispostaPromemoria {
  data: PromemoriaSalvato[]
  dipendenti: Dipendente[]
}

interface FormPromemoria {
  id?: string
  name: string
  punchType: 'IN' | 'OUT'
  timeMinutes: number
  daysOfWeek: number[]
  skipIfPunched: boolean
  title: string
  body: string
  isActive: boolean
  recipientIds: string[]
}

/** Lunedì per primo: la settimana della domenica è quella di `Date.getDay`, non quella di chi legge. */
const GIORNI = [
  { valore: 1, etichetta: 'Lun' },
  { valore: 2, etichetta: 'Mar' },
  { valore: 3, etichetta: 'Mer' },
  { valore: 4, etichetta: 'Gio' },
  { valore: 5, etichetta: 'Ven' },
  { valore: 6, etichetta: 'Sab' },
  { valore: 0, etichetta: 'Dom' },
]

const TESTI_PREDEFINITI = {
  IN: {
    title: 'Ricordati di timbrare',
    body: 'Apri il portale e registra la tua entrata.',
  },
  OUT: {
    title: 'Hai timbrato l\'uscita?',
    body: 'Apri il portale e chiudi la giornata.',
  },
} as const

const promemoriaVuoto: FormPromemoria = {
  name: '',
  punchType: 'IN',
  timeMinutes: 9 * 60,
  daysOfWeek: [1, 2, 3, 4, 5, 6, 0],
  skipIfPunched: true,
  title: TESTI_PREDEFINITI.IN.title,
  body: TESTI_PREDEFINITI.IN.body,
  isActive: true,
  recipientIds: [],
}

/** "Tutti i giorni", "Lun-Ven", oppure l'elenco di quelli scelti. */
function descriviGiorni(giorni: number[]): string {
  if (giorni.length === 7) return 'Tutti i giorni'

  const feriali = [1, 2, 3, 4, 5]
  if (
    giorni.length === feriali.length &&
    feriali.every((g) => giorni.includes(g))
  ) {
    return 'Lun-Ven'
  }

  return GIORNI.filter((g) => giorni.includes(g.valore))
    .map((g) => g.etichetta)
    .join(', ')
}

/**
 * Il promemoria è già partito nella giornata italiana di oggi. È la prova che
 * il cron gira: senza, l'unico modo di saperlo è chiedere a chi doveva
 * riceverlo. `lastSentDate` è una data senza orario, quindi si confronta con la
 * chiave del giorno e non con un istante.
 */
function partitoOggi(promemoria: PromemoriaSalvato): boolean {
  if (!promemoria.lastSentDate) return false

  return (
    promemoria.lastSentDate.slice(0, 10) === romeDateKey(new Date())
  )
}

function descriviDestinatari(
  promemoria: PromemoriaSalvato,
  dipendenti: Dipendente[]
): string {
  if (promemoria.recipients.length === 0) return 'tutti i dipendenti'

  const scelti = new Set(promemoria.recipients.map((r) => r.userId))
  const nomi = dipendenti
    .filter((d) => scelti.has(d.id))
    .map((d) => `${d.firstName} ${d.lastName}`)

  // Chi è stato disattivato non compare più fra i dipendenti: il conteggio
  // resterebbe più alto dei nomi, e sembrerebbe un errore di caricamento.
  if (nomi.length === 0) return `${scelti.size} destinatari`
  if (nomi.length <= 2) return nomi.join(' e ')

  return `${nomi.length} dipendenti`
}

export default function PromemoriaPage() {
  const queryClient = useQueryClient()
  const [inModifica, setInModifica] = useState<FormPromemoria | null>(null)
  const [daEliminare, setDaEliminare] = useState<PromemoriaSalvato | null>(null)

  const { data, isLoading, isError } = useQuery<RispostaPromemoria>({
    queryKey: ['promemoria-timbratura'],
    queryFn: async () => {
      const response = await fetch('/api/promemoria-timbratura')
      if (!response.ok) throw new Error('Errore nel caricamento dei promemoria')

      return response.json()
    },
  })

  const promemoria = data?.data ?? []
  const dipendenti = data?.dipendenti ?? []

  const salva = useMutation({
    mutationFn: async (valore: FormPromemoria) => {
      const modifica = Boolean(valore.id)
      const response = await fetch(
        modifica
          ? `/api/promemoria-timbratura/${valore.id}`
          : '/api/promemoria-timbratura',
        {
          method: modifica ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(valore),
        }
      )
      const dati = await response.json()
      if (!response.ok) {
        throw new Error(messaggioErroreApi(dati, 'Errore nel salvataggio'))
      }

      return dati.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['promemoria-timbratura'] })
      setInModifica(null)
    },
    onError: (errore: Error) => toast.error(errore.message),
  })

  const elimina = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/promemoria-timbratura/${id}`, {
        method: 'DELETE',
      })
      const dati = await response.json()
      if (!response.ok) {
        throw new Error(messaggioErroreApi(dati, "Errore nell'eliminazione"))
      }

      return dati
    },
    onSuccess: () => {
      toast.success('Promemoria eliminato')
      queryClient.invalidateQueries({ queryKey: ['promemoria-timbratura'] })
      setDaEliminare(null)
    },
    onError: (errore: Error) => {
      toast.error(errore.message)
      setDaEliminare(null)
    },
  })

  const apriModifica = (p: PromemoriaSalvato) => {
    setInModifica({
      id: p.id,
      name: p.name,
      punchType: p.punchType,
      timeMinutes: p.timeMinutes,
      daysOfWeek: p.daysOfWeek,
      skipIfPunched: p.skipIfPunched,
      title: p.title,
      body: p.body,
      isActive: p.isActive,
      recipientIds: p.recipients.map((r) => r.userId),
    })
  }

  /** L'interruttore della lista salva subito: è l'unico modo di spegnere un promemoria senza aprire il form. */
  const cambiaAttivo = (p: PromemoriaSalvato, attivo: boolean) => {
    salva.mutate(
      {
        id: p.id,
        name: p.name,
        punchType: p.punchType,
        timeMinutes: p.timeMinutes,
        daysOfWeek: p.daysOfWeek,
        skipIfPunched: p.skipIfPunched,
        title: p.title,
        body: p.body,
        isActive: attivo,
        recipientIds: p.recipients.map((r) => r.userId),
      },
      {
        onSuccess: () =>
          toast.success(attivo ? 'Promemoria attivato' : 'Promemoria sospeso'),
      }
    )
  }

  const aggiorna = <K extends keyof FormPromemoria>(
    campo: K,
    valore: FormPromemoria[K]
  ) => {
    setInModifica((precedente) =>
      precedente ? { ...precedente, [campo]: valore } : precedente
    )
  }

  /**
   * Cambiando entrata/uscita si adeguano anche i testi, ma solo finché sono
   * quelli proposti: una frase scritta a mano non va sovrascritta.
   */
  const cambiaTipo = (punchType: 'IN' | 'OUT') => {
    setInModifica((precedente) => {
      if (!precedente) return precedente

      const altro = TESTI_PREDEFINITI[precedente.punchType]
      const nuovo = TESTI_PREDEFINITI[punchType]

      return {
        ...precedente,
        punchType,
        title: precedente.title === altro.title ? nuovo.title : precedente.title,
        body: precedente.body === altro.body ? nuovo.body : precedente.body,
      }
    })
  }

  const cambiaGiorno = (giorno: number) => {
    setInModifica((precedente) => {
      if (!precedente) return precedente

      return {
        ...precedente,
        daysOfWeek: precedente.daysOfWeek.includes(giorno)
          ? precedente.daysOfWeek.filter((g) => g !== giorno)
          : [...precedente.daysOfWeek, giorno].sort((a, b) => a - b),
      }
    })
  }

  const cambiaDestinatario = (userId: string) => {
    setInModifica((precedente) => {
      if (!precedente) return precedente

      return {
        ...precedente,
        recipientIds: precedente.recipientIds.includes(userId)
          ? precedente.recipientIds.filter((id) => id !== userId)
          : [...precedente.recipientIds, userId],
      }
    })
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <Button variant="ghost" size="icon" className="shrink-0" asChild>
            <Link href="/presenze/policy">
              <ChevronLeft className="h-5 w-5" />
            </Link>
          </Button>
          <div className="min-w-0">
            <h1 className="text-3xl font-bold tracking-tight">
              Promemoria di timbratura
            </h1>
            <p className="text-muted-foreground">
              Notifiche push che ricordano di timbrare, all&apos;ora e nei giorni
              che decidi tu
            </p>
          </div>
        </div>

        <Button onClick={() => setInModifica({ ...promemoriaVuoto })}>
          <Plus className="h-4 w-4 mr-2" />
          Nuovo promemoria
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : isError ? (
        // Un errore di caricamento non è "nessun promemoria": invitare a creare
        // il primo porterebbe a duplicare quelli che già esistono.
        <Card>
          <CardContent className="py-12 text-center space-y-3">
            <AlertTriangle className="h-10 w-10 mx-auto text-destructive" />
            <div>
              <p className="font-medium">
                Non è stato possibile caricare i promemoria
              </p>
              <p className="text-sm text-muted-foreground">
                Riprova fra poco: quelli già attivi continuano a partire.
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() =>
                queryClient.invalidateQueries({
                  queryKey: ['promemoria-timbratura'],
                })
              }
            >
              Riprova
            </Button>
          </CardContent>
        </Card>
      ) : promemoria.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center space-y-3">
            <BellRing className="h-10 w-10 mx-auto text-muted-foreground" />
            <div>
              <p className="font-medium">Nessun promemoria configurato</p>
              <p className="text-sm text-muted-foreground">
                Finché non ne esiste uno, nessuno riceve avvisi: le entrate e le
                uscite dimenticate si scoprono solo dalle anomalie.
              </p>
            </div>
            <Button onClick={() => setInModifica({ ...promemoriaVuoto })}>
              <Plus className="h-4 w-4 mr-2" />
              Crea il primo promemoria
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {promemoria.map((p) => (
            <Card key={p.id}>
              <CardContent className="flex items-center justify-between py-4 gap-4">
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">{p.name}</span>
                    <Badge variant={p.punchType === 'IN' ? 'default' : 'secondary'}>
                      {p.punchType === 'IN' ? 'Entrata' : 'Uscita'}
                    </Badge>
                    {!p.isActive && <Badge variant="outline">Sospeso</Badge>}
                    {partitoOggi(p) && (
                      <Badge variant="outline">Inviato oggi</Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {minutiToOrario(p.timeMinutes)} · {descriviGiorni(p.daysOfWeek)}{' '}
                    · {descriviDestinatari(p, dipendenti)}
                    {p.skipIfPunched && ' · solo a chi non ha ancora timbrato'}
                  </p>
                  <p className="text-sm truncate">
                    <span className="font-medium">{p.title}</span> — {p.body}
                  </p>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <Switch
                    checked={p.isActive}
                    disabled={salva.isPending}
                    onCheckedChange={(attivo) => cambiaAttivo(p, attivo)}
                    aria-label={
                      p.isActive ? 'Sospendi promemoria' : 'Attiva promemoria'
                    }
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => apriModifica(p)}
                    aria-label="Modifica promemoria"
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setDaEliminare(p)}
                    aria-label="Elimina promemoria"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog
        open={inModifica !== null}
        onOpenChange={(aperto) => !aperto && setInModifica(null)}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {inModifica?.id ? 'Modifica promemoria' : 'Nuovo promemoria'}
            </DialogTitle>
            <DialogDescription>
              La notifica arriva sul telefono di chi ha il portale attivo e le
              notifiche abilitate.
            </DialogDescription>
          </DialogHeader>

          {inModifica && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="nome">Nome</Label>
                <Input
                  id="nome"
                  value={inModifica.name}
                  maxLength={80}
                  placeholder="Es. Apertura mattino"
                  onChange={(e) => aggiorna('name', e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Serve solo a te per riconoscerlo in questo elenco
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Tipo</Label>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant={inModifica.punchType === 'IN' ? 'default' : 'outline'}
                      className="flex-1"
                      onClick={() => cambiaTipo('IN')}
                    >
                      <LogIn className="h-4 w-4 mr-2" />
                      Entrata
                    </Button>
                    <Button
                      type="button"
                      variant={
                        inModifica.punchType === 'OUT' ? 'default' : 'outline'
                      }
                      className="flex-1"
                      onClick={() => cambiaTipo('OUT')}
                    >
                      <LogOut className="h-4 w-4 mr-2" />
                      Uscita
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="orario">Orario</Label>
                  <Input
                    id="orario"
                    type="time"
                    value={minutiToOrario(inModifica.timeMinutes)}
                    onChange={(e) =>
                      aggiorna('timeMinutes', orarioToMinuti(e.target.value) ?? 0)
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    Ora italiana, con un margine di un quarto d&apos;ora
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Giorni</Label>
                <div className="flex flex-wrap gap-2">
                  {GIORNI.map((giorno) => (
                    <Button
                      key={giorno.valore}
                      type="button"
                      size="sm"
                      variant={
                        inModifica.daysOfWeek.includes(giorno.valore)
                          ? 'default'
                          : 'outline'
                      }
                      className="w-14"
                      onClick={() => cambiaGiorno(giorno.valore)}
                    >
                      {giorno.etichetta}
                    </Button>
                  ))}
                </div>
              </div>

              <Separator />

              <div className="space-y-2">
                <Label htmlFor="titolo">Titolo della notifica</Label>
                <Input
                  id="titolo"
                  value={inModifica.title}
                  maxLength={80}
                  onChange={(e) => aggiorna('title', e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="testo">Testo della notifica</Label>
                <Textarea
                  id="testo"
                  value={inModifica.body}
                  maxLength={200}
                  rows={2}
                  onChange={(e) => aggiorna('body', e.target.value)}
                />
              </div>

              <div className="flex items-center justify-between gap-4">
                <div>
                  <Label>Salta chi ha già timbrato</Label>
                  <p className="text-sm text-muted-foreground">
                    Nessun avviso a chi ha già registrato la timbratura di oggi
                  </p>
                </div>
                <Switch
                  checked={inModifica.skipIfPunched}
                  onCheckedChange={(scelto) => aggiorna('skipIfPunched', scelto)}
                />
              </div>

              <Separator />

              <div className="space-y-2">
                <Label>Destinatari</Label>
                <p className="text-sm text-muted-foreground">
                  {inModifica.recipientIds.length === 0
                    ? 'Nessuna scelta: lo ricevono tutti i dipendenti con il portale attivo, anche chi verrà assunto in futuro.'
                    : `${inModifica.recipientIds.length} scelti`}
                </p>

                {dipendenti.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Nessun dipendente ha il portale attivo: finché è così il
                    promemoria non raggiungerà nessuno.
                  </p>
                ) : (
                  <div className="max-h-48 overflow-y-auto rounded-md border divide-y">
                    {dipendenti.map((d) => {
                      const scelto = inModifica.recipientIds.includes(d.id)

                      return (
                        <button
                          key={d.id}
                          type="button"
                          onClick={() => cambiaDestinatario(d.id)}
                          className={cn(
                            'flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted',
                            scelto && 'bg-muted font-medium'
                          )}
                        >
                          <span>
                            {d.firstName} {d.lastName}
                          </span>
                          {scelto && <Badge variant="secondary">Scelto</Badge>}
                        </button>
                      )
                    })}
                  </div>
                )}

                {inModifica.recipientIds.length > 0 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => aggiorna('recipientIds', [])}
                  >
                    Torna a tutti i dipendenti
                  </Button>
                )}
              </div>

              <div className="flex items-center justify-between gap-4">
                <div>
                  <Label>Attivo</Label>
                  <p className="text-sm text-muted-foreground">
                    Da spento resta configurato ma non parte
                  </p>
                </div>
                <Switch
                  checked={inModifica.isActive}
                  onCheckedChange={(attivo) => aggiorna('isActive', attivo)}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setInModifica(null)}>
              Annulla
            </Button>
            <Button
              onClick={() => {
                if (!inModifica) return
                salva.mutate(inModifica, {
                  onSuccess: () => toast.success('Promemoria salvato'),
                })
              }}
              disabled={salva.isPending}
            >
              Salva
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
            <AlertDialogTitle>Eliminare il promemoria?</AlertDialogTitle>
            <AlertDialogDescription>
              {daEliminare?.name} non partirà più. Se ti serve solo per un
              periodo, puoi sospenderlo con l&apos;interruttore invece di
              eliminarlo.
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

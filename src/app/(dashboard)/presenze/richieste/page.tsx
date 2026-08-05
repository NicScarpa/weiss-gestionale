'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { it } from 'date-fns/locale'
import { ChevronLeft, Check, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { toast } from 'sonner'

/**
 * Coda di approvazione delle richieste di correzione timbrature.
 * L'approvazione genera le timbrature manuali e chiude l'eventuale anomalia
 * collegata: da qui in poi il cartellino della persona è già aggiornato.
 */

interface Richiesta {
  id: string
  date: string
  requestedClockIn: string | null
  requestedClockOut: string | null
  reason: string
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED'
  reviewNotes: string | null
  createdAt: string
  user: { id: string; firstName: string; lastName: string }
  workLocation: { id: string; name: string } | null
  reviewedBy: { firstName: string; lastName: string } | null
}

const ETICHETTE_STATO: Record<Richiesta['status'], { label: string; className: string }> = {
  PENDING: { label: 'In attesa', className: 'bg-amber-100 text-amber-800' },
  APPROVED: { label: 'Approvata', className: 'bg-green-100 text-green-800' },
  REJECTED: { label: 'Rifiutata', className: 'bg-red-100 text-red-800' },
  CANCELLED: { label: 'Annullata', className: 'bg-gray-100 text-gray-600' },
}

export default function RichiesteCorrezionePage() {
  const queryClient = useQueryClient()
  const [filtroStato, setFiltroStato] = useState<string>('PENDING')
  const [daDecidere, setDaDecidere] = useState<Richiesta | null>(null)
  const [azione, setAzione] = useState<'approva' | 'rifiuta'>('approva')
  const [note, setNote] = useState('')

  const { data: richieste, isLoading, isError } = useQuery<Richiesta[]>({
    queryKey: ['richieste-correzione-admin', filtroStato],
    queryFn: async () => {
      const parametro = filtroStato === 'tutte' ? '' : `?status=${filtroStato}`
      const res = await fetch(`/api/richieste-correzione${parametro}`)
      if (!res.ok) throw new Error('Errore nel caricamento delle richieste')
      const corpo = await res.json()
      return corpo.data
    },
  })

  const decidi = useMutation({
    mutationFn: async () => {
      if (!daDecidere) return
      const res = await fetch(
        `/api/richieste-correzione/${daDecidere.id}/${azione}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reviewNotes: note || null }),
        }
      )
      const corpo = await res.json()
      if (!res.ok) {
        const dettaglio = corpo?.details?.[0]?.message
        throw new Error(dettaglio ?? corpo?.error ?? 'Errore nella decisione')
      }
    },
    onSuccess: () => {
      toast.success(
        azione === 'approva'
          ? 'Richiesta approvata: timbrature registrate'
          : 'Richiesta rifiutata'
      )
      setDaDecidere(null)
      setNote('')
      queryClient.invalidateQueries({ queryKey: ['richieste-correzione-admin'] })
      // Le timbrature generate cambiano presenze e cartellino
      queryClient.invalidateQueries({ queryKey: ['cartellino'] })
      queryClient.invalidateQueries({ queryKey: ['cartellino-riepilogo'] })
    },
    onError: (errore: Error) => toast.error(errore.message),
  })

  const apri = (richiesta: Richiesta, cosa: 'approva' | 'rifiuta') => {
    setDaDecidere(richiesta)
    setAzione(cosa)
    setNote('')
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/presenze">
            <ChevronLeft className="h-5 w-5" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Richieste di correzione
          </h1>
          <p className="text-muted-foreground">
            Timbrature dimenticate proposte dai dipendenti: approvarle le registra
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Stato:</span>
        <Select value={filtroStato} onValueChange={setFiltroStato}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="PENDING">In attesa</SelectItem>
            <SelectItem value="APPROVED">Approvate</SelectItem>
            <SelectItem value="REJECTED">Rifiutate</SelectItem>
            <SelectItem value="CANCELLED">Annullate</SelectItem>
            <SelectItem value="tutte">Tutte</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading && <Skeleton className="h-64 w-full" />}

      {isError && (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Non è stato possibile caricare le richieste. Riprova.
          </CardContent>
        </Card>
      )}

      {richieste && (
        <Card>
          <CardContent className="overflow-x-auto p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Richiedente</TableHead>
                  <TableHead>Giorno</TableHead>
                  <TableHead>Luogo</TableHead>
                  <TableHead>Entrata</TableHead>
                  <TableHead>Uscita</TableHead>
                  <TableHead>Motivo</TableHead>
                  <TableHead>Stato</TableHead>
                  <TableHead className="text-right">Azioni</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {richieste.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={8}
                      className="py-8 text-center text-muted-foreground"
                    >
                      Nessuna richiesta in questo stato
                    </TableCell>
                  </TableRow>
                )}
                {richieste.map((richiesta) => (
                  <TableRow key={richiesta.id}>
                    <TableCell className="font-medium">
                      {richiesta.user.lastName} {richiesta.user.firstName}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {format(parseISO(richiesta.date), 'EEE d MMM', { locale: it })}
                    </TableCell>
                    <TableCell>{richiesta.workLocation?.name ?? ''}</TableCell>
                    <TableCell>
                      {richiesta.requestedClockIn
                        ? format(parseISO(richiesta.requestedClockIn), 'HH:mm')
                        : ''}
                    </TableCell>
                    <TableCell>
                      {richiesta.requestedClockOut
                        ? format(parseISO(richiesta.requestedClockOut), 'HH:mm')
                        : ''}
                    </TableCell>
                    <TableCell className="max-w-[240px] text-sm">
                      {richiesta.reason}
                      {richiesta.reviewNotes && (
                        <div className="text-xs text-muted-foreground">
                          Risposta: {richiesta.reviewNotes}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge className={ETICHETTE_STATO[richiesta.status].className}>
                        {ETICHETTE_STATO[richiesta.status].label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {richiesta.status === 'PENDING' && (
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => apri(richiesta, 'approva')}
                          >
                            <Check className="h-4 w-4 mr-1" />
                            Approva
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => apri(richiesta, 'rifiuta')}
                          >
                            <X className="h-4 w-4 mr-1" />
                            Rifiuta
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Dialog open={daDecidere !== null} onOpenChange={(v) => !v && setDaDecidere(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {azione === 'approva' ? 'Approva la richiesta' : 'Rifiuta la richiesta'}
            </DialogTitle>
            <DialogDescription>
              {daDecidere && (
                <>
                  {daDecidere.user.lastName} {daDecidere.user.firstName} —{' '}
                  {format(parseISO(daDecidere.date), 'EEEE d MMMM', { locale: it })}
                  {daDecidere.requestedClockIn &&
                    ` · entrata ${format(parseISO(daDecidere.requestedClockIn), 'HH:mm')}`}
                  {daDecidere.requestedClockOut &&
                    ` · uscita ${format(parseISO(daDecidere.requestedClockOut), 'HH:mm')}`}
                  {azione === 'approva'
                    ? '. Approvando, le timbrature vengono registrate e il cartellino si aggiorna.'
                    : '.'}
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="note-revisione">
              {azione === 'approva' ? 'Note (facoltative)' : 'Motivo del rifiuto'}
            </Label>
            <Textarea
              id="note-revisione"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder={
                azione === 'approva'
                  ? ''
                  : 'Chi ha chiesto deve capire perché: il motivo è obbligatorio'
              }
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDaDecidere(null)}>
              Annulla
            </Button>
            <Button
              onClick={() => decidi.mutate()}
              disabled={decidi.isPending || (azione === 'rifiuta' && !note.trim())}
            >
              {azione === 'approva' ? 'Approva e registra' : 'Rifiuta'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

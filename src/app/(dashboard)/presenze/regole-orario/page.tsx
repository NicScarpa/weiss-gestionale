'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
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
import { ChevronLeft, Plus, Pencil, Trash2, Clock, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { messaggioErroreApi } from '@/lib/utils/api-error'
import {
  TimekeepingPolicyForm,
  politicaVuota,
  minutiToOrario,
  type PoliticaOrario,
} from '@/components/attendance/TimekeepingPolicyForm'

interface PoliticaSalvata extends PoliticaOrario {
  id: string
  // Il conteggio combacia con la guardia dell'eliminazione, che conta
  // dipendenti e luoghi insieme.
  _count: { users: number; workLocations: number }
}

/**
 * " · 2 dipendenti · 1 luogo": chi usa la regola, omettendo la metà che è a
 * zero. Comprende i luoghi perché è il numero su cui l'eliminazione si blocca.
 */
function descriviAssegnazioni(conteggio: PoliticaSalvata['_count']): string {
  const parti: string[] = []

  if (conteggio.users > 0) {
    parti.push(`${conteggio.users} ${conteggio.users === 1 ? 'dipendente' : 'dipendenti'}`)
  }
  if (conteggio.workLocations > 0) {
    parti.push(
      `${conteggio.workLocations} ${conteggio.workLocations === 1 ? 'luogo' : 'luoghi'}`
    )
  }

  return parti.length > 0 ? ` · ${parti.join(' · ')}` : ''
}

export default function RegoleOrarioPage() {
  const queryClient = useQueryClient()
  const [inModifica, setInModifica] = useState<PoliticaOrario | null>(null)
  const [daEliminare, setDaEliminare] = useState<PoliticaSalvata | null>(null)

  const { data: politiche, isLoading, isError } = useQuery<PoliticaSalvata[]>({
    queryKey: ['politiche-orario'],
    queryFn: async () => {
      const response = await fetch('/api/politiche-orario')
      if (!response.ok) throw new Error('Errore nel caricamento delle regole')
      const dati = await response.json()

      return dati.data ?? []
    },
  })

  const salva = useMutation({
    mutationFn: async (politica: PoliticaOrario) => {
      const modifica = Boolean(politica.id)
      const response = await fetch(
        modifica ? `/api/politiche-orario/${politica.id}` : '/api/politiche-orario',
        {
          method: modifica ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(politica),
        }
      )
      const dati = await response.json()
      if (!response.ok) {
        throw new Error(messaggioErroreApi(dati, 'Errore nel salvataggio'))
      }

      return dati.data
    },
    onSuccess: () => {
      toast.success('Regola salvata')
      queryClient.invalidateQueries({ queryKey: ['politiche-orario'] })
      // La card di ogni luogo mostra il nome della sua regola: senza questa
      // invalidazione resta quello di prima della modifica.
      queryClient.invalidateQueries({ queryKey: ['luoghi-lavoro'] })
      setInModifica(null)
    },
    onError: (errore: Error) => toast.error(errore.message),
  })

  const elimina = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/politiche-orario/${id}`, { method: 'DELETE' })
      const dati = await response.json()
      if (!response.ok) {
        throw new Error(messaggioErroreApi(dati, "Errore nell'eliminazione"))
      }

      return dati
    },
    onSuccess: () => {
      toast.success('Regola eliminata')
      queryClient.invalidateQueries({ queryKey: ['politiche-orario'] })
      queryClient.invalidateQueries({ queryKey: ['luoghi-lavoro'] })
      setDaEliminare(null)
    },
    onError: (errore: Error) => {
      toast.error(errore.message)
      setDaEliminare(null)
    },
  })

  if (inModifica) {
    return (
      <div className="container mx-auto py-6 space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => setInModifica(null)}>
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              {inModifica.id ? 'Modifica regola' : 'Nuova regola'}
            </h1>
            <p className="text-muted-foreground">
              Definisci come le timbrature diventano ore riconosciute
            </p>
          </div>
        </div>

        <TimekeepingPolicyForm
          valore={inModifica}
          onChange={setInModifica}
          onSalva={() => salva.mutate(inModifica)}
          onAnnulla={() => setInModifica(null)}
          isSaving={salva.isPending}
        />
      </div>
    )
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/presenze">
              <ChevronLeft className="h-5 w-5" />
            </Link>
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Regole orario</h1>
            <p className="text-muted-foreground">
              Arrotondamenti, flessibilità, pause e tetti: come le timbrature
              diventano ore da pagare
            </p>
          </div>
        </div>

        <Button onClick={() => setInModifica({ ...politicaVuota })}>
          <Plus className="h-4 w-4 mr-2" />
          Nuova regola
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : isError ? (
        // Un errore di caricamento non è "nessuna regola": invitare a creare la
        // prima porterebbe a duplicare regole che esistono già.
        <Card>
          <CardContent className="py-12 text-center space-y-3">
            <AlertTriangle className="h-10 w-10 mx-auto text-destructive" />
            <div>
              <p className="font-medium">Non è stato possibile caricare le regole</p>
              <p className="text-sm text-muted-foreground">
                Riprova fra poco: le regole esistenti restano in vigore.
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() =>
                queryClient.invalidateQueries({ queryKey: ['politiche-orario'] })
              }
            >
              Riprova
            </Button>
          </CardContent>
        </Card>
      ) : !politiche || politiche.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center space-y-3">
            <Clock className="h-10 w-10 mx-auto text-muted-foreground" />
            <div>
              <p className="font-medium">Nessuna regola configurata</p>
              <p className="text-sm text-muted-foreground">
                Finché non ne esiste una, le ore vengono contate così come sono
                state timbrate, senza arrotondamenti né pause dedotte.
              </p>
            </div>
            <Button onClick={() => setInModifica({ ...politicaVuota })}>
              <Plus className="h-4 w-4 mr-2" />
              Crea la prima regola
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {politiche.map((politica) => (
            <Card key={politica.id}>
              <CardContent className="flex items-center justify-between py-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{politica.name}</span>
                    {politica.isDefault && <Badge variant="secondary">Predefinita</Badge>}
                    {!politica.isActive && <Badge variant="outline">Non attiva</Badge>}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {minutiToOrario(politica.dayStartMinutes)}–
                    {minutiToOrario(politica.dayEndMinutes)}
                    {politica.roundingMinutes > 1 &&
                      ` · arrotondamento ${politica.roundingMinutes} min`}
                    {politica.flexMinutes > 0 &&
                      ` · flessibilità ${politica.flexMinutes} min`}
                    {descriviAssegnazioni(politica._count)}
                  </p>
                </div>

                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() =>
                      setInModifica({
                        ...politica,
                        contractWeeklyHours:
                          politica.contractWeeklyHours === null
                            ? null
                            : Number(politica.contractWeeklyHours),
                        extraBreaks: politica.extraBreaks.map((p) => ({
                          name: p.name,
                          startMinutes: p.startMinutes,
                          endMinutes: p.endMinutes,
                        })),
                      })
                    }
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setDaEliminare(politica)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <AlertDialog
        open={daEliminare !== null}
        onOpenChange={(aperto) => !aperto && setDaEliminare(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare la regola?</AlertDialogTitle>
            <AlertDialogDescription>
              {daEliminare?.name} verrà eliminata. Le ore già calcolate con questa
              regola verranno ricalcolate senza di essa.
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

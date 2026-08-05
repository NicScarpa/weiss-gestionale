'use client'

import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Loader2, Megaphone } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import {
  COMUNICAZIONI_VISIBILI_KEY,
  useComunicazioniVisibili,
} from '@/hooks/useComunicazioni'
import {
  etichettaPriorita,
  formattaGiorno,
  formattaIstante,
  giornoDiScadenza,
  type PrioritaComunicazione,
} from '@/lib/comunicazioni-format'

/**
 * La bacheca: quello che l'azienda comunica a chi lavora.
 *
 * Aprire la pagina vale come "l'ho letta" — è quello che i responsabili
 * leggono nel conteggio delle letture — ma l'evidenza delle non lette resta
 * fino a quando si esce, altrimenti l'elenco cambierebbe sotto gli occhi
 * mentre lo si sta leggendo.
 */

const STILE_PRIORITA: Record<PrioritaComunicazione, string> = {
  NORMAL: 'bg-gray-100 text-gray-600',
  IMPORTANT: 'bg-amber-100 text-amber-800',
  URGENT: 'bg-red-100 text-red-700',
}

export default function PortaleComunicazioniPage() {
  const queryClient = useQueryClient()
  const { data, isLoading } = useComunicazioniVisibili()
  const [nonLetteAllApertura, setNonLetteAllApertura] = useState<Set<string>>(
    new Set()
  )
  const giaSegnalate = useRef(new Set<string>())

  useEffect(() => {
    const comunicazioni = data?.data
    if (!comunicazioni) return

    const daSegnare = comunicazioni.filter(
      (c) => !c.letta && !giaSegnalate.current.has(c.id)
    )
    if (daSegnare.length === 0) return

    for (const comunicazione of daSegnare) {
      giaSegnalate.current.add(comunicazione.id)
    }
    setNonLetteAllApertura((precedenti) => {
      const aggiornate = new Set(precedenti)
      for (const comunicazione of daSegnare) aggiornate.add(comunicazione.id)
      return aggiornate
    })

    // Se la chiamata fallisce resta non letta: la si segna alla prossima
    // apertura, e nel frattempo nessuno perde la comunicazione.
    Promise.allSettled(
      daSegnare.map((comunicazione) =>
        fetch(`/api/comunicazioni/${comunicazione.id}/letta`, { method: 'POST' })
      )
    ).then(() => {
      queryClient.invalidateQueries({ queryKey: COMUNICAZIONI_VISIBILI_KEY })
    })
  }, [data, queryClient])

  const comunicazioni = data?.data ?? []

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-gray-900">Comunicazioni</h2>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      ) : comunicazioni.length === 0 ? (
        <div className="py-12 text-center text-gray-500">
          <Megaphone className="mx-auto mb-3 h-10 w-10 text-gray-300" />
          <p className="text-sm">Nessuna comunicazione al momento</p>
        </div>
      ) : (
        <div className="space-y-3">
          {comunicazioni.map((comunicazione) => {
            const daLeggere =
              nonLetteAllApertura.has(comunicazione.id) || !comunicazione.letta

            return (
              <Card
                key={comunicazione.id}
                className={cn(
                  'rounded-2xl border-gray-100',
                  daLeggere && 'border-gray-900/10 bg-white shadow-sm ring-1 ring-gray-900/5'
                )}
              >
                <CardContent className="space-y-2 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2">
                      {daLeggere && (
                        <span
                          className="h-2 w-2 flex-shrink-0 rounded-full bg-gray-900"
                          aria-label="Non letta"
                        />
                      )}
                      <span
                        className={cn(
                          'text-sm text-gray-900',
                          daLeggere ? 'font-semibold' : 'font-medium'
                        )}
                      >
                        {comunicazione.title}
                      </span>
                    </div>
                    {comunicazione.priority !== 'NORMAL' && (
                      <span
                        className={cn(
                          'flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium',
                          STILE_PRIORITA[comunicazione.priority]
                        )}
                      >
                        {etichettaPriorita(comunicazione.priority)}
                      </span>
                    )}
                  </div>

                  <p className="whitespace-pre-wrap text-sm text-gray-600">
                    {comunicazione.message}
                  </p>

                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-400">
                    <span>{formattaIstante(comunicazione.createdAt)}</span>
                    {comunicazione.eventDate && (
                      <span>
                        Evento del {formattaGiorno(comunicazione.eventDate)}
                      </span>
                    )}
                    {comunicazione.expiresAt && (
                      <span>
                        Fino al{' '}
                        {formattaGiorno(giornoDiScadenza(comunicazione.expiresAt))}
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}

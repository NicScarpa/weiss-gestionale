'use client'

import { useQuery } from '@tanstack/react-query'
import type { PrioritaComunicazione } from '@/lib/comunicazioni-format'

/**
 * Le comunicazioni che l'utente collegato deve vedere: non scadute e
 * indirizzate al suo ruolo. La bacheca e la card della home leggono la stessa
 * lista dalla stessa cache, così il "non lette" della home e i pallini della
 * bacheca non si contraddicono mai.
 */

export interface ComunicazionePortale {
  id: string
  title: string
  message: string
  priority: PrioritaComunicazione
  eventDate: string | null
  expiresAt: string | null
  createdAt: string
  letta: boolean
}

export const COMUNICAZIONI_VISIBILI_KEY = ['comunicazioni', 'visibili']

export function useComunicazioniVisibili() {
  return useQuery<{ data: ComunicazionePortale[] }>({
    queryKey: COMUNICAZIONI_VISIBILI_KEY,
    queryFn: async () => {
      const res = await fetch('/api/comunicazioni?visibili=1')
      if (!res.ok) throw new Error('Errore nel caricamento delle comunicazioni')
      return res.json()
    },
  })
}

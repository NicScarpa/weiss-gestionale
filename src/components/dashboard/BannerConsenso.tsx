'use client'

import { useQuery } from '@tanstack/react-query'
import { AlertTriangle } from 'lucide-react'
import Link from 'next/link'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { PREAVVISO_GIORNI, giorniAllaScadenza } from '@/lib/gocardless/scadenza'

interface Connessione {
  id: string
  istitutoNome: string
  scadeIl: string | null
}

/**
 * Avvisa in cima alla dashboard quando il consenso con la banca sta per
 * scadere, o è già scaduto: alla scadenza la banca smette di rispondere e i
 * movimenti smettono di arrivare, senza che nessuno se ne accorga finché non
 * mancano all'appello.
 *
 * `GET /api/gocardless/collegamenti` risponde solo agli amministratori: per
 * chiunque altro arriva un 403, che qui è indistinguibile da «nessun
 * collegamento» — in entrambi i casi non c'è niente da dire, e il banner
 * resta muto (niente contenitore vuoto, niente errore) invece di mostrare
 * un pannello rotto a chi non può comunque fare nulla al riguardo. Niente
 * retry: un 403 non diventa un 200 riprovando, e staff che apre la
 * dashboard non deve generare tre richieste inutili a ogni visita.
 *
 * Il rinnovo vero si fa dal pannello delle impostazioni, non da qui: un
 * pulsante che manda alla banca da una dashboard, con un clic distratto, è
 * troppo per un avviso.
 */
export function BannerConsenso() {
  const { data, isError } = useQuery({
    queryKey: ['gocardless-collegamento-scadenza'],
    retry: false,
    queryFn: async (): Promise<{ connessione: Connessione | null }> => {
      const res = await fetch('/api/gocardless/collegamenti')
      if (!res.ok) throw new Error('Errore nel caricamento del collegamento')
      return res.json()
    },
  })

  if (isError) return null

  const connessione = data?.connessione
  if (!connessione) return null

  const giorni = giorniAllaScadenza(connessione.scadeIl)
  if (giorni === null || giorni > PREAVVISO_GIORNI) return null

  const scaduto = giorni < 0

  return (
    <Alert variant={scaduto ? 'destructive' : 'default'}>
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>
        {scaduto
          ? `Il consenso con ${connessione.istitutoNome} è scaduto`
          : `Il consenso con ${connessione.istitutoNome} scade fra ${giorni} ${giorni === 1 ? 'giorno' : 'giorni'}`}
      </AlertTitle>
      <AlertDescription>
        <p>
          {scaduto
            ? 'La banca ha smesso di rispondere: i movimenti non arrivano più finché non lo rinnovi.'
            : 'Alla scadenza la banca smette di rispondere e i movimenti smettono di arrivare.'}
        </p>
        <Button asChild size="sm" variant="outline" className="mt-1">
          <Link href="/impostazioni/banche-e-conti">Rinnova collegamento</Link>
        </Button>
      </AlertDescription>
    </Alert>
  )
}

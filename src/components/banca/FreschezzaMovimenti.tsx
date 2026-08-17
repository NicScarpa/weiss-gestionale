'use client'

import { useQuery } from '@tanstack/react-query'
import { AlertTriangle } from 'lucide-react'
import { formatDateShort } from '@/lib/constants'

/**
 * Quanto sono aggiornati i movimenti bancari che si stanno guardando.
 *
 * È la domanda che ci si pone davanti a quei numeri — «me li posso fidare?» —
 * e senza risposta la pagina lascia credere che siano di oggi anche quando la
 * sincronizzazione è ferma da giorni.
 */

/** Oltre questo, un ritardo smette di essere normale e va segnalato. */
export const ORE_PRIMA_DELL_AVVISO = 48

interface ContoSincronizzato {
  bankAccountId: string
  nomeConto: string
  ultimaRiuscita: string | null
}

interface StatoSync {
  conti: ContoSincronizzato[]
}

async function leggiStato(): Promise<StatoSync> {
  const r = await fetch('/api/banca/sincronizzazione')
  if (!r.ok) throw new Error('Errore nel recupero dello stato della sincronizzazione')
  return r.json()
}

export function oreDa(istante: string, adesso: Date): number {
  return (adesso.getTime() - new Date(istante).getTime()) / 3_600_000
}

export function FreschezzaMovimenti() {
  const { data, isPending, isError } = useQuery({
    queryKey: ['banca', 'sincronizzazione'],
    queryFn: leggiStato,
  })

  // Senza collegamento bancario non c'è nulla da dire: la pagina funziona
  // anche con i soli movimenti importati da CSV.
  if (isPending || isError || !data || !Array.isArray(data.conti) || data.conti.length === 0) {
    return null
  }

  const adesso = new Date()

  return (
    <div className="space-y-1 text-xs text-muted-foreground">
      {data.conti.map((conto) => {
        if (!conto.ultimaRiuscita) {
          return (
            <p key={conto.bankAccountId} className="flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" aria-hidden />
              {conto.nomeConto}: mai sincronizzato dalla banca.
            </p>
          )
        }

        const ore = oreDa(conto.ultimaRiuscita, adesso)
        const vecchio = ore > ORE_PRIMA_DELL_AVVISO

        return (
          <p
            key={conto.bankAccountId}
            className={vecchio ? 'flex items-center gap-1 text-amber-600 dark:text-amber-500' : ''}
          >
            {vecchio && <AlertTriangle className="h-3 w-3" aria-hidden />}
            {conto.nomeConto}: aggiornato al {formatDateShort(conto.ultimaRiuscita)}
            {vecchio && ' — più di due giorni fa'}.
          </p>
        )
      })}
    </div>
  )
}

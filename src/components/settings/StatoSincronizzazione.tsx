'use client'

import Link from 'next/link'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatDateShort } from '@/lib/constants'

/**
 * Lo stato della sincronizzazione dei movimenti, per conto acceso.
 *
 * Sta in un componente suo e non dentro `RigaContoBancario` perché risponde a
 * una domanda diversa: quella riga configura *quali* conti importare, questa
 * dice *com'è andata* l'importazione. Sono anche due letture separate dal
 * server, e intrecciarle vorrebbe dire far dipendere la configurazione da una
 * chiamata che può fallire per conto suo.
 */

interface ContoSincronizzato {
  bankAccountId: string
  nomeConto: string
  ultimaRiuscita: string | null
  movimentiUltimaRiuscita: number | null
  /** Tutti i movimenti che la sincronizzazione ha portato per questo conto. */
  movimentiImportati: number
  /** Quelli che aspettano ancora qualcuno nella riconciliazione. */
  daRiconciliare: number
  ultimoEsito: 'OK' | 'ERRORE' | 'LIMITE' | null
  sincronizzazioniRimaste: number
  riapreAlle: string | null
}

interface StatoSync {
  conti: ContoSincronizzato[]
  mailConfigurata: boolean
}

export const chiaveStatoSync = ['banca', 'sincronizzazione'] as const

async function leggiStato(): Promise<StatoSync> {
  const r = await fetch('/api/banca/sincronizzazione')
  if (!r.ok) throw new Error('Errore nel recupero dello stato della sincronizzazione')
  return r.json()
}

function quandoSiRiapre(riapreAlle: string | null): string {
  // Senza l'informazione non se ne inventa una: un «riapre alle» falso è
  // peggio del silenzio, perché qualcuno ci tornerebbe sopra.
  if (!riapreAlle) return 'Il contingente si riapre domani.'
  const quando = new Date(riapreAlle)
  return `Il contingente si riapre alle ${quando.toLocaleTimeString('it-IT', {
    hour: '2-digit',
    minute: '2-digit',
  })}.`
}

export function StatoSincronizzazione() {
  const queryClient = useQueryClient()
  const { data, isPending } = useQuery({ queryKey: chiaveStatoSync, queryFn: leggiStato })

  const sincronizza = useMutation({
    mutationFn: async (bankAccountId: string) => {
      const r = await fetch('/api/banca/sincronizzazione', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bankAccountId }),
      })
      if (!r.ok) throw new Error('Sincronizzazione fallita')
      return r.json()
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: chiaveStatoSync }),
  })

  // Difensivo di proposito: questo blocco vive **dentro** il pannello di
  // configurazione delle connessioni. Una risposta inattesa qui non deve
  // portarsi via la schermata che serve a collegare la banca — se non c'è
  // nulla da dire, non si dice nulla.
  if (isPending) return null
  if (!data || !Array.isArray(data.conti) || data.conti.length === 0) return null

  return (
    <div className="space-y-3 rounded-md border p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">Movimenti</p>
        {!data.mailConfigurata && (
          // Dichiarare il canale spento invece di lasciar credere di essere
          // coperti: è lo stesso errore del rinnovo del consenso, che
          // spegneva l'avviso che avrebbe segnalato il problema.
          <Badge variant="outline" className="text-xs">
            Avvisi via email non configurati
          </Badge>
        )}
      </div>

      {data.conti.map((conto) => {
        const esaurito = conto.sincronizzazioniRimaste === 0
        return (
          <div key={conto.bankAccountId} className="flex flex-wrap items-center gap-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm">{conto.nomeConto}</p>
              <p className="text-xs text-muted-foreground">
                {conto.ultimaRiuscita
                  ? `Ultima sincronizzazione riuscita il ${formatDateShort(conto.ultimaRiuscita)}` +
                    (conto.movimentiUltimaRiuscita !== null
                      ? `, ${conto.movimentiUltimaRiuscita} movimenti nuovi.`
                      : '.')
                  : 'Mai sincronizzato.'}{' '}
                {conto.ultimoEsito === 'ERRORE' && 'L’ultimo tentativo è fallito.'}
              </p>
              {/* «0 movimenti nuovi» è il delta dell'ultimo giro ed è vero anche
                  quando il giro prima ne ha portati duecento: senza il totale,
                  e senza dire dove sono, chi legge conclude che non sia
                  arrivato nulla. I movimenti non entrano nella prima nota:
                  finiscono nella riconciliazione, ed è lì che va indirizzato. */}
              <p className="text-xs text-muted-foreground">
                {conto.movimentiImportati > 0 ? (
                  <>
                    {conto.movimentiImportati} movimenti importati, {conto.daRiconciliare} da
                    riconciliare.{' '}
                    <Link href="/riconciliazione" className="underline underline-offset-2">
                      Vai alla riconciliazione
                    </Link>
                  </>
                ) : (
                  'Nessun movimento importato finora.'
                )}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <p className="text-xs text-muted-foreground">
                {esaurito
                  ? quandoSiRiapre(conto.riapreAlle)
                  : `${conto.sincronizzazioniRimaste} sincronizzazioni disponibili oggi.`}
              </p>
              <Button
                variant="outline"
                size="sm"
                disabled={esaurito || sincronizza.isPending}
                onClick={() => sincronizza.mutate(conto.bankAccountId)}
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                Sincronizza ora
              </Button>
            </div>
          </div>
        )
      })}
    </div>
  )
}

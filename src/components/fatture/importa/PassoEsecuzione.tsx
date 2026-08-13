'use client'

/**
 * Passo 3 del wizard: manda le fatture scelte al server una per volta, in
 * serie — mai in blocco. È quello che permette una barra di avanzamento
 * onesta (ogni file elaborato aggiorna subito i contatori) e un pulsante di
 * interruzione che smette davvero fra una fattura e la successiva, invece di
 * dover aspettare che l'intero lotto torni dal server.
 *
 * Il payload per riga porta solo `xmlContent`: nessun invio in blocco dei 226
 * file insieme, che sul lotto reale saturerebbe la richiesta.
 */
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Loader2Icon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ETICHETTE_STATO, type OpzioniImport, type StatoRiga } from './tipi'
import type { SceltaConflitto } from './DialogConflitti'
import type { RigaAnteprima } from './PassoAnteprima'
import type { EsitoRiga } from './RiepilogoFinale'

interface Props {
  righe: RigaAnteprima[]
  opzioni: OpzioniImport
  scelteConflitti: Record<string, SceltaConflitto>
  onFinito: (esiti: EsitoRiga[]) => void
}

function esitoDiRiga(riga: RigaAnteprima, stato: StatoRiga, messaggio?: string): EsitoRiga {
  return {
    chiave: riga.chiave,
    nomeFile: riga.nomeFile,
    numero: riga.numero,
    denominazioneFornitore: riga.denominazioneFornitore,
    stato,
    messaggio,
    fattura: riga,
  }
}

export function PassoEsecuzione({ righe, opzioni, scelteConflitti, onFinito }: Props) {
  const [fatte, setFatte] = useState<EsitoRiga[]>([])
  const interrompi = useRef(false)

  useEffect(() => {
    let vivo = true
    // Accumulo locale: `fatte` dentro questo effetto resta congelato al
    // valore del primo render (closure), quindi `onFinito` non può leggerlo.
    const raccolti: EsitoRiga[] = []

    const aggiungi = (esito: EsitoRiga) => {
      raccolti.push(esito)
      setFatte((precedenti) => [...precedenti, esito])
    }

    const esegui = async () => {
      for (const riga of righe) {
        if (interrompi.current || !vivo) break

        if (riga.esclusa) {
          aggiungi(esitoDiRiga(riga, 'esclusa'))
          continue
        }

        try {
          const res = await fetch('/api/invoices', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              xmlContent: riga.xmlContent,
              fileName: riga.nomeFile,
              venueId: 'auto',
              createSupplier: true,
              politicaDuplicati: opzioni.politicaDuplicati,
              sovrascriviAnagrafica: opzioni.sovrascriviAnagrafica,
              ...(scelteConflitti[riga.partitaIvaFornitore] !== 'anagrafica' &&
              riga.giorniDalFile !== null
                ? { giorniPagamentoScelti: riga.giorniDalFile }
                : {}),
            }),
          })

          if (res.status === 409) {
            // I tre 409 non sono la stessa cosa: con «salta» è l'esito atteso
            // (già in archivio, si conta come duplicata); con «sostituisci» è
            // un rifiuto vero (fattura registrata o scadenze già pagate), da
            // mostrare come errore col messaggio del server.
            if (opzioni.politicaDuplicati === 'salta') {
              aggiungi(esitoDiRiga(riga, 'duplicata'))
            } else {
              const corpo = await res.json()
              aggiungi(esitoDiRiga(riga, 'errore', corpo.error))
            }
            continue
          }
          if (!res.ok) {
            const corpo = await res.json()
            aggiungi(esitoDiRiga(riga, 'errore', corpo.error))
            continue
          }
          aggiungi(esitoDiRiga(riga, 'importata'))
        } catch (errore) {
          aggiungi(
            esitoDiRiga(riga, 'errore', errore instanceof Error ? errore.message : 'Errore di rete')
          )
        }
      }

      if (vivo) onFinito(raccolti)
    }

    void esegui()
    return () => {
      vivo = false
    }
    // Va eseguito una sola volta, all'ingresso nel passo: le dipendenze
    // (righe, opzioni, scelteConflitti) non cambiano durante l'esecuzione.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const importate = fatte.filter((f) => f.stato === 'importata').length
  const duplicate = fatte.filter((f) => f.stato === 'duplicata').length
  const errori = fatte.filter((f) => f.stato === 'errore').length
  const rimanenti = righe.length - fatte.length
  const percentuale = righe.length === 0 ? 100 : Math.round((fatte.length / righe.length) * 100)
  const ultimeInCima = [...fatte].reverse()

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-3 text-center">
        <div className="rounded-lg border p-3">
          <p className="text-2xl font-semibold">{importate}</p>
          <p className="text-sm text-muted-foreground">Importate</p>
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-2xl font-semibold">{duplicate}</p>
          <p className="text-sm text-muted-foreground">Duplicate</p>
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-2xl font-semibold">{errori}</p>
          <p className="text-sm text-muted-foreground">Errori</p>
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-2xl font-semibold">{rimanenti}</p>
          <p className="text-sm text-muted-foreground">Rimanenti</p>
        </div>
      </div>

      <div className="space-y-2">
        <Progress value={percentuale} />
        <p className="text-sm text-muted-foreground">
          {fatte.length} di {righe.length} file elaborati
        </p>
      </div>

      <div className="max-h-[40vh] overflow-y-auto rounded-lg border">
        <ul className="divide-y">
          {ultimeInCima.map((esito) => (
            <li key={esito.chiave} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <span className="truncate" title={esito.nomeFile}>{esito.nomeFile}</span>
              <span
                className={cn(
                  'shrink-0 font-medium',
                  esito.stato === 'errore' && 'text-destructive',
                  esito.stato === 'importata' && 'text-primary'
                )}
              >
                {ETICHETTE_STATO[esito.stato]}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex items-center justify-between">
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          {rimanenti > 0 && (
            <>
              <Loader2Icon className="h-4 w-4 animate-spin" />
              Importazione in corso…
            </>
          )}
        </p>
        <Button
          variant="outline"
          onClick={() => {
            interrompi.current = true
          }}
          disabled={rimanenti === 0}
        >
          Annulla importazione
        </Button>
      </div>
    </div>
  )
}

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
import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Loader2Icon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { normalizzaPartitaIva } from '@/lib/invoices/partita-iva'
import { ETICHETTE_STATO, type OpzioniImport, type StatoRiga } from './tipi'
import type { ConflittoTermini, SceltaConflitto } from './DialogConflitti'
import type { RigaAnteprima } from './PassoAnteprima'
import type { EsitoRiga } from './RiepilogoFinale'

interface Props {
  righe: RigaAnteprima[]
  opzioni: OpzioniImport
  scelteConflitti: Record<string, SceltaConflitto>
  /** Gli stessi conflitti mostrati in `DialogConflitti`: qui servono solo per
   * recuperare `giorniAnagrafica` di un fornitore quando l'utente ha scelto
   * di farla vincere. */
  conflitti: ConflittoTermini[]
  onFinito: (esiti: EsitoRiga[]) => void
}

function esitoDiRiga(
  riga: RigaAnteprima,
  stato: StatoRiga,
  messaggio?: string,
  creazione?: { fornitoreCreato: boolean }
): EsitoRiga {
  return {
    chiave: riga.chiave,
    nomeFile: riga.nomeFile,
    numero: riga.numero,
    denominazioneFornitore: riga.denominazioneFornitore,
    stato,
    messaggio,
    fattura: riga,
    fornitoreCreato: creazione?.fornitoreCreato ?? false,
  }
}

export function PassoEsecuzione({ righe, opzioni, scelteConflitti, conflitti, onFinito }: Props) {
  const [fatte, setFatte] = useState<EsitoRiga[]>([])
  const interrompi = useRef(false)
  // `avviato` sopravvive alla doppia invocazione dell'effetto di Strict
  // Mode: garantisce che il ciclo sotto parta una sola volta. `vivo` è
  // *diverso* dal flag locale usato prima del fix (era una `let` dentro
  // l'effetto, azzerata per sempre dalla prima cleanup): qui è un ref
  // condiviso che la seconda invocazione resuscita, così il ciclo avviato
  // dalla prima invocazione continua a vedersi «vivo» anche dopo la
  // cleanup fantasma di Strict Mode.
  const avviato = useRef(false)
  const vivo = useRef(true)

  // Le due mappe sono chiavate sulla P.IVA *normalizzata*, e così vengono
  // interrogate più sotto. Non è pignoleria: la rotta dei conflitti raggruppa
  // sulla forma senza zeri iniziali e restituisce quella, mentre
  // `riga.partitaIvaFornitore` è la forma grezza del documento. Cercando con
  // la grezza, per ogni fornitore con la P.IVA che inizia per zero il lookup
  // dava `undefined` e la scelta fatta nella finestra dei conflitti veniva
  // scartata senza un errore. Normalizzando entrambi i lati il disallineamento
  // non può ripresentarsi, da qualunque forma arrivi la risposta.
  const giorniAnagraficaPerFornitore = useMemo(
    () =>
      Object.fromEntries(
        conflitti.map((c) => [normalizzaPartitaIva(c.partitaIva), c.giorniAnagrafica])
      ),
    [conflitti]
  )

  const scelteNormalizzate = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(scelteConflitti).map(([piva, scelta]) => [
          normalizzaPartitaIva(piva),
          scelta,
        ])
      ),
    [scelteConflitti]
  )

  useEffect(() => {
    // Guardia contro il doppio effetto di React Strict Mode (attivo di
    // default in sviluppo su App Router): al primo mount React monta
    // l'effetto, lo smonta e lo rimonta subito per scovare effetti non
    // idempotenti. Senza questa guardia, la seconda invocazione avviava un
    // secondo ciclo che rimandava la stessa prima riga al server: chi dei
    // due arrivava secondo si beccava il 409 dell'altro e una fattura
    // appena creata appariva come duplicata. `avviato` sopravvive fra le
    // due invocazioni (è un ref), quindi il ciclo vero parte una sola
    // volta; ma la cleanup dev'essere comunque quella «giusta», capace di
    // fermare il ciclo quando il componente smonta per davvero — perciò la
    // seconda invocazione, pur non avviando nulla, resuscita `vivo.current`
    // (che la cleanup della prima invocazione aveva appena spento) e
    // registra la cleanup che conterà da qui in avanti.
    vivo.current = true
    if (avviato.current) {
      return () => {
        vivo.current = false
      }
    }
    avviato.current = true

    // Accumulo locale: `fatte` dentro questo effetto resta congelato al
    // valore del primo render (closure), quindi `onFinito` non può leggerlo.
    const raccolti: EsitoRiga[] = []

    const aggiungi = (esito: EsitoRiga) => {
      raccolti.push(esito)
      setFatte((precedenti) => [...precedenti, esito])
    }

    const esegui = async () => {
      for (const riga of righe) {
        if (interrompi.current || !vivo.current) break

        if (riga.esclusa) {
          aggiungi(esitoDiRiga(riga, 'esclusa'))
          continue
        }

        try {
          // Con la scelta «anagrafica» il server ora impone i giorni scelti
          // ignorando la data del documento: vanno mandati solo in quel
          // caso, col valore concordato in anagrafica — mai `giorniDalFile`,
          // che vincerebbe da sé restando muti (la data del documento).
          const pivaFornitore = normalizzaPartitaIva(riga.partitaIvaFornitore)
          const scelta = scelteNormalizzate[pivaFornitore]
          const giorniAnagrafica = giorniAnagraficaPerFornitore[pivaFornitore]

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
              ...(scelta === 'anagrafica' && giorniAnagrafica !== undefined
                ? { giorniPagamentoScelti: giorniAnagrafica }
                : {}),
            }),
          })

          // Il componente potrebbe essere smontato per davvero mentre la
          // fetch era in volo: non tocchiamo più stato né proseguiamo.
          if (!vivo.current) break

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
          // Dalla 201 serve solo `fornitoreCreato`, che il client non può
          // dedurre da sé. L'id della fattura appena creata non si tiene: il
          // riepilogo verifica rileggendo dal server cosa esiste, non
          // ricontando ciò che il client crede di aver fatto.
          const corpoCreata = await res.json()
          aggiungi(
            esitoDiRiga(riga, 'importata', undefined, {
              fornitoreCreato: corpoCreata.fornitoreCreato === true,
            })
          )
        } catch (errore) {
          if (!vivo.current) break
          aggiungi(
            esitoDiRiga(riga, 'errore', errore instanceof Error ? errore.message : 'Errore di rete')
          )
        }
      }

      if (vivo.current) onFinito(raccolti)
    }

    void esegui()
    return () => {
      vivo.current = false
    }
    // Va eseguito una sola volta, all'ingresso nel passo: le dipendenze
    // (righe, opzioni, scelteConflitti, conflitti) non cambiano durante
    // l'esecuzione.
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
            <li key={esito.chiave} className="flex flex-col gap-0.5 px-3 py-2 text-sm">
              <div className="flex items-center justify-between gap-3">
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
              </div>
              {esito.stato === 'errore' && esito.messaggio && (
                <p className="text-xs text-destructive">{esito.messaggio}</p>
              )}
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

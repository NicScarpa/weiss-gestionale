'use client'

import * as React from 'react'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
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
import { formatCurrency } from '@/lib/formatters'
import { SOGLIE, fascia, type Fascia } from '@/lib/reconciliation/scala'
import {
  importoNumerico,
  type ContatoriLotto,
  type PropostaDiRiconciliazione,
} from '@/types/riconciliazione-assistita'
import { SchedaProposta } from './SchedaProposta'

/**
 * La coda: le proposte ancora da decidere, dalla più convincente.
 *
 * Un solo filtro, la fascia, e un solo ordine, il punteggio decrescente. Chi
 * lavora una coda vuole la prossima decisione, non un pannello di controllo.
 *
 * **I conteggi e la lista contano la stessa cosa.** `Alta + Media + Bassa` fa
 * esattamente «in attesa» perché entrambi contano proposte: è il difetto più
 * visibile di CashKing — dieci proposte totali, i filtri che ne sommano una e
 * «In attesa: 0» con nove abbinamenti da decidere — e nasce dal contare
 * proposte in un posto e schede in un altro. Per la stessa ragione, quando la
 * coda è ristretta a un solo movimento i conteggi si ricalcolano su quel
 * sottoinsieme invece di mostrare quelli dell'intero lotto: sarebbero due unità
 * di misura nella stessa schermata.
 */

export type FiltroFascia = 'tutte' | Fascia

interface Props {
  /** Tutte le proposte del lotto: qui dentro si tengono solo quelle da decidere. */
  proposte: PropostaDiRiconciliazione[]
  contatori: ContatoriLotto
  fascia: FiltroFascia
  onFascia: (fascia: FiltroFascia) => void
  onApprova: (id: string) => Promise<void>
  onScarta: (id: string, opzioni: { perSempre: boolean; motivo?: string }) => Promise<void>
  /** Con un id, la coda mostra solo le proposte di quella riga bancaria. */
  movimento?: string | null
  /**
   * Senza questa, la coda funziona esattamente come prima e non mostra alcuna
   * casella: la selezione è una capacità in più, non un cambio di
   * funzionamento.
   */
  onApprovaInBlocco?: (ids: string[]) => Promise<void>
}

const ETICHETTE: Array<{ valore: FiltroFascia; testo: string }> = [
  { valore: 'tutte', testo: 'Tutte' },
  { valore: 'alta', testo: 'Alta' },
  { valore: 'media', testo: 'Media' },
  { valore: 'bassa', testo: 'Bassa' },
]

/** La soglia scritta accanto al filtro, presa da `SOGLIE` e non ricopiata. */
const INTERVALLO: Record<FiltroFascia, string> = {
  tutte: '',
  alta: `≥ ${SOGLIE.ALTA}`,
  media: `${SOGLIE.MEDIA}–${SOGLIE.ALTA - 1}`,
  bassa: `< ${SOGLIE.MEDIA}`,
}

export function CodaProposte({
  proposte,
  contatori,
  fascia: fasciaScelta,
  onFascia,
  onApprova,
  onScarta,
  movimento,
  onApprovaInBlocco,
}: Props) {
  const inAttesa = React.useMemo(() => {
    const daDecidere = proposte.filter((p) => p.stato === 'in_attesa')
    const ristrette = movimento
      ? daDecidere.filter((p) => p.bankTransaction?.id === movimento)
      : daDecidere
    return [...ristrette].sort((a, b) => b.punteggio - a.punteggio)
  }, [proposte, movimento])

  // Ristretti a un movimento, i contatori del lotto direbbero un'altra cosa da
  // quella che si vede: allora li si ricalcola su ciò che si vede.
  const conteggi = React.useMemo(() => {
    if (!movimento) {
      return {
        tutte: contatori.inAttesa,
        alta: contatori.alta,
        media: contatori.media,
        bassa: contatori.bassa,
      }
    }
    return {
      tutte: inAttesa.length,
      alta: inAttesa.filter((p) => fascia(p.punteggio) === 'alta').length,
      media: inAttesa.filter((p) => fascia(p.punteggio) === 'media').length,
      bassa: inAttesa.filter((p) => fascia(p.punteggio) === 'bassa').length,
    }
  }, [movimento, contatori, inAttesa])

  const visibili =
    fasciaScelta === 'tutte' ? inAttesa : inAttesa.filter((p) => fascia(p.punteggio) === fasciaScelta)

  const [selezionate, setSelezionate] = React.useState<ReadonlySet<string>>(new Set())
  const [chiedeConferma, setChiedeConferma] = React.useState(false)
  const [inCorso, setInCorso] = React.useState(false)

  // La selezione vive sugli id, non sugli indici, e si restringe da sé a ciò
  // che è ancora visibile: cambiando fascia o dopo un'approvazione, una
  // selezione che sopravvive a schermate diverse farebbe partire un'azione su
  // proposte che chi guarda non ha più davanti.
  const scelte = React.useMemo(
    () => visibili.filter((p) => selezionate.has(p.id)),
    [visibili, selezionate]
  )

  const totale = scelte.reduce((somma, p) => somma + Math.abs(importoNumerico(p.bankTransaction?.amount)), 0)

  const commuta = (id: string) =>
    setSelezionate((prima) => {
      const dopo = new Set(prima)
      if (dopo.has(id)) dopo.delete(id)
      else dopo.add(id)
      return dopo
    })

  const tutteVisibiliScelte = visibili.length > 0 && scelte.length === visibili.length

  const commutaTutte = () =>
    setSelezionate(tutteVisibiliScelte ? new Set() : new Set(visibili.map((p) => p.id)))

  const approvaScelte = async () => {
    if (!onApprovaInBlocco) return
    setInCorso(true)
    try {
      await onApprovaInBlocco(scelte.map((p) => p.id))
      setSelezionate(new Set())
      setChiedeConferma(false)
    } finally {
      setInCorso(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground tabular-nums">{conteggi.tutte}</span>{' '}
          {conteggi.tutte === 1 ? 'proposta in attesa' : 'proposte in attesa'}
          {movimento ? ' su questo movimento' : ''}
          {contatori.approvate > 0 || contatori.scartate > 0 || contatori.superate > 0 ? (
            <>
              {' '}
              · {contatori.approvate} approvate · {contatori.scartate} scartate ·{' '}
              {contatori.superate} superate
            </>
          ) : null}
        </p>

        <Tabs value={fasciaScelta} onValueChange={(v) => onFascia(v as FiltroFascia)}>
          <TabsList>
            {ETICHETTE.map(({ valore, testo }) => (
              <TabsTrigger key={valore} value={valore} title={INTERVALLO[valore] || undefined}>
                {testo} ({conteggi[valore]})
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {onApprovaInBlocco && visibili.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/50 px-3 py-2">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              data-seleziona-tutte=""
              checked={tutteVisibiliScelte}
              onCheckedChange={commutaTutte}
              aria-label={`Seleziona tutte le proposte in questa fascia (${visibili.length})`}
            />
            Seleziona tutte ({visibili.length})
          </label>

          {scelte.length > 0 && (
            <>
              <span className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground tabular-nums">{scelte.length}</span>{' '}
                selezionate ·{' '}
                <span className="font-medium text-foreground tabular-nums">
                  {formatCurrency(totale)}
                </span>
              </span>
              <Button size="sm" className="ml-auto" onClick={() => setChiedeConferma(true)}>
                Approva selezionate
              </Button>
            </>
          )}
        </div>
      )}

      {visibili.length === 0 ? (
        <p className="rounded-lg border bg-card p-6 text-center text-sm text-muted-foreground">
          {movimento
            ? 'Nessuna proposta per questo movimento in questo lotto.'
            : 'Nessuna proposta in attesa in questa fascia.'}
        </p>
      ) : (
        <div className="space-y-4">
          {visibili.map((proposta, indice) => (
            <div key={proposta.id} className="flex items-start gap-3">
              {onApprovaInBlocco && (
                <Checkbox
                  data-selezione-proposta=""
                  className="mt-6"
                  checked={selezionate.has(proposta.id)}
                  onCheckedChange={() => commuta(proposta.id)}
                  aria-label={`Seleziona la proposta da ${formatCurrency(
                    Math.abs(importoNumerico(proposta.bankTransaction?.amount))
                  )}`}
                />
              )}
              <div className="min-w-0 flex-1">
                <SchedaProposta
                  proposta={proposta}
                  onApprova={onApprova}
                  onScarta={onScarta}
                  // La prima è quella su cui si sta decidendo: la coda è a scheda
                  // singola nel senso che l'attenzione va in un posto solo.
                  inEvidenza={indice === 0}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      <AlertDialog open={chiedeConferma} onOpenChange={setChiedeConferma}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Approvare {scelte.length} {scelte.length === 1 ? 'proposta' : 'proposte'}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Nascono {scelte.length === 1 ? 'un movimento' : `${scelte.length} movimenti`} di prima
              nota per <strong>{formatCurrency(totale)}</strong> e le scadenze abbinate risultano
              pagate. Se due proposte scelte riguardano la stessa riga bancaria, vale quella col
              punteggio più alto e l&apos;altra viene segnata come superata.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={inCorso}>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                // Il dialogo non si chiude da sé: resta aperto finché il server
                // non ha risposto, così un blocco lungo non sembra finito
                // mentre sta ancora scrivendo in prima nota.
                e.preventDefault()
                void approvaScelte()
              }}
              disabled={inCorso}
            >
              {inCorso ? 'Approvo…' : 'Approva'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

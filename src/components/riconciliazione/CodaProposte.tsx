'use client'

import * as React from 'react'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { SOGLIE, fascia, type Fascia } from '@/lib/reconciliation/scala'
import type { ContatoriLotto, PropostaDiRiconciliazione } from '@/types/riconciliazione-assistita'
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

      {visibili.length === 0 ? (
        <p className="rounded-lg border bg-card p-6 text-center text-sm text-muted-foreground">
          {movimento
            ? 'Nessuna proposta per questo movimento in questo lotto.'
            : 'Nessuna proposta in attesa in questa fascia.'}
        </p>
      ) : (
        <div className="space-y-4">
          {visibili.map((proposta, indice) => (
            <SchedaProposta
              key={proposta.id}
              proposta={proposta}
              onApprova={onApprova}
              onScarta={onScarta}
              // La prima è quella su cui si sta decidendo: la coda è a scheda
              // singola nel senso che l'attenzione va in un posto solo.
              inEvidenza={indice === 0}
            />
          ))}
        </div>
      )}
    </div>
  )
}

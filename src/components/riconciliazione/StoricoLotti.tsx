'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { formatDateShort } from '@/lib/constants'
import type { LottoNelloStorico } from '@/types/riconciliazione-assistita'

/**
 * Le analisi già calcolate, dalla più recente.
 *
 * Il lavoro di riconciliazione è lungo e si interrompe: dodici proposte non si
 * decidono in una sessione sola. È questa la ragione per cui il lotto si
 * persiste invece di vivere nella pagina — e lo storico è la porta per
 * rientrarci. Senza, l'unico modo di tornare su un lotto sarebbe ricalcolarne
 * un altro sullo stesso periodo, che rifà il lavoro già deciso.
 *
 * **«Riprendi» è un link, non un bottone con dello stato dietro.** Lo stato
 * della coda vive in `?lotto=`, quindi riprendere significa cambiare indirizzo:
 * l'URL si può anche incollare in una chat, e il tasto Indietro funziona.
 */

interface Props {
  lotti: LottoNelloStorico[]
}

/** Decise = tutte quelle che non aspettano più una risposta, superate comprese. */
function percentualeDecisa(lotto: LottoNelloStorico): number | null {
  if (lotto.contaProposte <= 0) return null
  const decise = lotto.contaApprovate + lotto.contaScartate + lotto.contaSuperate
  return Math.round((decise / lotto.contaProposte) * 100)
}

export function StoricoLotti({ lotti }: Props) {
  // Alla prima visita non c'è nessuna analisi: una sezione vuota intitolata
  // «Analisi già fatte» direbbe solo che manca qualcosa.
  if (lotti.length === 0) return null

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
        Analisi già fatte
      </h2>
      <ul className="divide-y rounded-lg border bg-card text-card-foreground">
        {lotti.map((lotto) => {
          const percentuale = percentualeDecisa(lotto)
          return (
            <li
              key={lotto.id}
              className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  Dal {formatDateShort(lotto.dateFrom)} al {formatDateShort(lotto.dateTo)}
                </p>
                <p className="text-sm text-muted-foreground">
                  {percentuale === null ? (
                    'Nessuna proposta'
                  ) : (
                    <>
                      <span className="tabular-nums">{lotto.contaProposte}</span> proposte ·{' '}
                      <span className="tabular-nums">{lotto.contaApprovate}</span> approvate ·{' '}
                      <span className="tabular-nums">{lotto.contaScartate}</span> scartate
                      {lotto.contaSuperate > 0 ? (
                        <>
                          {' '}
                          · <span className="tabular-nums">{lotto.contaSuperate}</span> superate
                        </>
                      ) : null}{' '}
                      · <span className="tabular-nums">{percentuale}</span>% deciso
                    </>
                  )}
                </p>
              </div>
              <Button asChild variant="outline" size="sm" className="shrink-0">
                <Link href={`/riconciliazione?lotto=${lotto.id}`}>Riprendi</Link>
              </Button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

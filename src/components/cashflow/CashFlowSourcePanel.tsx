'use client'

import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { formatCurrency } from '@/lib/constants'
import { ArrowRight, CalendarSync, Equal, Minus, Plus } from 'lucide-react'
import { giornoItaliano } from './previsioni'

/**
 * «Come nasce la previsione»: la catena di numeri che porta dal saldo di oggi
 * al saldo previsto, con l'elenco delle spese ricorrenti che ne fanno parte.
 *
 * Serve a rispondere alla domanda che la card da sola non può soddisfare —
 * *da dove viene questa cifra* — e a chiudere il cerchio con la pagina delle
 * spese ricorrenti: finché quell'elenco era irraggiungibile, le uscite fisse
 * non entravano nella previsione e nessuno poteva accorgersene.
 */

const GIORNI = 30

interface RispostaForecast {
  currentBalance: { cash: number; bank: number; total: number }
  forecast: Array<{
    date: string
    projectedBalance: number
    expenses: Array<{ name: string; amount: number }>
  }>
  summary: {
    totalExpectedIncome: number
    totalExpectedExpenses: number
    minBalance: number
    minBalanceDate: string
  }
}

interface CashFlowSourcePanelProps {
  /** «Previsione 30gg» delle card, per dire come si rapporta a questa. */
  previsioneMedia?: number
}

/** Le spese dei singoli giorni raccolte per nome: quante volte, per quanto. */
function raggruppaSpese(forecast: RispostaForecast['forecast']) {
  const perNome = new Map<string, { nome: string; volte: number; totale: number }>()

  for (const giorno of forecast) {
    for (const spesa of giorno.expenses) {
      const corrente = perNome.get(spesa.name) ?? { nome: spesa.name, volte: 0, totale: 0 }
      perNome.set(spesa.name, {
        nome: spesa.name,
        volte: corrente.volte + 1,
        totale: corrente.totale + spesa.amount,
      })
    }
  }

  return Array.from(perNome.values()).sort((a, b) => b.totale - a.totale)
}

export function CashFlowSourcePanel({ previsioneMedia }: CashFlowSourcePanelProps) {
  const { data, isLoading } = useQuery({
    queryKey: ['cashflow', 'composizione', GIORNI],
    queryFn: async (): Promise<RispostaForecast> => {
      const risposta = await fetch(`/api/dashboard/forecast?days=${GIORNI}`)
      if (!risposta.ok) throw new Error('Impossibile caricare la composizione della previsione')
      return risposta.json()
    },
  })

  if (isLoading || !data) {
    return <Skeleton className="h-56 rounded-lg" />
  }

  const spese = raggruppaSpese(data.forecast)
  const saldoPrevisto = data.forecast.at(-1)?.projectedBalance ?? data.currentBalance.total

  const passaggi = [
    { etichetta: 'Liquidità di oggi', valore: data.currentBalance.total, segno: null },
    {
      etichetta: `Incassi attesi in ${GIORNI} giorni`,
      valore: data.summary.totalExpectedIncome,
      segno: 'piu' as const,
    },
    {
      etichetta: 'Spese ricorrenti in scadenza',
      valore: data.summary.totalExpectedExpenses,
      segno: 'meno' as const,
    },
    { etichetta: `Saldo previsto fra ${GIORNI} giorni`, valore: saldoPrevisto, segno: 'uguale' as const },
  ]

  return (
    <Card>
      <CardHeader>
        <CardTitle>Come nasce la previsione</CardTitle>
        <p className="text-sm text-muted-foreground">
          Dal saldo di oggi — lo stesso della card qui sopra — agli incassi che lo storico fa
          attendere, meno le spese ricorrenti che cadranno nei prossimi {GIORNI} giorni.
        </p>
      </CardHeader>

      <CardContent className="space-y-5">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {passaggi.map((passo) => (
            <div key={passo.etichetta} className="rounded-lg border p-3">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                {passo.segno === 'piu' && <Plus className="h-3 w-3 text-green-600" />}
                {passo.segno === 'meno' && <Minus className="h-3 w-3 text-red-600" />}
                {passo.segno === 'uguale' && <Equal className="h-3 w-3" />}
                <span>{passo.etichetta}</span>
              </div>
              <p
                className={`mt-1 font-mono text-lg font-semibold break-words ${
                  passo.segno === 'piu'
                    ? 'text-green-600'
                    : passo.segno === 'meno'
                      ? 'text-red-600'
                      : ''
                }`}
              >
                {formatCurrency(passo.valore)}
              </p>
            </div>
          ))}
        </div>

        {data.summary.minBalance < data.currentBalance.total && (
          <p className="text-sm text-muted-foreground">
            Il punto più basso del periodo è {formatCurrency(data.summary.minBalance)}, intorno al{' '}
            {giornoItaliano(data.summary.minBalanceDate)}.
          </p>
        )}

        {/* Le due previsioni della pagina rispondono a due domande diverse. Non
            dirlo lascerebbe l'utente davanti a due cifre discordi senza una
            spiegazione, che è il modo più rapido per non fidarsi di nessuna. */}
        {previsioneMedia !== undefined && (
          <p className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
            La card «Previsione 30gg» ({formatCurrency(previsioneMedia)}) estrapola l&apos;andamento
            medio dei movimenti già registrati. Il conto qui sopra parte invece dalle voci note
            una per una: incassi storici dello stesso periodo e spese ricorrenti in scadenza.
            Sono due letture della stessa cassa, non due misure della stessa cosa.
          </p>
        )}

        <div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="flex items-center gap-2 text-sm font-medium">
              <CalendarSync className="h-4 w-4 text-muted-foreground" />
              Spese ricorrenti nel periodo
            </h3>
            <Button variant="ghost" size="sm" asChild className="gap-1">
              <Link href="/spese-ricorrenti">
                Gestisci
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>

          {spese.length === 0 ? (
            <p className="mt-2 rounded-md border border-dashed p-3 text-sm text-muted-foreground">
              Nessuna spesa ricorrente configurata: la previsione considera solo gli incassi
              attesi, e le uscite fisse — affitto, utenze, canoni — non pesano su questo saldo.{' '}
              <Link href="/spese-ricorrenti" className="font-medium underline">
                Aggiungile qui
              </Link>{' '}
              perché ne tenga conto.
            </p>
          ) : (
            <ul className="mt-2 divide-y rounded-md border">
              {spese.map((spesa) => (
                <li
                  key={spesa.nome}
                  className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm"
                >
                  <span className="min-w-0 break-words">
                    {spesa.nome}
                    {spesa.volte > 1 && (
                      <span className="text-muted-foreground"> · {spesa.volte} scadenze</span>
                    )}
                  </span>
                  <span className="font-mono font-medium text-red-600">
                    -{formatCurrency(spesa.totale)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

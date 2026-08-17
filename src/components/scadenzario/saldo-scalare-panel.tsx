"use client"

import { useState } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { SaldoScalareChart } from './saldo-scalare-chart'
import { formatCurrency } from '@/lib/formatters'
import { format, parseISO, addDays } from 'date-fns'
import { it } from 'date-fns/locale'
import { Info, Loader2, X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SaldoScalareData {
  saldoOggi: number
  pagamenti: { totale: number; ricorrenti: number }
  incassi: { totale: number; ricorrenti: number }
  saldoFinale: number
  scaduto: { daPagare: number; daIncassare: number; saldoFinaleIncluso: number }
  chartData: Array<{
    date: string
    saldo: number
    uscite: number
    entrate: number
    usciteRicorrenti: number
    entrateRicorrenti: number
  }>
  range: { from: string; to: string }
}

interface SaldoScalarePanelProps {
  visible: boolean
}

/** Quanto storico mostrare prima di oggi: 0 = solo futuro, come prima. */
const ANCORE = [
  { valore: 0, etichetta: 'Oggi' },
  { valore: -15, etichetta: '−15 giorni' },
  { valore: -30, etichetta: '−30 giorni' },
  { valore: -60, etichetta: '−60 giorni' },
]

/**
 * Quanto futuro proiettare oltre oggi. Il Task 14 l'aveva ridotta a
 * [7, 14, 30, 60, 90]: una regressione, perché prima dell'onda l'interfaccia
 * offriva fino a 180/365 giorni. Il tetto di `range` sulla rotta resta
 * (senza, `?range=100000` sarebbe una scansione aperta), ma va tenuto
 * allineato alla durata più lunga qui sotto.
 */
const DURATE = [7, 14, 30, 60, 90, 180, 365]

/**
 * Legge un intero da un parametro URL, ricadendo sul predefinito se assente
 * o non numerico: uno `?da=abc` scritto a mano non deve produrre `NaN` nello
 * stato del componente.
 */
function interoDaUrl(valore: string | null, predefinito: number): number {
  if (valore === null) return predefinito
  const n = Number(valore)
  return Number.isFinite(n) ? Math.trunc(n) : predefinito
}

export function SaldoScalarePanel({ visible }: SaldoScalarePanelProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const [ancora, setAncora] = useState(() => interoDaUrl(searchParams.get('da'), 0))
  const [durata, setDurata] = useState(() => interoDaUrl(searchParams.get('range'), 90))
  const [showZeroLine, setShowZeroLine] = useState(false)
  const [showOverdue, setShowOverdue] = useState(false)

  // Persiste la finestra nell'URL: la vista sopravvive a un aggiornamento di
  // pagina ed è condivisibile.
  function impostaFinestra(nuovaAncora: number, nuovaDurata: number) {
    setAncora(nuovaAncora)
    setDurata(nuovaDurata)
    const params = new URLSearchParams(searchParams.toString())
    params.set('da', String(nuovaAncora))
    params.set('range', String(nuovaDurata))
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }

  const { data, isPending, isFetching } = useQuery({
    // Come prima: interroga l'API solo a pannello visibile e ricarica a ogni
    // riapertura o cambio di filtro.
    enabled: visible,
    refetchOnMount: 'always',
    staleTime: 0,
    queryKey: ['saldo-scalare', durata, ancora, showOverdue],
    queryFn: async (): Promise<SaldoScalareData> => {
      const params = new URLSearchParams({
        range: String(durata),
        da: String(ancora),
        includiScaduto: String(showOverdue),
      })
      const resp = await fetch(`/api/scadenzario/saldo-scalare?${params}`)
      if (!resp.ok) throw new Error('Errore nel caricamento del saldo scalare')
      return resp.json()
    },
  })

  const isLoading = isPending || isFetching

  if (!visible) return null

  // Finestra calcolata localmente come stima per la prima resa, prima che la
  // risposta arrivi: la fonte di verità resta `data.range`, quella che la
  // rotta ha davvero usato.
  const oggi = new Date()
  const dal = data?.range.from ?? format(addDays(oggi, ancora), 'yyyy-MM-dd')
  const al = data?.range.to ?? format(addDays(oggi, durata), 'yyyy-MM-dd')
  const dateRangeLabel = `${format(parseISO(dal), 'd MMM', { locale: it })} - ${format(parseISO(al), 'd MMM', { locale: it })}`

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs uppercase text-muted-foreground w-24">Parte da</span>
          {ANCORE.map((a) => (
            <Button
              key={a.valore}
              size="sm"
              variant={ancora === a.valore ? 'default' : 'outline'}
              onClick={() => impostaFinestra(a.valore, durata)}
            >
              {a.etichetta}
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs uppercase text-muted-foreground w-24">Durata</span>
          {DURATE.map((d) => (
            <Button
              key={d}
              size="sm"
              variant={durata === d ? 'default' : 'outline'}
              onClick={() => impostaFinestra(ancora, d)}
            >
              {d} gg
            </Button>
          ))}
          <Button size="sm" variant="secondary" onClick={() => impostaFinestra(-30, 90)}>
            Storico 30gg + Prev. 90gg
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-sm text-muted-foreground">{dateRangeLabel}</span>

        <div className="flex items-center gap-2 ml-auto">
          <Button
            variant={showZeroLine ? 'default' : 'outline'}
            size="sm"
            className="h-8 text-xs gap-1.5"
            onClick={() => setShowZeroLine(!showZeroLine)}
          >
            {showZeroLine ? (
              <>Escludi linea dello zero <X className="h-3 w-3" /></>
            ) : (
              'Includi linea dello zero'
            )}
          </Button>

          <Button
            variant={showOverdue ? 'default' : 'outline'}
            size="sm"
            className="h-8 text-xs gap-1.5"
            onClick={() => setShowOverdue(!showOverdue)}
          >
            {showOverdue ? (
              <>Nascondi scaduto <X className="h-3 w-3" /></>
            ) : (
              'Mostra scaduto'
            )}
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : data ? (
        <>
          {/* 4 Summary Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Saldo oggi */}
            <Card className="border-l-4 border-l-blue-500">
              <CardContent className="p-4">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-xs font-medium text-muted-foreground">Saldo oggi</span>
                  <Info className="h-3 w-3 text-muted-foreground" />
                </div>
                <p className={cn(
                  "text-xl font-bold",
                  data.saldoOggi >= 0 ? 'text-foreground' : 'text-rose-600'
                )}>
                  {formatCurrency(data.saldoOggi)}
                </p>
              </CardContent>
            </Card>

            {/* Pagamenti */}
            <Card className="border-l-4 border-l-rose-500">
              <CardContent className="p-4">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-xs font-medium text-muted-foreground">Pagamenti</span>
                  <Badge variant="outline" className="text-[10px] px-1 py-0 font-normal">Pag!</Badge>
                </div>
                <p className="text-xl font-bold text-rose-600">
                  {formatCurrency(data.pagamenti.totale)}
                </p>
                {data.pagamenti.ricorrenti > 0 && (
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    di cui {formatCurrency(data.pagamenti.ricorrenti)} ricorrenti
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Incassi */}
            <Card className="border-l-4 border-l-emerald-500">
              <CardContent className="p-4">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-xs font-medium text-muted-foreground">Incassi</span>
                </div>
                <p className="text-xl font-bold text-emerald-600">
                  {formatCurrency(data.incassi.totale)}
                </p>
                {data.incassi.ricorrenti > 0 && (
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    di cui {formatCurrency(data.incassi.ricorrenti)} ricorrenti
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Saldo finale */}
            <Card className="border-l-4 border-l-violet-500">
              <CardContent className="p-4">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-xs font-medium text-muted-foreground">Saldo finale</span>
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0 font-normal">
                    al {format(parseISO(data.range.to), 'd MMM', { locale: it })}
                  </Badge>
                </div>
                <p className={cn(
                  "text-xl font-bold",
                  data.saldoFinale >= 0 ? 'text-foreground' : 'text-rose-600'
                )}>
                  {formatCurrency(data.saldoFinale)}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Overdue summary row (when showOverdue is ON) */}
          {showOverdue && (
            <div className="flex items-center gap-6 px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-lg text-sm">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Scaduto da pagare:</span>
                <span className="font-semibold text-rose-600">{formatCurrency(data.scaduto.daPagare)}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Scaduto da incassare:</span>
                <span className="font-semibold text-emerald-600">{formatCurrency(data.scaduto.daIncassare)}</span>
              </div>
              <div className="flex items-center gap-2 ml-auto">
                <span className="text-muted-foreground">Saldo finale incluso scaduto:</span>
                <span className="font-semibold">{formatCurrency(data.scaduto.saldoFinaleIncluso)}</span>
              </div>
            </div>
          )}

          {/* Chart */}
          <Card>
            <CardContent className="pt-4 pb-2 px-2">
              <SaldoScalareChart
                data={data.chartData}
                showZeroLine={showZeroLine}
              />
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  )
}

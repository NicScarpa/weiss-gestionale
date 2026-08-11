'use client'

import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { RigaProspetto } from '@/lib/cashflow/prospetto'
import { MONTH_KEYS } from '@/types/budget'

const MESI = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic']

function euro(valore: number): string {
  if (valore === 0) return '—'
  return new Intl.NumberFormat('it-IT', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(valore)
}

interface Props {
  righe: RigaProspetto[]
  cassaIniziale: number
  cassaFinale: number
}

export function ProspettoTable({ righe, cassaIniziale, cassaFinale }: Props) {
  // Chiuse di default: il prospetto si legge per famiglie, il dettaglio si apre
  // quando un numero sorprende.
  const [aperte, setAperte] = useState<Set<string>>(new Set())

  const inverti = (codice: string) => {
    setAperte((precedenti) => {
      const nuove = new Set(precedenti)
      if (nuove.has(codice)) nuove.delete(codice)
      else nuove.add(codice)
      return nuove
    })
  }

  const visibile = (riga: RigaProspetto): boolean => {
    if (!riga.padre) return true
    if (!aperte.has(riga.padre)) return false
    // Una voce si vede solo se è aperto anche il nonno.
    const padre = righe.find((r) => r.codice === riga.padre)
    return !padre?.padre || aperte.has(padre.padre)
  }

  const memo = righe.filter((r) => r.livello === 'memo')
  const prospetto = righe.filter((r) => r.livello !== 'memo')

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b">
            <th className="sticky left-0 bg-background py-2 pr-4 text-left font-medium">
              Voce
            </th>
            {MESI.map((mese) => (
              <th key={mese} className="px-2 py-2 text-right font-medium tabular-nums">
                {mese}
              </th>
            ))}
            <th className="px-2 py-2 text-right font-semibold">Totale</th>
          </tr>
        </thead>
        <tbody>
          {prospetto.filter(visibile).map((riga) => {
            const espandibile = riga.livello === 'famiglia' || riga.livello === 'sottogruppo'
            const aperta = aperte.has(riga.codice)

            return (
              <tr
                key={riga.codice}
                className={cn(
                  // Sfondo sempre opaco: la cella sticky della prima colonna lo eredita
                  // (bg-inherit) per restare leggibile mentre le colonne dei mesi le
                  // scorrono sotto. Un fondo trasparente o semi-trasparente qui lascia
                  // passare il contenuto — vale anche per le varianti dark:.
                  'border-b border-muted bg-background',
                  riga.livello === 'famiglia' && 'bg-muted font-semibold',
                  riga.livello === 'totale' && 'bg-amber-50 font-semibold dark:bg-amber-950',
                  riga.livello === 'voce' && 'text-muted-foreground'
                )}
              >
                <td className="sticky left-0 bg-inherit py-1.5 pr-4">
                  <button
                    type="button"
                    onClick={() => espandibile && inverti(riga.codice)}
                    disabled={!espandibile}
                    aria-expanded={espandibile ? aperta : undefined}
                    className={cn(
                      'flex items-center gap-1 text-left',
                      riga.livello === 'sottogruppo' && 'pl-4',
                      riga.livello === 'voce' && 'pl-10',
                      !espandibile && 'cursor-default'
                    )}
                  >
                    {espandibile && (
                      <ChevronRight
                        className={cn('h-3.5 w-3.5 transition-transform', aperta && 'rotate-90')}
                      />
                    )}
                    <span>{riga.nome}</span>
                  </button>
                </td>
                {MONTH_KEYS.map((chiave) => (
                  <td
                    key={chiave}
                    className={cn(
                      'px-2 py-1.5 text-right tabular-nums',
                      riga.valori[chiave] < 0 && 'text-red-600 dark:text-red-400'
                    )}
                  >
                    {euro(riga.valori[chiave])}
                  </td>
                ))}
                <td
                  className={cn(
                    'px-2 py-1.5 text-right font-medium tabular-nums',
                    riga.valori.annual < 0 && 'text-red-600 dark:text-red-400'
                  )}
                >
                  {euro(riga.valori.annual)}
                </td>
              </tr>
            )
          })}

          <tr className="border-b border-muted">
            <td className="sticky left-0 bg-background py-1.5 pr-4">
              Cassa e banca a inizio anno
            </td>
            <td colSpan={12} />
            <td className="px-2 py-1.5 text-right tabular-nums">{euro(cassaIniziale)}</td>
          </tr>
          <tr className="border-b-2 bg-amber-50 font-semibold dark:bg-amber-950">
            <td className="sticky left-0 bg-inherit py-1.5 pr-4">
              Cassa e banca a fine anno
            </td>
            <td colSpan={12} />
            <td className="px-2 py-1.5 text-right tabular-nums">{euro(cassaFinale)}</td>
          </tr>
        </tbody>
      </table>

      <div className="mt-8">
        <h3 className="mb-2 text-sm font-semibold text-muted-foreground">
          Righe memo — fuori da ogni totale
        </h3>
        <table className="w-full text-sm">
          <tbody>
            {memo.map((riga) => (
              <tr key={riga.codice} className="border-b border-muted italic text-muted-foreground">
                <td className="py-1.5 pr-4">{riga.nome}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{euro(riga.valori.annual)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

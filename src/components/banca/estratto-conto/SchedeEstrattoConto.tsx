import { ArrowDownLeft, ArrowUpRight } from 'lucide-react'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { formatCurrency } from '@/lib/formatters'
import { cn } from '@/lib/utils'
import type { ConteggiEstrattoConto, TotaliEstrattoConto } from '@/types/reconciliation'
import type { FiltriEstrattoConto } from '@/lib/banca/filtri-estratto-conto'

interface Props {
  filtri: FiltriEstrattoConto
  conteggi?: ConteggiEstrattoConto
  totali?: TotaliEstrattoConto
  onCambia: (parziali: Partial<FiltriEstrattoConto>) => void
}

/** Il Cestino è una scheda come le altre, ma non è una sezione: è un filtro a parte. */
const CESTINO = 'CESTINO'

export function SchedeEstrattoConto({ filtri, conteggi, totali, onCambia }: Props) {
  const attiva = filtri.cestino ? CESTINO : filtri.sezione
  const c = conteggi ?? { attivi: 0, delegheF24: 0, cbillPagopa: 0, cestino: 0 }
  const t = totali ?? { entrate: 0, uscite: 0, saldoNetto: 0 }
  const saldoPositivo = t.saldoNetto >= 0

  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <Tabs
        value={attiva}
        onValueChange={(valore) =>
          onCambia(
            valore === CESTINO
              ? { cestino: true, page: 1 }
              : { cestino: false, sezione: valore as FiltriEstrattoConto['sezione'], page: 1 }
          )
        }
      >
        <TabsList className="h-auto w-fit gap-1 rounded-lg border-none bg-muted/50 p-1">
          <TabsTrigger value="ATTIVI">Attivi ({c.attivi})</TabsTrigger>
          <TabsTrigger value="DELEGHE_F24">Deleghe F24 ({c.delegheF24})</TabsTrigger>
          <TabsTrigger value="CBILL_PAGOPA">CBILL-PagoPA ({c.cbillPagopa})</TabsTrigger>
          <TabsTrigger value={CESTINO}>Cestino ({c.cestino})</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* I totali sono quelli del filtro attivo, non del conto: cambiano con
          la scheda e con la ricerca, ed è ciò che li rende leggibili. */}
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <span className="inline-flex items-center gap-1.5 text-emerald-600">
          <ArrowDownLeft className="h-4 w-4" aria-hidden />
          <span className="text-muted-foreground">Totale Entrate</span>
          <span className="font-semibold">{formatCurrency(t.entrate)}</span>
        </span>
        <span className="inline-flex items-center gap-1.5 text-red-600">
          <ArrowUpRight className="h-4 w-4" aria-hidden />
          <span className="text-muted-foreground">Totale Uscite</span>
          <span className="font-semibold">{formatCurrency(t.uscite)}</span>
        </span>
        <span
          className={cn(
            'inline-flex items-center gap-1.5',
            saldoPositivo ? 'text-emerald-600' : 'text-red-600'
          )}
        >
          <span className="text-muted-foreground">Saldo Netto</span>
          <span className="font-semibold">{formatCurrency(t.saldoNetto)}</span>
        </span>
      </div>
    </div>
  )
}

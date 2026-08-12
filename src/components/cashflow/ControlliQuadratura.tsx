import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { EsitoControllo } from '@/lib/cashflow/controlli'

export function ControlliQuadratura({ controlli }: { controlli: EsitoControllo[] }) {
  const problemi = controlli.filter((c) => c.esito === 'attenzione')

  if (problemi.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800 dark:border-green-900 dark:bg-green-950/30 dark:text-green-300">
        <CheckCircle2 className="h-4 w-4 shrink-0" />
        <span>Il prospetto quadra: tutti e quattro i controlli sono a posto.</span>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {problemi.map((controllo) => (
        <div
          key={controllo.codice}
          className={cn(
            'flex items-start gap-2 rounded-md border px-3 py-2 text-sm',
            'border-amber-200 bg-amber-50 text-amber-900',
            'dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200'
          )}
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <div className="font-medium">{controllo.nome}</div>
            <div className="text-xs opacity-90">{controllo.spiegazione}</div>
          </div>
        </div>
      ))}
    </div>
  )
}

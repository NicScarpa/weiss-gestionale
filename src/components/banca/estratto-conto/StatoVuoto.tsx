import Link from 'next/link'
import { Landmark, SearchX } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface Props {
  filtriAttivi: boolean
  onCancellaFiltri: () => void
  /** Arriva col dialogo di import (Task 9): finché manca, il pulsante non si mostra. */
  onImporta?: () => void
}

/**
 * Due vuoti diversi, e confonderli è il difetto: «non c'è nulla» davanti a un
 * filtro che nasconde tutto manda a cercare un guasto che non c'è.
 */
export function StatoVuoto({ filtriAttivi, onCancellaFiltri, onImporta }: Props) {
  if (filtriAttivi) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed px-6 py-12 text-center">
        <SearchX className="h-8 w-8 text-muted-foreground" aria-hidden />
        <p className="font-medium">Nessun movimento corrisponde ai filtri</p>
        <Button variant="outline" size="sm" onClick={onCancellaFiltri}>
          Cancella filtri
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed px-6 py-12 text-center">
      <Landmark className="h-8 w-8 text-muted-foreground" aria-hidden />
      <p className="font-medium">Nessun movimento bancario</p>
      <p className="max-w-md text-sm text-muted-foreground">
        Collega la banca da Impostazioni → Banche e Conti, oppure importa un CSV.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button asChild variant="outline" size="sm">
          <Link href="/impostazioni/banche-e-conti">Collega la banca</Link>
        </Button>
        {onImporta && (
          <Button variant="outline" size="sm" onClick={onImporta}>
            Importa CSV
          </Button>
        )}
      </div>
    </div>
  )
}

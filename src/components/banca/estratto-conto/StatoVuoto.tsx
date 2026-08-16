import Link from 'next/link'
import { Inbox, Landmark, SearchX, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { SezioneMovimentoBancario } from '@/types/reconciliation'

interface Props {
  filtriAttivi: boolean
  sezione: SezioneMovimentoBancario
  nelCestino: boolean
  onCancellaFiltri: () => void
  /** Arriva col dialogo di import (Task 9): finché manca, il pulsante non si mostra. */
  onImporta?: () => void
}

function Riquadro({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed px-6 py-12 text-center">
      {children}
    </div>
  )
}

/**
 * Quattro vuoti diversi, e confonderli è il difetto: ognuno manda a fare una
 * cosa diversa, e quello sbagliato manda a cercare un guasto che non c'è.
 */
export function StatoVuoto({ filtriAttivi, sezione, nelCestino, onCancellaFiltri, onImporta }: Props) {
  if (filtriAttivi) {
    return (
      <Riquadro>
        <SearchX className="h-8 w-8 text-muted-foreground" aria-hidden />
        <p className="font-medium">Nessun movimento corrisponde ai filtri</p>
        <Button variant="outline" size="sm" onClick={onCancellaFiltri}>
          Cancella filtri
        </Button>
      </Riquadro>
    )
  }

  if (nelCestino) {
    return (
      <Riquadro>
        <Trash2 className="h-8 w-8 text-muted-foreground" aria-hidden />
        <p className="font-medium">Il Cestino è vuoto</p>
      </Riquadro>
    )
  }

  // Deleghe F24 e CBILL-PagoPA non si riempiono da sole: non c'è nulla da
  // collegare né da importare, ci si arriva spostando una riga.
  if (sezione !== 'ATTIVI') {
    return (
      <Riquadro>
        <Inbox className="h-8 w-8 text-muted-foreground" aria-hidden />
        <p className="font-medium">Nessun movimento in questa scheda</p>
        <p className="max-w-md text-sm text-muted-foreground">
          Si spostano qui dal menu azioni di una riga.
        </p>
      </Riquadro>
    )
  }

  return (
    <Riquadro>
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
    </Riquadro>
  )
}

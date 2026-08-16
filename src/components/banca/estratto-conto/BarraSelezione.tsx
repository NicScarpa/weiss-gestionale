import { ChevronDown, RotateCcw, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { SezioneMovimentoBancario } from '@/types/reconciliation'

export type AzioneInBlocco = 'sposta' | 'cestino' | 'ripristina'

interface Props {
  selezionati: number
  totale: number
  /** Vero quando la selezione non è più «queste righe» ma «tutte quelle del filtro». */
  tutteDelFiltro: boolean
  nelCestino: boolean
  onTutteDelFiltro: () => void
  onAnnulla: () => void
  /**
   * Gli identificativi (o il filtro, se `tutteDelFiltro`) li compone il
   * contenitore: qui si sa quante righe sono, non quali.
   */
  onAzione: (azione: AzioneInBlocco, sezione?: SezioneMovimentoBancario) => void
}

const SEZIONI: Array<{ valore: SezioneMovimentoBancario; etichetta: string }> = [
  { valore: 'ATTIVI', etichetta: 'Attivi' },
  { valore: 'DELEGHE_F24', etichetta: 'Deleghe F24' },
  { valore: 'CBILL_PAGOPA', etichetta: 'CBILL-PagoPA' },
]

export function BarraSelezione({
  selezionati,
  totale,
  tutteDelFiltro,
  nelCestino,
  onTutteDelFiltro,
  onAnnulla,
  onAzione,
}: Props) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/50 px-3 py-2 text-sm">
      {tutteDelFiltro ? (
        <span className="font-medium">Tutte le {totale} righe del filtro sono selezionate</span>
      ) : (
        <>
          <span className="font-medium">
            {selezionati} {selezionati === 1 ? 'selezionato' : 'selezionati'}
          </span>
          {/* La selezione della pagina si ferma alle righe visibili: senza
              questo, spostare 231 movimenti vuol dire farlo tre volte. */}
          {selezionati < totale && (
            <Button variant="link" size="sm" className="h-auto p-0" onClick={onTutteDelFiltro}>
              Seleziona tutte le {totale} del filtro
            </Button>
          )}
        </>
      )}

      <div className="ml-auto flex flex-wrap items-center gap-2">
        {!nelCestino && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                Sposta in
                <ChevronDown className="ml-1 h-4 w-4" aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {SEZIONI.map((s) => (
                <DropdownMenuItem key={s.valore} onClick={() => onAzione('sposta', s.valore)}>
                  {s.etichetta}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {nelCestino ? (
          <Button variant="outline" size="sm" onClick={() => onAzione('ripristina')}>
            <RotateCcw className="mr-1 h-4 w-4" aria-hidden />
            Ripristina
          </Button>
        ) : (
          <Button variant="outline" size="sm" onClick={() => onAzione('cestino')}>
            <Trash2 className="mr-1 h-4 w-4" aria-hidden />
            Cestino
          </Button>
        )}

        <Button variant="ghost" size="sm" onClick={onAnnulla}>
          <X className="mr-1 h-4 w-4" aria-hidden />
          Annulla
        </Button>
      </div>
    </div>
  )
}

import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { FiltriEstrattoConto } from '@/lib/banca/filtri-estratto-conto'
import { RIGHE_PER_PAGINA, salvaRighePerPagina } from './colonne'

interface Props {
  pagina: number
  totalePagine: number
  righePerPagina: number
  onCambia: (parziali: Partial<FiltriEstrattoConto>) => void
}

export function PaginazioneEstrattoConto({ pagina, totalePagine, righePerPagina, onCambia }: Props) {
  const primaPagina = pagina <= 1
  const ultimaPagina = pagina >= totalePagine

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <Label htmlFor="righe-per-pagina" className="text-sm font-normal text-muted-foreground">
          Righe per pagina
        </Label>
        <Select
          value={String(righePerPagina)}
          onValueChange={(v) => {
            const limite = Number(v)
            // La scelta resta nel browser: chi lavora su schermo piccolo non
            // la rifà a ogni visita.
            salvaRighePerPagina(window.localStorage, limite)
            onCambia({ limit: limite, page: 1 })
          }}
        >
          <SelectTrigger id="righe-per-pagina" className="w-[80px]" size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RIGHE_PER_PAGINA.map((n) => (
              <SelectItem key={n} value={String(n)}>
                {n}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">
          Pagina {pagina} di {totalePagine}
        </span>
        <Button
          variant="outline"
          size="sm"
          aria-label="Prima pagina"
          disabled={primaPagina}
          onClick={() => onCambia({ page: 1 })}
        >
          <ChevronsLeft className="h-4 w-4" aria-hidden />
        </Button>
        <Button
          variant="outline"
          size="sm"
          aria-label="Precedente"
          disabled={primaPagina}
          onClick={() => onCambia({ page: pagina - 1 })}
        >
          <ChevronLeft className="mr-1 h-4 w-4" aria-hidden />
          Precedente
        </Button>
        <Button
          variant="outline"
          size="sm"
          aria-label="Successiva"
          disabled={ultimaPagina}
          onClick={() => onCambia({ page: pagina + 1 })}
        >
          Successiva
          <ChevronRight className="ml-1 h-4 w-4" aria-hidden />
        </Button>
        <Button
          variant="outline"
          size="sm"
          aria-label="Ultima pagina"
          disabled={ultimaPagina}
          onClick={() => onCambia({ page: totalePagine })}
        >
          <ChevronsRight className="h-4 w-4" aria-hidden />
        </Button>
      </div>
    </div>
  )
}

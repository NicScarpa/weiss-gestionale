import { Settings2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { COLONNE, type IdColonna } from './colonne'

export function SelettoreColonne({
  visibili,
  onCambia,
}: {
  /** Sola lettura: la nuova scelta esce da `onCambia`, non da una modifica sul posto. */
  visibili: ReadonlySet<IdColonna>
  onCambia: (v: Set<IdColonna>) => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          <Settings2 className="mr-2 h-4 w-4" aria-hidden />
          Colonne
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Colonne visibili</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {COLONNE.map((c) => (
          <DropdownMenuCheckboxItem
            key={c.id}
            checked={visibili.has(c.id)}
            // Radix chiude il menu a ogni voce scelta: qui si spuntano più
            // colonne di fila, e riaprirlo ogni volta è il difetto di CashKing
            // annotato nell'analisi.
            onSelect={(e) => e.preventDefault()}
            onCheckedChange={(spuntata) => {
              const prossime = new Set(visibili)
              if (spuntata) prossime.add(c.id)
              else prossime.delete(c.id)
              // Nascondere l'ultima colonna lascerebbe una tabella di sole
              // caselle di selezione: l'ultima spunta non si toglie.
              if (prossime.size > 0) onCambia(prossime)
            }}
          >
            {c.etichetta}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

import type { StatoLegenda } from '@/types/reconciliation'
import { IconaStato, ETICHETTE_STATO } from './IconaStato'

/**
 * Le quattro icone della colonna Stato spiegate una volta sola, in fondo alla
 * lista: senza, il quadratino viola resta un colore che non dice nulla.
 */
const ORDINE: StatoLegenda[] = ['non_abbinato', 'parziale', 'abbinato_manualmente', 'riconciliato']

export function LegendaStati() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
      <span className="font-medium">Legenda:</span>
      {ORDINE.map((stato) => (
        <span key={stato} className="inline-flex items-center gap-1.5">
          {/* L'icona porta già il proprio nome accessibile: qui accanto c'è
              l'etichetta scritta, e senza `aria-hidden` si sentirebbe due volte. */}
          <span aria-hidden>
            <IconaStato stato={stato} residuo={0} />
          </span>
          {ETICHETTE_STATO[stato]}
        </span>
      ))}
      {/* Il puntino ambra compare sul «Non abbinato» e non è uno stato in più:
          senza una riga di legenda resta un pallino che nessuno sa leggere. */}
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden>
          <IconaStato stato="non_abbinato" residuo={0} proposta />
        </span>
        Puntino = c&apos;è una proposta da rivedere
      </span>
      <span className="text-orange-600">€123 = Residuo</span>
    </div>
  )
}

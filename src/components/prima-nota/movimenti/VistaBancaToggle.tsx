'use client'

import { BookText, Landmark } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { SELEZIONATO } from '@/components/prima-nota/AccountSelectorToggle'
import { FILTRI_DEFAULT, filtriInSearchParams } from '@/lib/banca/filtri-estratto-conto'
import type { ConteggiEstrattoConto } from '@/types/reconciliation'

/**
 * Le due sotto-schede del Conto Bancario.
 *
 * «Estratto conto» è ciò che la banca ha portato, «Scritture» ciò che è
 * registrato in contabilità: due elenchi diversi che finora stavano in due
 * pagine diverse, e chi apriva la scheda Banca della prima nota trovava solo
 * il secondo — vuoto — concludendo che la banca non avesse portato nulla.
 */
export type VistaBanca = 'estratto' | 'scritture'

/**
 * Quale delle due si sta guardando, letta dall'URL.
 *
 * Solo `vista=scritture` porta alle scritture: qualunque altro valore (assente,
 * scritto male, avanzato da una versione precedente) cade sull'estratto conto,
 * che sul Conto Bancario è ciò che si apre per primo.
 */
export function vistaDaSearchParams(sp: URLSearchParams): VistaBanca {
  return sp.get('vista') === 'scritture' ? 'scritture' : 'estratto'
}

/**
 * L'URL dopo il passaggio a una delle due viste, conservando il resto (`register`).
 *
 * I filtri dell'estratto conto se ne vanno in entrambe le direzioni: nelle
 * scritture non li legge nessuno, e restare nell'URL li rimetterebbe in vigore
 * al rientro senza che il pannello dei filtri li mostri mai. `FILTRI_DEFAULT`
 * non scrive nulla, quindi `filtriInSearchParams` qui si limita a cancellarli.
 */
export function paramsPerVista(vista: VistaBanca, correnti: URLSearchParams): URLSearchParams {
  const sp = filtriInSearchParams(FILTRI_DEFAULT, correnti)
  // L'estratto conto è il valore di partenza: si segna nell'URL solo l'altra
  // vista, così l'indirizzo normale resta `?register=BANK`.
  if (vista === 'scritture') sp.set('vista', 'scritture')
  else sp.delete('vista')
  return sp
}

/**
 * Quante righe ha l'estratto conto, per il numero accanto al nome.
 *
 * Le tre schede vive sommate — Attivi, Deleghe F24, CBILL-PagoPA — e non il
 * `total` della lista, che conta le righe della *sola* scheda aperta: spostata
 * una delega in «Deleghe F24», quel `total` calava, e la sotto-scheda ancora
 * chiusa annunciava meno movimenti di quanti ne contiene. Il Cestino resta
 * fuori: quelle righe si sono volute togliere, e rimetterle nel conteggio le
 * farebbe cercare in un elenco dove non stanno.
 */
export function righeEstrattoConto(conteggi: ConteggiEstrattoConto): number {
  return conteggi.attivi + conteggi.delegheF24 + conteggi.cbillPagopa
}

/**
 * «(0)» e «nessun numero» dicono due cose diverse: il primo è un conteggio
 * vero, il secondo è una lettura non ancora tornata. Il confronto è con
 * `undefined` e non con la falsità, altrimenti uno zero sparirebbe.
 */
function etichetta(nome: string, quanti: number | undefined): string {
  return quanti === undefined ? nome : `${nome} (${quanti})`
}

interface VistaBancaToggleProps {
  vista: VistaBanca
  /** Quante righe ha l'estratto conto; `undefined` finché la lettura non torna. */
  conteggioEstratto?: number
  /** Quante scritture ha il registro Banca col filtro corrente. */
  conteggioScritture?: number
  onCambia: (vista: VistaBanca) => void
}

export function VistaBancaToggle({
  vista,
  conteggioEstratto,
  conteggioScritture,
  onCambia,
}: VistaBancaToggleProps) {
  return (
    // Stessa forma del selettore Cassa/Banca qui sopra: due bottoni `outline`
    // che si impilano invece di sporgere su uno schermo da 390px.
    <div className="flex max-w-full flex-wrap items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        aria-pressed={vista === 'estratto'}
        onClick={() => onCambia('estratto')}
        className={cn('h-11 flex-1 gap-2 sm:h-8', vista === 'estratto' && SELEZIONATO)}
      >
        <Landmark aria-hidden="true" className="h-4 w-4 text-blue-600" />
        <span className="text-sm">{etichetta('Estratto conto', conteggioEstratto)}</span>
      </Button>
      <Button
        variant="outline"
        size="sm"
        aria-pressed={vista === 'scritture'}
        onClick={() => onCambia('scritture')}
        className={cn('h-11 flex-1 gap-2 sm:h-8', vista === 'scritture' && SELEZIONATO)}
      >
        <BookText aria-hidden="true" className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm">{etichetta('Scritture', conteggioScritture)}</span>
      </Button>
    </div>
  )
}

'use client'

import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { Landmark } from 'lucide-react'
import type { ReconciliationSummary } from '@/types/reconciliation'

/**
 * Il cartello che, dalla scheda «Tutti», manda ai movimenti bancari.
 *
 * I movimenti scaricati dalla banca (e quelli importati da CSV) non sono
 * scritture contabili: sono righe dell'estratto conto, e da oggi vivono nella
 * sotto-scheda «Estratto conto» del Conto Bancario. Su «Tutti» quella
 * sotto-scheda non si vede, quindi il cartello dice quanti sono e dove sono;
 * sul Conto Bancario non si monta, perché la sotto-scheda è già a schermo.
 *
 * Non promette nulla di più: oggi riconciliare accoppia una riga a una
 * scrittura che esiste già, non ne crea una. Quando la promozione a movimento
 * di prima nota esisterà (Fase A2), la frase potrà dirlo.
 */

async function leggiRiepilogo(venueId: string): Promise<ReconciliationSummary> {
  const r = await fetch(`/api/reconciliation/summary?venueId=${venueId}`)
  if (!r.ok) throw new Error('Errore nel recupero del riepilogo della riconciliazione')
  return r.json()
}

/** Quanti movimenti aspettano ancora qualcuno: mai guardati, da verificare, senza abbinamento. */
function movimentiInAttesa(riepilogo: ReconciliationSummary): number {
  return riepilogo.pending + riepilogo.toReview + riepilogo.unmatched
}

export function MovimentiBancariInAttesa({ venueId }: { venueId: string }) {
  const { data, isPending, isError } = useQuery({
    queryKey: ['riconciliazione', 'riepilogo', venueId],
    queryFn: () => leggiRiepilogo(venueId),
    enabled: !!venueId,
  })

  // Un cartello che non sa cosa dire non dice nulla: la pagina che lo ospita
  // deve funzionare anche se la riconciliazione non risponde.
  if (isPending || isError || !data) return null

  const attesa = movimentiInAttesa(data)
  if (attesa <= 0) return null

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm">
      <Landmark className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      <p className="text-muted-foreground">
        {/* «Aspettano di essere riconciliati» prometteva un'attesa che finisce
            da sé: sono righe non riconciliate, e chi le riconcilia è chi legge.
            La frase dice lo stato, non un'aspettativa. */}
        {attesa === 1
          ? '1 movimento dell’estratto conto non è ancora riconciliato.'
          : `${attesa} movimenti dell’estratto conto non sono ancora riconciliati.`}{' '}
        <Link
          href="/prima-nota/movimenti?register=BANK"
          className="font-medium text-foreground underline underline-offset-2"
        >
          Vai ai movimenti bancari
        </Link>
      </p>
    </div>
  )
}

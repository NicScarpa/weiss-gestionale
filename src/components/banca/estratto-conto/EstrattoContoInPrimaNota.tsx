'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { filtriDaSearchParams, filtriInSearchParams } from '@/lib/banca/filtri-estratto-conto'
import { EstrattoConto } from './EstrattoConto'

/**
 * L'estratto conto dentro la prima nota: i filtri vivono nell'URL accanto a
 * `register=BANK`, così la vista si incolla e si ricarica uguale (spec,
 * decisione 7). `replace`, non `push`: ogni clic su un'intestazione non deve
 * diventare una voce della cronologia del browser.
 */
export function EstrattoContoInPrimaNota({ venueId }: { venueId: string }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  return (
    <EstrattoConto
      venueId={venueId}
      filtriIniziali={filtriDaSearchParams(new URLSearchParams(searchParams.toString()))}
      onFiltriChange={(filtri) => {
        const sp = filtriInSearchParams(filtri, new URLSearchParams(searchParams.toString()))
        router.replace(`?${sp.toString()}`, { scroll: false })
      }}
    />
  )
}

'use client'

import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { RispostaEstrattoConto } from '@/types/reconciliation'
import {
  FILTRI_DEFAULT,
  filtriInSearchParams,
  type FiltriEstrattoConto as Filtri,
  type OrdinaPer,
} from '@/lib/banca/filtri-estratto-conto'
import { FreschezzaMovimenti } from '@/components/banca/FreschezzaMovimenti'
import { leggiColonneVisibili, salvaColonneVisibili, leggiRighePerPagina, type IdColonna } from './colonne'
import { SchedeEstrattoConto } from './SchedeEstrattoConto'
// Il pannello dei filtri e il tipo dei filtri portano lo stesso nome: qui
// servono entrambi, quindi il pannello entra come `PannelloFiltri`.
import { FiltriEstrattoConto as PannelloFiltri } from './FiltriEstrattoConto'
import { SelettoreColonne } from './SelettoreColonne'
import { TabellaEstrattoConto } from './TabellaEstrattoConto'
import { BarraSelezione } from './BarraSelezione'
import { PaginazioneEstrattoConto } from './PaginazioneEstrattoConto'
import { LegendaStati } from './LegendaStati'
import { StatoVuoto } from './StatoVuoto'

export interface EstrattoContoProps {
  venueId: string
  filtriIniziali: Filtri
  /** Chiamato a ogni cambio: il montaggio in prima nota lo usa per scrivere l'URL. */
  onFiltriChange?: (filtri: Filtri) => void
}

const CHIAVE_QUERY_ESTRATTO = ['estratto-conto'] as const

async function leggiLista(filtri: Filtri): Promise<RispostaEstrattoConto> {
  const r = await fetch(`/api/bank-transactions?${filtriInSearchParams(filtri)}`)
  if (!r.ok) throw new Error('Errore nel caricamento dei movimenti')
  return r.json()
}

const memoria = () => (typeof window === 'undefined' ? null : window.localStorage)

/**
 * Ciò che restringe la lista, col valore che ha quando non restringe nulla.
 *
 * Non ci sono `sezione` e `cestino`: la scheda non è un filtro ma il posto in
 * cui si sta, e «Cancella filtri» non deve spostare chi legge da un'altra
 * parte. Fuori restano anche ordinamento, pagina e righe per pagina, che non
 * nascondono nessuna riga.
 *
 * L'elenco è uno solo perché le due domande — «ci sono filtri?» e «togli i
 * filtri» — devono rispondere sulle stesse voci: tenute separate, prima o poi
 * una delle due si dimentica di un campo.
 */
const FILTRI_PULITI = {
  search: undefined,
  tipo: FILTRI_DEFAULT.tipo,
  bankAccountId: undefined,
  soloNonRiconciliati: FILTRI_DEFAULT.soloNonRiconciliati,
  dateFrom: undefined,
  dateTo: undefined,
  status: undefined,
} satisfies Partial<Filtri>

function ciSonoFiltri(filtri: Filtri): boolean {
  const campi = Object.keys(FILTRI_PULITI) as Array<keyof typeof FILTRI_PULITI>
  return campi.some((campo) => filtri[campo] !== FILTRI_PULITI[campo])
}

export function EstrattoConto({ venueId, filtriIniziali, onFiltriChange }: EstrattoContoProps) {
  // Le righe per pagina vengono dal browser al primo montaggio, se l'URL non le dice.
  const [filtri, impostaFiltri] = useState<Filtri>(() => ({
    ...filtriIniziali,
    limit:
      filtriIniziali.limit !== FILTRI_DEFAULT.limit ? filtriIniziali.limit : leggiRighePerPagina(memoria()),
  }))
  const [colonne, impostaColonne] = useState<Set<IdColonna>>(() => leggiColonneVisibili(memoria()))
  const [selezionati, impostaSelezionati] = useState<Set<string>>(new Set())
  const [tutteDelFiltro, impostaTutteDelFiltro] = useState(false)

  const applica = (prossimi: Filtri) => {
    impostaFiltri(prossimi)
    // Una selezione fatta su un altro insieme di righe non vuol più dire nulla.
    impostaSelezionati(new Set())
    impostaTutteDelFiltro(false)
    onFiltriChange?.(prossimi)
  }

  const cambiaFiltri = (parziali: Partial<Filtri>) => applica({ ...filtri, ...parziali })

  // I campi facoltativi (ricerca, date, conto) non esistono come chiavi in
  // `FILTRI_DEFAULT` — zod omette gli `optional` assenti — quindi uno spread di
  // quello non li cancellerebbe: vanno nominati, ed è ciò che fa `FILTRI_PULITI`.
  // La scheda, l'ordinamento e le righe per pagina restano dove sono.
  const azzeraFiltri = () => applica({ ...filtri, ...FILTRI_PULITI, page: 1 })

  const { data, isPending, isFetching, isError } = useQuery({
    queryKey: [...CHIAVE_QUERY_ESTRATTO, venueId, filtri],
    queryFn: () => leggiLista(filtri),
    placeholderData: (precedente) => precedente,
  })
  useEffect(() => {
    if (isError) toast.error('Impossibile caricare i movimenti bancari')
  }, [isError])

  const ordina = (campo: OrdinaPer) => {
    if (filtri.ordina === campo) cambiaFiltri({ verso: filtri.verso === 'asc' ? 'desc' : 'asc', page: 1 })
    // La data parte dalla più recente, il resto dal più piccolo: è l'ordine
    // che ci si aspetta la prima volta che si clicca.
    else cambiaFiltri({ ordina: campo, verso: campo === 'data' ? 'desc' : 'asc', page: 1 })
  }

  const righe = data?.data ?? []
  const totale = data?.pagination.total ?? 0
  // Senza questa distinzione il vuoto racconta la storia sbagliata: «non c'è
  // nulla» davanti a un filtro che nasconde tutto manda a cercare un guasto
  // che non c'è, e un Cestino vuoto invita a collegare la banca.
  const filtriAttivi = useMemo(() => ciSonoFiltri(filtri), [filtri])

  return (
    <div className="space-y-4">
      <SchedeEstrattoConto
        filtri={filtri}
        conteggi={data?.conteggi}
        totali={data?.totali}
        onCambia={cambiaFiltri}
      />
      <FreschezzaMovimenti />
      <PannelloFiltri filtri={filtri} onCambia={cambiaFiltri} onCancellaFiltri={azzeraFiltri} />
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {righe.length} di {totale}
        </span>
        <SelettoreColonne
          visibili={colonne}
          onCambia={(v) => {
            impostaColonne(v)
            salvaColonneVisibili(memoria(), v)
          }}
        />
      </div>
      {!isPending && righe.length === 0 ? (
        <StatoVuoto
          filtriAttivi={filtriAttivi}
          sezione={filtri.sezione}
          nelCestino={filtri.cestino}
          onCancellaFiltri={azzeraFiltri}
        />
      ) : (
        <TabellaEstrattoConto
          righe={righe}
          filtri={filtri}
          colonneVisibili={colonne}
          selezionati={selezionati}
          caricamento={isFetching}
          onOrdina={ordina}
          onSeleziona={(id, s) => {
            const p = new Set(selezionati)
            if (s) p.add(id)
            else p.delete(id)
            impostaSelezionati(p)
            impostaTutteDelFiltro(false)
          }}
          onSelezionaPagina={(s) => {
            impostaSelezionati(s ? new Set(righe.map((r) => r.id)) : new Set())
            impostaTutteDelFiltro(false)
          }}
          onModifica={() => {}}
          onDettagli={() => {}}
          onSposta={() => {}}
          onCestino={() => {}}
          onRipristina={() => {}}
        />
      )}
      {selezionati.size > 0 && (
        <BarraSelezione
          selezionati={selezionati.size}
          totale={totale}
          tutteDelFiltro={tutteDelFiltro}
          nelCestino={filtri.cestino}
          onTutteDelFiltro={() => impostaTutteDelFiltro(true)}
          onAnnulla={() => {
            impostaSelezionati(new Set())
            impostaTutteDelFiltro(false)
          }}
          onAzione={() => {}}
        />
      )}
      {(data?.pagination.totalPages ?? 0) > 1 && (
        <PaginazioneEstrattoConto
          pagina={filtri.page}
          totalePagine={data?.pagination.totalPages ?? 1}
          righePerPagina={filtri.limit}
          onCambia={cambiaFiltri}
        />
      )}
      <LegendaStati />
    </div>
  )
}

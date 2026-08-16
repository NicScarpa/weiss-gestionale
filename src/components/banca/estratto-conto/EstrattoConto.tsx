'use client'

import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Upload } from 'lucide-react'
import { toast } from 'sonner'
import type {
  RigaEstrattoConto,
  RispostaEstrattoConto,
  SezioneMovimentoBancario,
} from '@/types/reconciliation'
import {
  FILTRI_DEFAULT,
  filtriInSearchParams,
  type FiltriEstrattoConto as Filtri,
  type OrdinaPer,
} from '@/lib/banca/filtri-estratto-conto'
import { Button } from '@/components/ui/button'
import { FreschezzaMovimenti } from '@/components/banca/FreschezzaMovimenti'
// Import diretti e non dall'indice di `reconciliation`: quello tira dentro
// anche tabella e dialogo di abbinamento, che qui non servono.
import { ImportDialog } from '@/components/reconciliation/ImportDialog'
import { TransactionDetailsDialog } from '@/components/reconciliation/TransactionDetailsDialog'
import { leggiColonneVisibili, salvaColonneVisibili, leggiRighePerPagina, type IdColonna } from './colonne'
import { SchedeEstrattoConto } from './SchedeEstrattoConto'
// Il pannello dei filtri e il tipo dei filtri portano lo stesso nome: qui
// servono entrambi, quindi il pannello entra come `PannelloFiltri`.
import { FiltriEstrattoConto as PannelloFiltri } from './FiltriEstrattoConto'
import { SelettoreColonne } from './SelettoreColonne'
import { TabellaEstrattoConto } from './TabellaEstrattoConto'
import { BarraSelezione, type AzioneInBlocco } from './BarraSelezione'
import { PaginazioneEstrattoConto } from './PaginazioneEstrattoConto'
import { LegendaStati } from './LegendaStati'
import { StatoVuoto } from './StatoVuoto'
import { ModificaMovimentoDialog } from './ModificaMovimentoDialog'
import { NuovoMovimentoDialog } from './NuovoMovimentoDialog'

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

const JSON_HEADERS = { 'Content-Type': 'application/json' }

/** Che cosa è successo, al singolare e al plurale: «1 movimenti» si legge male. */
const FATTO: Record<AzioneInBlocco, [string, string]> = {
  sposta: ['spostato', 'spostati'],
  cestino: ['nel Cestino', 'nel Cestino'],
  ripristina: ['ripristinato', 'ripristinati'],
}

/**
 * Manda la richiesta e restituisce il corpo, oppure `null` se è andata male.
 *
 * Il messaggio lo scrive il server e finisce nel toast così com'è: è il caso
 * del 409 sul Cestino, che non dice «non è stato possibile» ma quale scrittura
 * bisogna scollegare prima.
 */
async function invia<T>(url: string, init: RequestInit, ko: string): Promise<T | null> {
  try {
    const r = await fetch(url, init)
    const corpo = (await r.json().catch(() => ({}))) as T & { error?: string }
    if (!r.ok) {
      toast.error(corpo.error ?? ko)
      return null
    }
    return corpo
  } catch {
    toast.error(ko)
    return null
  }
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
  const [inModifica, impostaInModifica] = useState<RigaEstrattoConto | null>(null)
  const [dettagliId, impostaDettagliId] = useState<string | null>(null)
  const [nuovoAperto, impostaNuovoAperto] = useState(false)
  const [importaAperto, impostaImportaAperto] = useState(false)

  const queryClient = useQueryClient()
  /** Dopo ogni azione la lista si rilegge: i conteggi e i totali cambiano con lei. */
  const ricarica = () => {
    void queryClient.invalidateQueries({ queryKey: CHIAVE_QUERY_ESTRATTO })
  }

  const chiama = async (url: string, init: RequestInit, ok: string, ko: string) => {
    if (!(await invia(url, init, ko))) return
    toast.success(ok)
    ricarica()
  }

  const azioneInBlocco = async (azione: AzioneInBlocco, sezione?: SezioneMovimentoBancario) => {
    // «Tutte le N del filtro» non è l'elenco di ciò che si è visto scorrere: le
    // righe le ricalcola il server dallo stesso filtro della lista, altrimenti
    // l'azione toccherebbe solo la pagina caricata.
    const corpo = tutteDelFiltro
      ? { azione, sezione, filtro: Object.fromEntries(filtriInSearchParams(filtri)) }
      : { azione, sezione, ids: [...selezionati] }
    const esito = await invia<{ toccate: number; saltate: number }>(
      '/api/bank-transactions/azioni-in-blocco',
      { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(corpo) },
      'Azione non riuscita'
    )
    if (!esito) return
    const uno = esito.toccate === 1
    toast.success(
      `${esito.toccate} ${uno ? 'movimento' : 'movimenti'} ${FATTO[azione][uno ? 0 : 1]}` +
        (esito.saltate > 0
          ? ` · ${esito.saltate} ${
              esito.saltate === 1
                ? 'saltato perché collegato a una scrittura'
                : 'saltati perché collegati a una scrittura'
            }`
          : '')
    )
    impostaSelezionati(new Set())
    impostaTutteDelFiltro(false)
    ricarica()
  }

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
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button variant="outline" size="sm" onClick={() => impostaImportaAperto(true)}>
          <Upload className="mr-2 h-4 w-4" aria-hidden />
          Importa CSV
        </Button>
        <Button size="sm" onClick={() => impostaNuovoAperto(true)}>
          <Plus className="mr-2 h-4 w-4" aria-hidden />
          Nuovo movimento
        </Button>
      </div>
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
          onImporta={() => impostaImportaAperto(true)}
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
          onModifica={(riga) => impostaInModifica(riga)}
          onDettagli={(riga) => impostaDettagliId(riga.id)}
          onSposta={(riga, sezione) =>
            void chiama(
              `/api/bank-transactions/${riga.id}/sezione`,
              { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ sezione }) },
              'Movimento spostato',
              'Spostamento non riuscito'
            )
          }
          onCestino={(riga) =>
            void chiama(
              `/api/bank-transactions/${riga.id}`,
              { method: 'DELETE' },
              'Movimento nel Cestino',
              'Non è stato possibile cestinare il movimento'
            )
          }
          onRipristina={(riga) =>
            void chiama(
              `/api/bank-transactions/${riga.id}/ripristina`,
              { method: 'POST' },
              'Movimento ripristinato',
              'Ripristino non riuscito'
            )
          }
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
          onAzione={(azione, sezione) => void azioneInBlocco(azione, sezione)}
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

      <ModificaMovimentoDialog
        riga={inModifica}
        open={!!inModifica}
        onOpenChange={(aperto) => !aperto && impostaInModifica(null)}
        onSalvata={ricarica}
      />
      <TransactionDetailsDialog
        open={!!dettagliId}
        onOpenChange={(aperto) => !aperto && impostaDettagliId(null)}
        transactionId={dettagliId}
      />
      <NuovoMovimentoDialog open={nuovoAperto} onOpenChange={impostaNuovoAperto} onCreato={ricarica} />
      <ImportDialog open={importaAperto} onOpenChange={impostaImportaAperto} onSuccess={ricarica} />
    </div>
  )
}

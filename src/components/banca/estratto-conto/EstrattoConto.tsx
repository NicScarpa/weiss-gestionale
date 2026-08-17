'use client'

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
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
import {
  COLONNE,
  leggiColonneVisibili,
  salvaColonneVisibili,
  leggiRighePerPagina,
  type IdColonna,
} from './colonne'
import { SchedeEstrattoConto } from './SchedeEstrattoConto'
// Il pannello dei filtri e il tipo dei filtri portano lo stesso nome: qui
// servono entrambi, quindi il pannello entra come `PannelloFiltri`.
import { FiltriEstrattoConto as PannelloFiltri } from './FiltriEstrattoConto'
import { SelettoreColonne } from './SelettoreColonne'
import { TabellaEstrattoConto } from './TabellaEstrattoConto'
import { CategorizzaDialog, type BersaglioCategorizza } from './CategorizzaDialog'
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

const TUTTE_LE_COLONNE: ReadonlySet<IdColonna> = new Set(COLONNE.map((c) => c.id))

// Nessuno pubblica cambiamenti: ciò che interessa è solo lo scalino fra il
// render del server e il primo del browser. Le tre funzioni stanno fuori dal
// componente perché `useSyncExternalStore` le confronta per identità.
const nessunaIscrizione = () => () => {}
const nelBrowser = () => true
const sulServer = () => false

/**
 * Falso mentre si rende sul server e durante l'idratazione, vero subito dopo.
 *
 * È il modo che React offre per dire «questo si sa solo nel browser»: rende la
 * prima volta come ha reso il server — quindi le due marcature combaciano — e
 * poi ridà il valore vero con un secondo render. Un `useEffect` che chiama
 * `setState` otterrebbe lo stesso risultato ma è proprio il render a cascata
 * che `react-hooks/set-state-in-effect` vieta.
 */
function useIdratato(): boolean {
  return useSyncExternalStore(nessunaIscrizione, nelBrowser, sulServer)
}

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
  movimento: undefined,
} satisfies Partial<Filtri>

function ciSonoFiltri(filtri: Filtri): boolean {
  const campi = Object.keys(FILTRI_PULITI) as Array<keyof typeof FILTRI_PULITI>
  return campi.some((campo) => filtri[campo] !== FILTRI_PULITI[campo])
}

const JSON_HEADERS = { 'Content-Type': 'application/json' }

/** Che cosa è successo, al singolare e al plurale: «1 movimenti» si legge male. */
const FATTO: Record<Exclude<AzioneInBlocco, 'categorizza'>, [string, string]> = {
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
  // Le colonne nascoste vengono dal browser, che il server non ha: finché
  // l'idratazione non è finita si rende la tabella intera, come l'ha resa lui.
  //
  // Leggerle direttamente nell'inizializzatore dello `useState` faceva rendere
  // al server sei colonne e al client quelle rimaste — due marcature diverse
  // per lo stesso render, cioè lo scarto che React segnala all'idratazione. Il
  // prezzo è un lampo con una colonna in più; il guadagno è che React non
  // butta via l'albero appena ricevuto per rifarlo da capo.
  const [colonneScelte, impostaColonne] = useState<Set<IdColonna>>(() => leggiColonneVisibili(memoria()))
  const colonne = useIdratato() ? colonneScelte : TUTTE_LE_COLONNE
  const [selezionati, impostaSelezionati] = useState<Set<string>>(new Set())
  const [tutteDelFiltro, impostaTutteDelFiltro] = useState(false)
  const [inModifica, impostaInModifica] = useState<RigaEstrattoConto | null>(null)
  const [dettagliId, impostaDettagliId] = useState<string | null>(null)
  const [nuovoAperto, impostaNuovoAperto] = useState(false)
  const [importaAperto, impostaImportaAperto] = useState(false)
  const [daCategorizzare, impostaDaCategorizzare] = useState<BersaglioCategorizza | null>(null)

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
    if (azione === 'categorizza') {
      // Non una rotta insiemistica ma un dialogo: la scelta di conto e centro
      // vale per tutte le righe, poi il server le promuove una per una.
      impostaDaCategorizzare(
        tutteDelFiltro
          ? { tipo: 'filtro', filtro: Object.fromEntries(filtriInSearchParams(filtri)), totale }
          : { tipo: 'selezione', ids: [...selezionati] }
      )
      return
    }
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
  const totalePagine = data?.pagination.totalPages ?? 0

  // Un'azione in blocco può svuotare la pagina su cui si è: cestinare tutta la
  // pagina 3 di 3 lascia due pagine, e restare lì significa «Pagina 3 di 2»
  // sopra un elenco vuoto, che si legge come un guasto. Si scende all'ultima
  // pagina che esiste. `totalePagine === 0` (nessuna riga) non si tocca: la
  // pagina 1 è già quella giusta, e la lista lo dice col suo vuoto.
  //
  // Durante il render e non in un effetto: React lo prevede per riallineare
  // uno stato a un valore che arriva da fuori, e riparte subito col valore
  // corretto invece di far comparire per un istante la pagina impossibile.
  // Non si avvita perché dopo l'assegnazione `filtri.page` vale `totalePagine`.
  //
  // Qui non si passa da `applica`: quello avvisa anche il padre, che scrive
  // l'URL, e toccare un altro componente mentre si rende è vietato. L'URL
  // resta a `page=3` fino alla prima mossa di chi legge — e ricaricandolo la
  // correzione rifà se stessa, quindi non porta mai su una pagina che non c'è.
  if (totalePagine > 0 && filtri.page > totalePagine) {
    impostaFiltri({ ...filtri, page: totalePagine })
    // La selezione era di righe che quella pagina non mostra più.
    impostaSelezionati(new Set())
    impostaTutteDelFiltro(false)
  }

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
      {filtri.movimento && (
        <div className="flex items-center gap-3 rounded-lg border bg-muted/50 px-3 py-2 text-sm">
          <span>Stai guardando un solo movimento.</span>
          <Button variant="link" size="sm" className="h-auto p-0" onClick={() => cambiaFiltri({ movimento: undefined, page: 1 })}>
            Mostra tutti
          </Button>
        </div>
      )}
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
      {/* Sopra la tabella, non sotto: la selezione si fa in cima all'elenco e
          con cento righe a schermo una barra in fondo resta fuori dalla
          finestra — si spunta una casella e non succede niente di visibile.
          Qui è a un dito dalle caselle appena toccate. */}
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
          onCategorizza={(riga) => impostaDaCategorizzare({ tipo: 'riga', riga })}
        />
      )}
      {totalePagine > 1 && (
        <PaginazioneEstrattoConto
          pagina={filtri.page}
          totalePagine={totalePagine}
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
      <CategorizzaDialog
        bersaglio={daCategorizzare}
        open={!!daCategorizzare}
        onOpenChange={(aperto) => !aperto && impostaDaCategorizzare(null)}
        onFatto={() => {
          impostaSelezionati(new Set())
          impostaTutteDelFiltro(false)
          ricarica()
        }}
      />
    </div>
  )
}

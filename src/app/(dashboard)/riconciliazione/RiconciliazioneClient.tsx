'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CodaProposte, type FiltroFascia } from '@/components/riconciliazione/CodaProposte'
import { REGOLE_ATTIVE, SIGLE_ATTIVE } from '@/components/riconciliazione/regole'
import { formatDateShort } from '@/lib/constants'
import { romeDateKey } from '@/lib/timezone'
import type {
  EsitoGenerazioneLotto,
  LottoDiProposte,
  RispostaLotto,
} from '@/types/riconciliazione-assistita'

/**
 * La riconciliazione assistita: si sceglie un periodo, il motore propone, e si
 * decide una proposta per volta.
 *
 * **Lo stato sta nell'URL**, non in questo componente: `?lotto=<id>` apre la
 * coda di quel lotto, `?movimento=<id>` la restringe a una riga bancaria sola.
 * Serve a tre cose che altrimenti costerebbero codice: «Riprendi» dello storico
 * è un semplice link, l'indirizzo si incolla in una chat, e il collegamento
 * profondo che l'estratto conto apre già («Riconcilia» →
 * `/riconciliazione?movimento=…`) continua a funzionare senza che le due
 * schermate si conoscano.
 *
 * Senza `?lotto=` si vede la pagina d'ingresso: due date e, al posto di
 * un'illustrazione, l'elenco delle regole che il motore sta per applicare.
 * Occupa con una spiegazione lo spazio in cui chi guarda ha una domanda e
 * nessuna risposta.
 */

/** Nessun movimento bancario precede questa data: come estremo inferiore vale «tutto». */
const INIZIO_DI_TUTTO = '2000-01-01'

async function leggiJson(risposta: Response): Promise<Record<string, unknown>> {
  return (await risposta.json().catch(() => ({}))) as Record<string, unknown>
}

/** Il messaggio del server, che è quello che spiega perché: mai sostituirlo. */
function messaggioDi(corpo: Record<string, unknown>, riserva: string): string {
  return typeof corpo.error === 'string' && corpo.error ? corpo.error : riserva
}

export function RiconciliazioneClient() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const queryClient = useQueryClient()

  const lottoNellUrl = searchParams.get('lotto')
  const movimento = searchParams.get('movimento')

  // Arrivando dall'estratto conto con «Riconcilia» c'è il movimento ma non il
  // lotto: si apre l'ultima analisi fatta, che è quella in cui quel movimento
  // ha una proposta se ce l'ha. Senza nessuna analisi, resta la pagina
  // d'ingresso — col chip, così si capisce da dove si è arrivati.
  const cercaUltimoLotto = !lottoNellUrl && !!movimento
  const { data: storico, isFetching: cercaInCorso } = useQuery({
    queryKey: ['riconciliazione', 'lotti'],
    enabled: cercaUltimoLotto,
    queryFn: async (): Promise<{ lotti: LottoDiProposte[] }> => {
      const risposta = await fetch('/api/riconciliazione-assistita/lotti')
      if (!risposta.ok) throw new Error('Impossibile leggere lo storico delle analisi')
      return risposta.json()
    },
  })

  const lottoId = lottoNellUrl ?? storico?.lotti?.[0]?.id ?? null

  const {
    data: lotto,
    isPending: caricaLotto,
    isError: erroreLotto,
    error: dettaglioErroreLotto,
  } = useQuery({
    queryKey: ['riconciliazione', 'lotto', lottoId],
    enabled: !!lottoId,
    queryFn: async (): Promise<RispostaLotto> => {
      const risposta = await fetch(`/api/riconciliazione-assistita/lotti/${lottoId}`)
      if (!risposta.ok) {
        throw new Error(messaggioDi(await leggiJson(risposta), 'Analisi non leggibile'))
      }
      return risposta.json()
    },
  })

  // Il giorno civile italiano, non `toISOString()`: alle 00:30 di Roma l'UTC è
  // ancora ieri, e il periodo predefinito escluderebbe i movimenti di oggi.
  const oggi = React.useMemo(() => romeDateKey(new Date()), [])
  const primoGennaio = `${oggi.slice(0, 4)}-01-01`
  const [dal, setDal] = React.useState(primoGennaio)
  const [al, setAl] = React.useState(oggi)

  const genera = useMutation({
    mutationFn: async (): Promise<EsitoGenerazioneLotto> => {
      const risposta = await fetch('/api/riconciliazione-assistita/lotti', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dateFrom: dal, dateTo: al, regole: SIGLE_ATTIVE }),
      })
      const corpo = await leggiJson(risposta)
      if (!risposta.ok) throw new Error(messaggioDi(corpo, 'Calcolo delle proposte non riuscito'))
      return corpo as unknown as EsitoGenerazioneLotto
    },
    onSuccess: (esito) => {
      toast.success(
        esito.contaProposte === 0
          ? 'Nessuna proposta su questo periodo'
          : `${esito.contaProposte} proposte da rivedere`
      )
      const parametri = new URLSearchParams()
      parametri.set('lotto', esito.batchId)
      if (movimento) parametri.set('movimento', movimento)
      router.replace(`/riconciliazione?${parametri.toString()}`)
    },
    onError: (errore) => {
      toast.error(errore instanceof Error ? errore.message : 'Calcolo delle proposte non riuscito')
    },
  })

  const [fasciaScelta, setFasciaScelta] = React.useState<FiltroFascia | null>(null)
  // Alta è il punto di partenza quando c'è qualcosa in Alta: è la fascia in cui
  // si decide in fretta. Il valore si deriva dai contatori invece di essere
  // scritto in stato da un effetto — così quando l'ultima Alta viene approvata
  // la coda scivola da sola su «Tutte» e non resta a mostrare il vuoto.
  //
  // Con `?movimento=` si parte invece da «Tutte»: chi arriva dall'estratto
  // conto ha chiesto *quel* movimento, e un filtro ereditato dal lotto gli
  // direbbe «nessuna proposta» proprio quando la proposta c'è ma è Media.
  const fascia: FiltroFascia =
    fasciaScelta ?? (!movimento && lotto && lotto.contatori.alta > 0 ? 'alta' : 'tutte')

  const aggiornaLotto = () =>
    queryClient.invalidateQueries({ queryKey: ['riconciliazione', 'lotto', lottoId] })

  const approva = async (id: string) => {
    const risposta = await fetch(`/api/riconciliazione-assistita/proposte/${id}/approva`, {
      method: 'POST',
    })
    const corpo = await leggiJson(risposta)
    // Il messaggio del server arriva alla scheda dentro l'errore: è lì che
    // resta leggibile, invece di sparire in un toast dopo tre secondi.
    if (!risposta.ok) throw new Error(messaggioDi(corpo, 'Approvazione non riuscita'))
    toast.success('Approvata: la scrittura è in prima nota e la scadenza risulta pagata')
    await aggiornaLotto()
  }

  const scarta = async (id: string, opzioni: { perSempre: boolean; motivo?: string }) => {
    const risposta = await fetch(`/api/riconciliazione-assistita/proposte/${id}/scarta`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(
        opzioni.motivo ? { perSempre: opzioni.perSempre, motivo: opzioni.motivo } : { perSempre: opzioni.perSempre }
      ),
    })
    const corpo = await leggiJson(risposta)
    if (!risposta.ok) throw new Error(messaggioDi(corpo, 'Scarto non riuscito'))
    toast.success(opzioni.perSempre ? 'Non verrà più proposta' : 'Saltata per ora')
    await aggiornaLotto()
  }

  const periodoValido = dal <= al

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Riconciliazione assistita</h1>
          <p className="text-muted-foreground">
            Il motore propone gli abbinamenti fra movimenti bancari e scadenze; la decisione resta a
            chi guarda.
          </p>
        </div>
        {lottoId && (
          <Button variant="outline" onClick={() => router.replace('/riconciliazione')}>
            Nuova analisi
          </Button>
        )}
      </div>

      {movimento && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/50 px-3 py-2 text-sm">
          <span>Stai guardando un solo movimento</span>
          <Button
            variant="link"
            size="sm"
            className="h-auto p-0"
            onClick={() => router.replace(lottoId ? `/riconciliazione?lotto=${lottoId}` : '/riconciliazione')}
          >
            Mostra tutti
          </Button>
          <Link
            href={`/prima-nota/movimenti?register=BANK&movimento=${encodeURIComponent(movimento)}`}
            className="ml-auto underline-offset-4 hover:underline"
          >
            Torna all&apos;estratto conto
          </Link>
        </div>
      )}

      {cercaUltimoLotto && cercaInCorso ? (
        // Senza questo, arrivando da «Riconcilia» si vedrebbe lampeggiare la
        // pagina d'ingresso prima che l'ultima analisi si apra da sola.
        <p className="rounded-lg border bg-card p-6 text-center text-sm text-muted-foreground">
          Cerco l&apos;ultima analisi…
        </p>
      ) : !lottoId ? (
        <div className="space-y-6">
          <section className="space-y-4 rounded-lg border bg-card p-4 text-card-foreground">
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <Label htmlFor="riconciliazione-dal">Dal</Label>
                <Input
                  id="riconciliazione-dal"
                  type="date"
                  value={dal}
                  onChange={(e) => setDal(e.target.value)}
                  className="w-auto"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="riconciliazione-al">Al</Label>
                <Input
                  id="riconciliazione-al"
                  type="date"
                  value={al}
                  onChange={(e) => setAl(e.target.value)}
                  className="w-auto"
                />
              </div>
              <Button
                variant="outline"
                onClick={() => {
                  setDal(primoGennaio)
                  setAl(oggi)
                }}
              >
                Quest&apos;anno
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  // «Tutto» è un estremo inferiore più vecchio di qualsiasi
                  // riga bancaria: dà lo stesso insieme della data del primo
                  // movimento, senza doverla chiedere al server.
                  setDal(INIZIO_DI_TUTTO)
                  setAl(oggi)
                }}
              >
                Tutto
              </Button>
              <Button onClick={() => genera.mutate()} disabled={genera.isPending || !periodoValido}>
                {genera.isPending ? 'Calcolo…' : 'Calcola Proposte'}
              </Button>
            </div>
            {!periodoValido && (
              <p role="alert" className="text-sm text-destructive">
                La data iniziale deve precedere quella finale.
              </p>
            )}
            {movimento && (
              <p className="text-sm text-muted-foreground">
                Non c&apos;è ancora nessuna analisi: calcolane una per vedere le proposte di questo
                movimento.
              </p>
            )}
          </section>

          {/* Lo stato di attesa didattico: dire cosa il motore sta per cercare
              vale più di un'illustrazione, e si legge anche mentre calcola. */}
          <section className="space-y-3">
            <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
              Cosa cerca il motore
            </h2>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {REGOLE_ATTIVE.map((regola) => (
                <li key={regola.sigla} className="min-w-0 rounded-lg border bg-card p-3 text-card-foreground">
                  <p className="text-sm font-medium">
                    {regola.sigla} · {regola.titolo}
                  </p>
                  <p className="mt-1 break-words text-sm text-muted-foreground">{regola.descrizione}</p>
                </li>
              ))}
            </ul>
            <p className="text-sm text-muted-foreground">
              Ogni proposta porta il suo punteggio, i sei fattori che lo compongono e le frasi che
              spiegano cosa lo alza e cosa lo abbassa.
            </p>
          </section>
        </div>
      ) : erroreLotto ? (
        <p role="alert" className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {dettaglioErroreLotto instanceof Error ? dettaglioErroreLotto.message : 'Analisi non leggibile'}
        </p>
      ) : caricaLotto || !lotto ? (
        <p className="rounded-lg border bg-card p-6 text-center text-sm text-muted-foreground">
          Carico le proposte…
        </p>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Analisi dal {formatDateShort(lotto.lotto.dateFrom)} al {formatDateShort(lotto.lotto.dateTo)} ·{' '}
            {lotto.contatori.totali} proposte calcolate
          </p>
          <CodaProposte
            proposte={lotto.proposte}
            contatori={lotto.contatori}
            fascia={fascia}
            onFascia={setFasciaScelta}
            onApprova={approva}
            onScarta={scarta}
            movimento={movimento}
          />
        </div>
      )}
    </div>
  )
}

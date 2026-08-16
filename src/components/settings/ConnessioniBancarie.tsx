'use client'

import { useCallback, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { AlertCircle, RefreshCw, Wifi } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatDateShort } from '@/lib/constants'
import { PREAVVISO_GIORNI, giorniAllaScadenza } from '@/lib/gocardless/scadenza'
import { eDaRifare } from '@/lib/gocardless/stati'
import { RigaContoBancario } from './RigaContoBancario'
import { useRipristinoDaCache } from '@/lib/hooks/useRipristinoDaCache'
import { StatoSincronizzazione } from './StatoSincronizzazione'
import { WizardCollegamento } from './WizardCollegamento'

export interface ContoBancarioDelGestionale {
  id: string
  name: string
}

interface StatoRequisition {
  sigla: string
  nome: string
  spiegazione: string
}

interface Connessione {
  id: string
  istitutoNome: string
  stato: StatoRequisition
  scadeIl: string | null
}

interface ContoDaBanca {
  providerAccountId: string
  iban: string | null
  ibanHash: string | null
  intestatario: string | null
  valuta: string | null
}

export type ContoInPannello = (
  | { tipo: 'riconosciuto' | 'gia-collegato'; bankAccountId: string; nomeConto: string }
  | { tipo: 'sconosciuto' | 'ignorato' }
) & {
  conto: ContoDaBanca
  ibanMascherato: string | null
  ultimoMovimento: string | null
  syncEnabled: boolean
  syncCutoffDate: string | null
}

export type Scelta =
  | { azione: 'lascia' }
  | { azione: 'ignora' }
  | { azione: 'configura'; bankAccountId: string; dataTaglio: string; attivo: boolean }

interface RispostaConti {
  stato: StatoRequisition
  conti: ContoInPannello[]
  lettiIl: string | null
}

export function ConnessioniBancarie({ contiBancari }: { contiBancari: ContoBancarioDelGestionale[] }) {
  const queryClient = useQueryClient()
  const [scelte, setScelte] = useState<Record<string, Scelta>>({})
  const [inCorso, setInCorso] = useState<'salvataggio' | 'aggiornamento' | 'scollegamento' | 'rinnovo' | null>(null)
  const [wizardAperto, setWizardAperto] = useState(false)

  const {
    data: datiCollegamento,
    isError: erroreCollegamento,
    refetch: ricaricaCollegamento,
  } = useQuery({
    queryKey: ['gocardless-collegamento'],
    refetchOnMount: 'always',
    staleTime: 0,
    // Una rilettura involontaria (focus, riconnessione) azzererebbe le scelte
    // non ancora salvate più sotto: la si vuole solo quando è l'amministratore
    // a chiederla esplicitamente (mount o pulsante), non come effetto
    // collaterale del tornare su questa scheda del browser.
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: async (): Promise<{ connessione: Connessione | null }> => {
      const res = await fetch('/api/gocardless/collegamenti')
      if (!res.ok) throw new Error('Errore nel caricamento del collegamento')
      return res.json()
    },
  })

  const connessione = datiCollegamento?.connessione ?? null

  const {
    data: datiConti,
    isError: erroreConti,
    refetch: ricaricaConti,
  } = useQuery({
    queryKey: ['gocardless-conti', connessione?.id],
    enabled: Boolean(connessione),
    refetchOnMount: 'always',
    staleTime: 0,
    // Stesso motivo della query sopra: qui una rilettura azzera le scelte non
    // salvate, quindi niente refetch involontari fuori dal mount o dal
    // pulsante «Aggiorna dalla banca».
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    // Senza `retry: false` il client di default ne fa tre. Questa query, a
    // memoria vuota, contatta la banca (`leggiRequisition` più un
    // `dettagliConto` per conto — il contingente è quattro al giorno PER
    // CONTO): un 429 su un solo conto già al limite, o un 502, verrebbe
    // ritentato tre volte, e i conti che precedono quello fallito pagherebbero
    // `dettagliConto` a ogni tentativo. Quattro giri esauriscono il
    // contingente di tutti gli altri conti, e «Riprova» ne farebbe partire
    // altri quattro.
    retry: false,
    queryFn: async (): Promise<RispostaConti> => {
      // Senza `aggiorna=1`: la rotta risponde dalla memoria. Chiedere alla
      // banca costa una chiamata per conto su quattro al giorno, ed è un
      // gesto che l'amministratore deve fare apposta.
      const res = await fetch(`/api/gocardless/collegamenti/${connessione!.id}/conti`)
      if (!res.ok) throw new Error('Errore nel caricamento dei conti')
      return res.json()
    },
  })

  // Il collegamento porta l'utente sul portale della banca. Al ritorno col
  // tasto Indietro il browser ripristina la pagina dalla bfcache: niente si
  // rimonta, nessuna query si rilegge, e il pannello resta con i quattro
  // pulsanti e nessuno che porti altrove finché non si ricarica a mano.
  //
  // Si rilegge **solo il collegamento**, non l'elenco dei conti: è lo stato
  // (UA → LN) che rende inerte il pannello, mentre l'altra query azzera le
  // scelte non salvate a ogni rilettura — vedi `refetchOnWindowFocus: false`
  // qui sopra, messo esattamente per non farlo per sbaglio.
  useRipristinoDaCache(useCallback(() => { void ricaricaCollegamento() }, [ricaricaCollegamento]))

  const conti = datiConti?.conti ?? []

  const [contiPrecedenti, setContiPrecedenti] = useState(datiConti)

  // Ogni rilettura riparte da ciò che è salvato: le scelte non confermate non
  // devono sopravvivere a un aggiornamento e far salvare qualcosa che
  // l'amministratore crede di aver scartato. Aggiustato durante il render
  // (non in un effetto): è il pattern che React raccomanda per azzerare uno
  // stato quando cambiano i dati da cui dipende, senza il giro in più di un
  // effetto che scatterebbe un secondo render.
  if (datiConti !== contiPrecedenti) {
    setContiPrecedenti(datiConti)
    setScelte({})
  }

  const scelta = (c: ContoInPannello): Scelta =>
    scelte[c.conto.providerAccountId] ?? { azione: 'lascia' }

  const cambia = (providerAccountId: string, nuova: Scelta) =>
    setScelte((precedenti) => ({ ...precedenti, [providerAccountId]: nuova }))

  const daSalvare = Object.entries(scelte).filter(([, s]) => s.azione !== 'lascia')
  const senzaData = daSalvare.some(([, s]) => s.azione === 'configura' && !s.dataTaglio)
  const senzaConto = daSalvare.some(([, s]) => s.azione === 'configura' && !s.bankAccountId)

  async function salva() {
    if (!connessione) return
    setInCorso('salvataggio')
    try {
      const res = await fetch(`/api/gocardless/collegamenti/${connessione.id}/conti`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conti: daSalvare.map(([providerAccountId, s]) =>
            s.azione === 'configura'
              ? {
                  providerAccountId,
                  azione: 'configura' as const,
                  bankAccountId: s.bankAccountId,
                  dataTaglio: s.dataTaglio,
                  attivo: s.attivo,
                }
              : { providerAccountId, azione: 'ignora' as const }
          ),
        }),
      })
      const corpo = await res.json()
      if (!res.ok) {
        toast.error(corpo.error ?? 'Salvataggio non riuscito')
        return
      }
      toast.success('Configurazione salvata')
      await ricaricaConti()
    } catch {
      toast.error('Salvataggio non riuscito')
    } finally {
      setInCorso(null)
    }
  }

  async function aggiornaDallaBanca() {
    if (!connessione) return
    setInCorso('aggiornamento')
    try {
      const res = await fetch(`/api/gocardless/collegamenti/${connessione.id}/conti?aggiorna=1`)
      const corpo = await res.json()
      if (!res.ok) {
        toast.error(corpo.error ?? 'Aggiornamento non riuscito')
        return
      }
      // `corpo` è già la stessa forma che la query si aspetta: si scrive
      // direttamente in cache invece di richiamare `ricaricaConti()`. Sul
      // percorso normale quella seconda lettura risponde dalla memoria e non
      // costa nulla, ma quando la memoria non è stata scritta — requisition
      // non ancora `LN`, o zero conti per un errore a metà giro — questa GET
      // ricontatterebbe la banca una seconda volta, vanificando il perché
      // esiste questo bottone invece di un refresh qualunque.
      queryClient.setQueryData<RispostaConti>(['gocardless-conti', connessione.id], corpo)
      toast.success('Elenco aggiornato')
    } catch {
      toast.error('Aggiornamento non riuscito')
    } finally {
      setInCorso(null)
    }
  }

  async function scollega() {
    if (!connessione) return
    setInCorso('scollegamento')
    try {
      const res = await fetch(`/api/gocardless/collegamenti/${connessione.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const corpo = await res.json()
        toast.error(corpo.error ?? 'Scollegamento non riuscito')
        return
      }
      toast.success('Banca scollegata')
      await ricaricaCollegamento()
    } catch {
      toast.error('Scollegamento non riuscito')
    } finally {
      setInCorso(null)
    }
  }

  // Non ripetibile: apre una pratica di consenso vera presso la banca, sul
  // contingente di quattro chiamate al giorno. Lo stesso schema di
  // `vaiAllaBancaInCorso` in WizardCollegamento.tsx e di `invioRef` in
  // payment-dialog.tsx — un ref sincrono, valorizzato prima di qualunque
  // `await`, perché `setInCorso` si applica al render successivo e tre clic
  // ravvicinati eseguirebbero tutti questa closure prima che React abbia
  // ridisegnato il pulsante disabilitato.
  const rinnovoInCorso = useRef(false)

  async function rinnova() {
    if (!connessione) return
    if (rinnovoInCorso.current) return
    rinnovoInCorso.current = true
    setInCorso('rinnovo')
    try {
      const res = await fetch(`/api/gocardless/collegamenti/${connessione.id}/rinnovo`, { method: 'POST' })
      const corpo = await res.json()
      if (!res.ok) {
        // Il traduttore delle risposte (`rispostaErroreGoCardless`) esiste
        // apposta perché il client non debba indovinare cosa dire per un 429
        // o un 502: si mostra il messaggio che arriva, non uno inventato qui.
        toast.error(corpo.error ?? 'Il rinnovo non è riuscito')
        rinnovoInCorso.current = false
        setInCorso(null)
        return
      }
      // Qui, a differenza del wizard, non si azzera la guardia sul successo:
      // nel wizard `setStep('viaggio')` smonta il pulsante, quindi non c'è
      // più niente da ripremere. Qui l'avviso resta a schermo con lo stesso
      // pulsante mentre il browser sta ancora navigando verso la banca —
      // riaprire la guardia lo lascerebbe cliccabile, e un secondo clic
      // manderebbe una seconda POST /rinnovo con un secondo agreement e una
      // seconda requisition, rischiando di far autenticare l'amministratore
      // su quella che il gestionale ha già dimenticato.
      window.location.href = corpo.link
    } catch {
      toast.error('Il rinnovo non è riuscito')
      rinnovoInCorso.current = false
      setInCorso(null)
    }
  }

  // Un errore di lettura non è «non hai mai collegato nulla»: un
  // amministratore con un collegamento sano e un errore passeggero non va
  // invitato a rifare da capo una procedura che richiede di autenticarsi in
  // banca. I due stati vanno distinti, non entrambi appiattiti sulla stessa
  // schermata vuota.
  if (erroreCollegamento) {
    return (
      <Card className="border-dashed">
        <CardHeader>
          <CardTitle className="text-base">Open Banking</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Lettura del collegamento non riuscita</AlertTitle>
            <AlertDescription>
              Non sono riuscito a sapere se una banca è già collegata. Potrebbe esserlo:
              ripeti la lettura prima di collegarne una nuova.
            </AlertDescription>
          </Alert>
          <Button variant="outline" size="sm" onClick={() => ricaricaCollegamento()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Riprova
          </Button>
        </CardContent>
      </Card>
    )
  }

  if (!connessione) {
    return (
      <Card className="border-dashed">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-50">
              <Wifi className="h-5 w-5 text-blue-500" />
            </div>
            <div>
              <CardTitle className="text-base">Open Banking</CardTitle>
              <p className="text-sm text-muted-foreground">
                Collega l&apos;home banking per leggere i movimenti dei conti, senza più esportare
                file dalla banca.
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Button onClick={() => setWizardAperto(true)}>Collega la banca</Button>
          <WizardCollegamento aperto={wizardAperto} onChiudi={() => setWizardAperto(false)} />
        </CardContent>
      </Card>
    )
  }

  const giorni = giorniAllaScadenza(connessione.scadeIl)
  const inScadenza = giorni !== null && giorni <= PREAVVISO_GIORNI
  // RJ ed EX sono gli stati «da rifare» (`eDaRifare`, in stati.ts): un
  // collegamento rifiutato non ha mai avuto una scadenza (`accessValidUntil`
  // si scrive solo quando lo stato diventa `LN`, mai per RJ), quindi
  // `inScadenza` da sola — che guarda solo la data — non lo intercetterebbe
  // mai, e il pannello direbbe «va rifatto» nel sottotitolo senza offrire
  // nulla da premere.
  const daRifare = eDaRifare(connessione.stato.sigla)
  const mostraAvvisoRinnovo = inScadenza || daRifare
  // «Scaduto» e «da rifare» sono lo stesso avviso, urgente: la banca non
  // risponde già ora, non fra qualche giorno. Il banner della dashboard
  // (`BannerConsenso.tsx`) distingue solo scaduto/non scaduto perché lì la
  // data è l'unico segnale che ha; qui il problema è lo stesso testo, la
  // variante «destructive» in più.
  const scaduto = daRifare || (giorni !== null && giorni < 0)

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">{connessione.istitutoNome}</CardTitle>
            <p className="text-sm text-muted-foreground">{connessione.stato.nome}</p>
            {connessione.stato.sigla !== 'LN' && (
              <p className="text-xs text-muted-foreground">{connessione.stato.spiegazione}</p>
            )}
            {connessione.scadeIl && (
              <p className="mt-1 text-xs text-muted-foreground">
                Il consenso scade il {formatDateShort(connessione.scadeIl)}
                {giorni !== null && giorni >= 0 && ` (fra ${giorni} giorni)`}.
              </p>
            )}
          </div>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="sm" disabled={inCorso !== null}>Scollega</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Scollegare {connessione.istitutoNome}?</AlertDialogTitle>
                <AlertDialogDescription>
                  I movimenti già importati restano dove sono: si interrompe solo la lettura dalla
                  banca. Per riprenderla servirà autenticarsi di nuovo in home banking.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Annulla</AlertDialogCancel>
                <AlertDialogAction onClick={scollega}>Scollega</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {mostraAvvisoRinnovo && (
          <Alert variant={scaduto ? 'destructive' : 'default'}>
            <AlertTitle>{scaduto ? 'Il consenso va rinnovato' : 'Il consenso sta per scadere'}</AlertTitle>
            <AlertDescription>
              <p>
                {scaduto
                  ? 'La banca ha smesso di rispondere: i movimenti non arrivano più finché non lo rinnovi.'
                  : 'Alla scadenza la banca smette di rispondere e i movimenti smettono di arrivare.'}
                {' '}Il rinnovo richiede solo una nuova autenticazione in home banking, e conserva
                abbinamenti, interruttori e date così come sono — a differenza di «Scollega» qui
                sopra, che li perde.
              </p>
              <Button variant="outline" size="sm" className="mt-1" onClick={rinnova} disabled={inCorso !== null}>
                Rinnova il consenso
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {erroreConti ? (
          // Un errore qui non è «collegato, nessun conto coperto»: un elenco
          // vuoto per un errore di lettura nasconderebbe conti che esistono
          // davvero, e salvare in questo stato configurerebbe zero conti.
          <div className="space-y-3">
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Lettura dei conti non riuscita</AlertTitle>
              <AlertDescription>
                Non sono riuscito a leggere l&apos;elenco dei conti coperti dal consenso. Non è
                detto che siano zero: riprova prima di considerarlo tale.
              </AlertDescription>
            </Alert>
            <Button variant="outline" size="sm" onClick={() => ricaricaConti()}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Riprova
            </Button>
          </div>
        ) : (
          <>
            <div className="space-y-3">
              {conti.map((c) => (
                <RigaContoBancario
                  key={c.conto.providerAccountId}
                  conto={c}
                  scelta={scelta(c)}
                  contiBancari={contiBancari}
                  onCambia={(nuova) => cambia(c.conto.providerAccountId, nuova)}
                />
              ))}
            </div>

            {/* Meglio dirlo che lasciare qualcuno a cercarli fra le scritture:
                i movimenti scaricati non diventano scritture contabili, stanno
                nell'estratto conto del Conto Bancario. */}
            <p className="text-xs text-muted-foreground">
              Qui si sceglie soltanto quali conti importare. I movimenti scaricati dalla banca si
              trovano nei movimenti bancari della prima nota (Conto Bancario → Estratto conto).
            </p>
          </>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={aggiornaDallaBanca}
              disabled={inCorso !== null}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Aggiorna dalla banca
            </Button>
            <p className="text-xs text-muted-foreground">
              {datiConti?.lettiIl
                ? `Elenco del ${formatDateShort(datiConti.lettiIl)}.`
                : 'Elenco mai aggiornato.'}{' '}
              Ogni aggiornamento consuma una delle quattro letture giornaliere per conto.
            </p>
          </div>
          <Button
            onClick={salva}
            disabled={inCorso !== null || daSalvare.length === 0 || senzaData || senzaConto}
          >
            Salva
          </Button>
        </div>

        <StatoSincronizzazione />
      </CardContent>
    </Card>
  )
}

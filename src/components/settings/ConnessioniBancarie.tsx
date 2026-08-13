'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
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
import { RigaContoBancario } from './RigaContoBancario'
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
  const [scelte, setScelte] = useState<Record<string, Scelta>>({})
  const [inCorso, setInCorso] = useState<'salvataggio' | 'aggiornamento' | 'scollegamento' | null>(null)
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
    queryFn: async (): Promise<RispostaConti> => {
      // Senza `aggiorna=1`: la rotta risponde dalla memoria. Chiedere alla
      // banca costa una chiamata per conto su quattro al giorno, ed è un
      // gesto che l'amministratore deve fare apposta.
      const res = await fetch(`/api/gocardless/collegamenti/${connessione!.id}/conti`)
      if (!res.ok) throw new Error('Errore nel caricamento dei conti')
      return res.json()
    },
  })

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
      await ricaricaConti()
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
        {inScadenza && (
          <Alert>
            <AlertTitle>Il consenso sta per scadere</AlertTitle>
            <AlertDescription>
              Alla scadenza la banca smette di rispondere. Rinnovarlo richiede solo una nuova
              autenticazione in home banking: conti, interruttori e date restano come sono.
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

            {/* Meglio dirlo che lasciare qualcuno ad aspettare movimenti che
                nessuno sta ancora scaricando. */}
            <p className="text-xs text-muted-foreground">
              Nessuna sincronizzazione è attiva: qui si sceglie soltanto quali conti importare. I
              movimenti arriveranno con il passo successivo.
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
      </CardContent>
    </Card>
  )
}

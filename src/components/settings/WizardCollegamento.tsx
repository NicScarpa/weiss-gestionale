'use client'

/**
 * Il dialogo a passi che porta l'amministratore fino alla banca.
 *
 * Tre passi, come `CaricaMovimentiDialog`: un `useState<Step>` dentro un
 * `Dialog`, niente rotta o storia del browser propria.
 *
 * Il viaggio in banca azzera la memoria del browser: dopo la conferma si
 * naviga via con `window.location.href`, e al ritorno il pannello che
 * contiene questo wizard riparte da capo (una nuova lettura di
 * `GET /api/gocardless/collegamenti`). Non c'è quindi nulla da conservare
 * attraverso quel salto: l'unico stato che sopravvive a un'apertura è
 * quello che si azzera alla chiusura, qui sotto.
 */
import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AlertCircle, Loader2, Search } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

interface Istituto {
  id: string
  nome: string
  bic: string | null
  giorniStorico: number | null
  giorniAccesso: number | null
}

type Step = 'scegli' | 'conferma' | 'viaggio'

function descrizioneValidita(i: Istituto): string {
  return `${i.giorniStorico ?? '—'} giorni di storico · accesso valido ${i.giorniAccesso ?? '—'} giorni`
}

export function WizardCollegamento({ aperto, onChiudi }: { aperto: boolean; onChiudi: () => void }) {
  const [step, setStep] = useState<Step>('scegli')
  const [ricerca, setRicerca] = useState('')
  const [istitutoScelto, setIstitutoScelto] = useState<Istituto | null>(null)
  const [errore, setErrore] = useState<string | null>(null)

  // Come in `CaricaMovimentiDialog`: alla chiusura si azzera lo stato, non
  // all'apertura. Il ritardo è cosmetico (non far vedere il passo 1
  // "saltare fuori" mentre l'animazione di chiusura è ancora in corso) e non
  // ha nulla da fare con la richiesta alla banca, che parte solo da un clic.
  useEffect(() => {
    if (!aperto) {
      setTimeout(() => {
        setStep('scegli')
        setRicerca('')
        setIstitutoScelto(null)
        setErrore(null)
      }, 300)
    }
  }, [aperto])

  const {
    data: datiIstituzioni,
    isError: erroreIstituzioni,
    isPending: istituzioniInAttesa,
    isFetching: istituzioniInLettura,
    refetch: ricaricaIstituzioni,
  } = useQuery({
    queryKey: ['gocardless-istituzioni'],
    // Solo all'apertura: caricare l'elenco al montaggio del pannello (che
    // contiene sempre questo componente, aperto o no) sprecherebbe una
    // lettura che l'amministratore potrebbe non chiedere mai.
    enabled: aperto,
    refetchOnMount: 'always',
    staleTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    // Senza `retry: false` il client di default ritenta tre volte: qui non
    // costa il contingente per conto, ma un istituto scelto mentre il primo
    // tentativo sta ancora ritentando in sottofondo mostrerebbe un elenco
    // che sta per essere rimpiazzato sotto i piedi dell'amministratore.
    retry: false,
    queryFn: async (): Promise<{ istituzioni: Istituto[] }> => {
      const res = await fetch('/api/gocardless/istituzioni')
      if (!res.ok) throw new Error('Errore nel caricamento degli istituti')
      return res.json()
    },
  })

  const caricamentoIstituzioni = istituzioniInAttesa || istituzioniInLettura
  const istituzioni = datiIstituzioni?.istituzioni ?? []
  const filtro = ricerca.trim().toLowerCase()
  const filtrate = filtro ? istituzioni.filter((i) => i.nome.toLowerCase().includes(filtro)) : istituzioni

  function scegli(i: Istituto) {
    setIstitutoScelto(i)
    setStep('conferma')
  }

  // Non ripetibile: crea una richiesta di consenso vera presso la banca, e
  // quella richiesta costa sul contingente di quattro chiamate al giorno.
  // Smontare il pulsante passando a `step: 'viaggio'` NON basta da solo:
  // `setStep` si applica al render successivo, non subito, e più eventi di
  // clic ravvicinati (doppio clic reale, o solo una rete lenta) eseguono
  // tutti questa stessa closure prima che React abbia rimontato — tre clic,
  // tre `fetch`. Il ref è sincrono e condiviso fra tutte le invocazioni
  // ravvicinate, a differenza dello stato React: si valorizza qui, prima di
  // qualunque `await`, con lo stesso schema di `payment-dialog.tsx`
  // (`invioRef`). Si azzera sempre in `finally`, non solo sull'errore:
  // sul successo la pagina sta per navigare via comunque, quindi
  // azzerarlo anche lì è innocuo, ma tenerlo bloccato dopo un 409/503
  // impedirebbe di ripartire da «Torna indietro».
  const vaiAllaBancaInCorso = useRef(false)

  async function vaiAllaBanca() {
    if (!istitutoScelto) return
    if (vaiAllaBancaInCorso.current) return
    vaiAllaBancaInCorso.current = true
    setStep('viaggio')
    setErrore(null)
    try {
      const res = await fetch('/api/gocardless/collegamenti', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ istitutoId: istitutoScelto.id }),
      })
      const corpo = await res.json()
      if (!res.ok) {
        // Il traduttore delle risposte (`rispostaErroreGoCardless`) esiste
        // apposta perché il client non debba indovinare cosa dire per un 409
        // o un 503: si mostra il messaggio che arriva, non uno inventato qui.
        setErrore(corpo.error ?? 'Il collegamento non è riuscito')
        return
      }
      window.location.href = corpo.link
    } catch {
      setErrore('Il collegamento non è riuscito')
    } finally {
      vaiAllaBancaInCorso.current = false
    }
  }

  return (
    <Dialog
      open={aperto}
      onOpenChange={(v) => {
        if (!v) onChiudi()
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Collega una banca</DialogTitle>
        </DialogHeader>

        {step === 'scegli' && (
          <div className="space-y-4">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="cerca-istituto"
                placeholder="Cerca la tua banca…"
                className="pl-9"
                value={ricerca}
                onChange={(e) => setRicerca(e.target.value)}
              />
            </div>

            {erroreIstituzioni ? (
              <div className="space-y-3">
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Lettura degli istituti non riuscita</AlertTitle>
                  <AlertDescription>Riprova fra poco.</AlertDescription>
                </Alert>
                <Button variant="outline" size="sm" onClick={() => ricaricaIstituzioni()}>
                  Riprova
                </Button>
              </div>
            ) : caricamentoIstituzioni ? (
              <p className="text-sm text-muted-foreground">Caricamento…</p>
            ) : filtrate.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nessuna banca trovata.</p>
            ) : (
              <div className="max-h-72 space-y-2 overflow-y-auto">
                {filtrate.map((i) => (
                  <button
                    key={i.id}
                    type="button"
                    onClick={() => scegli(i)}
                    className="block w-full rounded-md border p-3 text-left hover:bg-accent"
                  >
                    <p className="text-sm font-medium">{i.nome}</p>
                    <p className="text-xs text-muted-foreground">{descrizioneValidita(i)}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {step === 'conferma' && istitutoScelto && (
          <div className="space-y-4">
            <div className="space-y-1 rounded-md border p-3">
              <p className="text-sm font-medium">{istitutoScelto.nome}</p>
              <p className="text-xs text-muted-foreground">{descrizioneValidita(istitutoScelto)}</p>
            </div>
            <p className="text-sm text-muted-foreground">
              Si sta per concedere a {istitutoScelto.nome} l&apos;accesso a saldi, dettagli e movimenti, per
              tutta la durata indicata sopra. Il consenso si dà in home banking, non qui: si viene
              rimandati alla banca per autenticarsi.
            </p>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setStep('scegli')}>
                Indietro
              </Button>
              <Button onClick={vaiAllaBanca}>Vai alla banca</Button>
            </DialogFooter>
          </div>
        )}

        {step === 'viaggio' &&
          (errore ? (
            <div className="space-y-4">
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Collegamento non riuscito</AlertTitle>
                <AlertDescription>{errore}</AlertDescription>
              </Alert>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setStep('conferma')}>
                  Torna indietro
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-3 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Ti sto portando alla banca…
            </div>
          ))}
      </DialogContent>
    </Dialog>
  )
}

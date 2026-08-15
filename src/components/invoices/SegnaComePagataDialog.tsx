'use client'

/**
 * «Segna come pagata»: associa una rata della fattura al denaro che l'ha
 * saldata.
 *
 * Prende il posto di «Registra in Prima Nota», che scriveva un'uscita di banca
 * a partire dalla sola fattura. Qui non nasce mai un movimento bancario dal
 * documento: o si sceglie un movimento già in prima nota — importato
 * dall'estratto conto o inserito a mano — oppure, per il contante, si crea un
 * movimento di CASSA vero alla data in cui il denaro è uscito. In entrambi i
 * casi il legame è una riconciliazione, non una scrittura inventata.
 *
 * Spec: docs/superpowers/specs/2026-08-15-fatture-non-generano-movimenti-design.md
 */

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Banknote, Landmark, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { formatCurrencyOrZero as formatCurrency } from '@/lib/formatters'
import { formatDateIT } from '@/lib/invoice-utils'
import { romeDateKey } from '@/lib/timezone'

/** Stati in cui una scadenza non ha più nulla da saldare. */
const STATI_CHIUSI = new Set(['pagata', 'annullata'])

export interface ScadenzaDaSaldare {
  id: string
  stato: string
  importoTotale: string | number
  importoPagato: string | number
  dataScadenza?: string
  descrizione?: string
}

interface Candidato {
  journalEntryId: string
  confidence: number
  description: string
  date: string
  amount: number
}

interface SegnaComePagataDialogProps {
  invoiceId: string
  schedules: ScadenzaDaSaldare[]
  open: boolean
  onOpenChange: (open: boolean) => void
}

function residuoDi(s: ScadenzaDaSaldare): number {
  return Number(s.importoTotale) - Number(s.importoPagato)
}

async function caricaCandidati(scheduleId: string): Promise<{ candidati: Candidato[] }> {
  const res = await fetch(`/api/scadenzario/${scheduleId}/riconciliazioni`)
  if (!res.ok) throw new Error('Errore nel caricamento dei movimenti candidati')
  return res.json()
}

async function associaMovimento(scheduleId: string, journalEntryId: string, amount: number) {
  const res = await fetch(`/api/scadenzario/${scheduleId}/riconciliazioni`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ journalEntryId, amount }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || "Errore nell'associazione del movimento")
  return data
}

async function pagaInContanti(scheduleId: string, dataPagamento: string, importo: number) {
  const res = await fetch(`/api/scadenzario/${scheduleId}/paga-in-contanti`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dataPagamento, importo }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Errore nella registrazione del pagamento')
  return data
}

export function SegnaComePagataDialog({
  invoiceId,
  schedules,
  open,
  onOpenChange,
}: SegnaComePagataDialogProps) {
  const queryClient = useQueryClient()

  const aperte = schedules.filter((s) => !STATI_CHIUSI.has(s.stato))

  const [scadenzaId, setScadenzaId] = useState<string>(aperte[0]?.id ?? '')
  const [strada, setStrada] = useState<'movimento' | 'contanti'>('movimento')
  const [movimentoScelto, setMovimentoScelto] = useState<string>('')
  const [dataPagamento, setDataPagamento] = useState<string>(romeDateKey(new Date()))
  const [importo, setImporto] = useState<string>('')
  const [errore, setErrore] = useState<string>('')

  const scadenza = aperte.find((s) => s.id === scadenzaId) ?? aperte[0]
  const residuo = scadenza ? residuoDi(scadenza) : 0
  const importoScelto = importo === '' ? residuo : Number(importo)

  const { data: candidatiData, isLoading: candidatiInCaricamento } = useQuery({
    queryKey: ['riconciliazioni-candidati', scadenza?.id],
    queryFn: () => caricaCandidati(scadenza!.id),
    enabled: open && !!scadenza && strada === 'movimento',
  })

  const chiudiEAggiorna = (messaggio: string) => {
    queryClient.invalidateQueries({ queryKey: ['invoice', invoiceId] })
    queryClient.invalidateQueries({ queryKey: ['invoices'] })
    queryClient.invalidateQueries({ queryKey: ['scadenzario'] })
    toast.success(messaggio)
    setErrore('')
    setMovimentoScelto('')
    setImporto('')
    onOpenChange(false)
  }

  const mutazione = useMutation({
    mutationFn: async () => {
      if (!scadenza) throw new Error('Nessuna rata da saldare')

      if (strada === 'contanti') {
        return pagaInContanti(scadenza.id, dataPagamento, importoScelto)
      }

      if (!movimentoScelto) throw new Error('Scegli il movimento che ha saldato la rata')
      return associaMovimento(scadenza.id, movimentoScelto, importoScelto)
    },
    onSuccess: () =>
      chiudiEAggiorna(
        strada === 'contanti'
          ? 'Pagamento in contanti registrato'
          : 'Movimento associato alla fattura'
      ),
    // L'errore si mostra dentro la finestra e non la chiude: quello che il
    // server dice — «la quota supera il residuo», «già riconciliata» — è
    // un'informazione da leggere prima di correggere, non un toast che scappa.
    onError: (err: Error) => setErrore(err.message),
  })

  const candidati = candidatiData?.candidati ?? []

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* `sm:max-w-2xl` e non `max-w-2xl`: tailwind-merge non fonde classi con
          breakpoint diversi, e la larghezza base `sm:max-w-lg` del DialogContent
          vincerebbe lasciando la finestra stretta. */}
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Segna come pagata</DialogTitle>
          <DialogDescription>
            La fattura si collega al denaro che l&apos;ha pagata: un movimento già in
            prima nota, oppure un movimento di cassa che registriamo adesso.
          </DialogDescription>
        </DialogHeader>

        {/* `min-w-0`: un figlio di flex/grid non scende sotto la larghezza del
            proprio contenuto, e una causale lunga farebbe scorrere la finestra
            in orizzontale. */}
        <div className="space-y-5 min-w-0">
          {aperte.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Questa fattura non ha rate da saldare.
            </p>
          )}

          {aperte.length > 1 && (
            <div className="space-y-2">
              <Label>Quale rata</Label>
              <RadioGroup value={scadenzaId} onValueChange={setScadenzaId}>
                {aperte.map((s) => (
                  <div key={s.id} className="flex items-center gap-2 min-w-0">
                    <RadioGroupItem value={s.id} id={`rata-${s.id}`} />
                    <Label htmlFor={`rata-${s.id}`} className="font-normal truncate">
                      {s.dataScadenza ? `Scadenza ${formatDateIT(s.dataScadenza)} — ` : ''}
                      residuo {formatCurrency(residuoDi(s))}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </div>
          )}

          {scadenza && (
            <>
              <div className="space-y-2">
                <Label>Come è stata pagata</Label>
                <RadioGroup
                  value={strada}
                  onValueChange={(v) => {
                    setStrada(v as 'movimento' | 'contanti')
                    setErrore('')
                  }}
                >
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="movimento" id="strada-movimento" />
                    <Label htmlFor="strada-movimento" className="font-normal">
                      <Landmark className="mr-2 inline h-4 w-4" />
                      Con un movimento già in prima nota
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="contanti" id="strada-contanti" />
                    <Label htmlFor="strada-contanti" className="font-normal">
                      <Banknote className="mr-2 inline h-4 w-4" />
                      In contanti, movimento non ancora registrato
                    </Label>
                  </div>
                </RadioGroup>
              </div>

              {strada === 'movimento' && (
                <div className="space-y-2 min-w-0">
                  <Label>Quale movimento</Label>
                  {candidatiInCaricamento && (
                    <p className="text-sm text-muted-foreground">Cerco i movimenti…</p>
                  )}
                  {!candidatiInCaricamento && candidati.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      Nessun movimento compatibile in prima nota. Importa l&apos;estratto
                      conto, oppure registra il pagamento in contanti.
                    </p>
                  )}
                  <RadioGroup value={movimentoScelto} onValueChange={setMovimentoScelto}>
                    {candidati.map((c) => (
                      <div key={c.journalEntryId} className="flex items-start gap-2 min-w-0">
                        <RadioGroupItem
                          value={c.journalEntryId}
                          id={`mov-${c.journalEntryId}`}
                          className="mt-1"
                        />
                        <Label
                          htmlFor={`mov-${c.journalEntryId}`}
                          className="font-normal min-w-0"
                        >
                          <span className="block truncate">{c.description}</span>
                          <span className="block text-xs text-muted-foreground">
                            {formatDateIT(c.date)} — {formatCurrency(Math.abs(c.amount))}
                            {' · '}
                            affinità {Math.round(c.confidence * 100)}%
                          </span>
                        </Label>
                      </div>
                    ))}
                  </RadioGroup>
                </div>
              )}

              {strada === 'contanti' && (
                <div className="space-y-2">
                  <Label htmlFor="data-pagamento">Quando l&apos;hai pagata</Label>
                  <Input
                    id="data-pagamento"
                    type="date"
                    value={dataPagamento}
                    onChange={(e) => setDataPagamento(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    È la data in cui il denaro è uscito dalla cassa, non quella della
                    fattura: il saldo si muove da lì.
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="importo">Importo</Label>
                <Input
                  id="importo"
                  type="number"
                  step="0.01"
                  placeholder={residuo.toFixed(2)}
                  value={importo}
                  onChange={(e) => setImporto(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Vuoto significa saldare il residuo: {formatCurrency(residuo)}.
                </p>
              </div>
            </>
          )}

          {errore && <p className="text-sm text-destructive">{errore}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annulla
          </Button>
          <Button
            onClick={() => mutazione.mutate()}
            disabled={
              mutazione.isPending ||
              !scadenza ||
              (strada === 'movimento' && !movimentoScelto)
            }
          >
            {mutazione.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Segna come pagata
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

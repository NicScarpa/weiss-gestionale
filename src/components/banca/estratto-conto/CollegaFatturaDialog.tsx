'use client'

import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import { Search } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { useDebounce } from '@/hooks/useDebounce'
import { formatCurrency } from '@/lib/formatters'
import { cn } from '@/lib/utils'
import type { RigaEstrattoConto } from '@/types/reconciliation'

/** Una scadenza come la restituisce `GET /api/scadenzario` (i soli campi usati qui). */
interface ScadenzaAperta {
  id: string
  descrizione: string
  dataScadenza: string
  numeroDocumento: string | null
  controparteNome: string | null
  importoResiduo: number
  supplier: { id: string; name: string } | null
}

/** Una scrittura BANK senza riga bancaria (`GET /api/prima-nota?senzaRigaBancaria=true`). */
interface ScritturaLibera {
  id: string
  date: string
  description: string
  debitAmount: number | null
  creditAmount: number | null
  documentRef: string | null
  account: { code: string; name: string } | null
}

interface Props {
  riga: RigaEstrattoConto | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onFatto: () => void
}

const JSON_HEADERS = { 'Content-Type': 'application/json' }
const TOLLERANZA = 0.005

const arrotonda = (n: number) => Math.round(n * 100) / 100
const giorno = (d: string | Date) => format(new Date(d), 'dd/MM/yyyy', { locale: it })
/** Da un importo digitato («55,50») al numero; ciò che non si legge vale 0. */
const leggiImporto = (testo: string) => arrotonda(Number(testo.replace(/\./g, '').replace(',', '.')) || 0)
const scriviImporto = (n: number) => n.toFixed(2).replace('.', ',')
function spostaGiorni(d: string | Date, giorni: number): string {
  const x = new Date(d)
  x.setUTCDate(x.getUTCDate() + giorni)
  return x.toISOString().slice(0, 10)
}

/**
 * Collega fattura: due schede (spec, «Le azioni»). *Fattura / scadenza*: le
 * scadenze aperte del verso giusto, col residuo di ciascuna, più d'una con la
 * sua quota; *Scrittura esistente*: le scritture BANK non ancora legate a una
 * riga — la R4. Entrambe chiamano la promozione.
 */
export function CollegaFatturaDialog({ riga, open, onOpenChange, onFatto }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[720px]">
        {riga && <Modulo key={riga.id} riga={riga} onChiudi={() => onOpenChange(false)} onFatto={onFatto} />}
      </DialogContent>
    </Dialog>
  )
}

function Modulo({ riga, onChiudi, onFatto }: { riga: RigaEstrattoConto; onChiudi: () => void; onFatto: () => void }) {
  const entrata = riga.amount > 0
  const importoRiga = Math.abs(riga.amount)
  // Su una riga collegata con documenti che non coprono tutto («Collega altra
  // fattura») si può imputare solo il residuo; su una riga libera, tutto.
  const residuoRiga = riga.matchedEntryId && !riga.proposta ? (riga.residuoDocumenti ?? 0) : importoRiga

  const [scheda, setScheda] = React.useState<'scadenze' | 'scrittura'>('scadenze')
  const [ricerca, setRicerca] = React.useState('')
  const ricercaDifferita = useDebounce(ricerca, 300)
  /** scheduleId → importo digitato (testo, con la virgola). */
  const [scelte, setScelte] = React.useState<Map<string, string>>(new Map())
  const [scritturaId, setScritturaId] = React.useState<string | null>(null)
  const [inCorso, setInCorso] = React.useState(false)

  const scadenze = useQuery({
    queryKey: ['collega-fattura', 'scadenze', riga.id, entrata, ricercaDifferita],
    queryFn: async (): Promise<ScadenzaAperta[]> => {
      const sp = new URLSearchParams({
        aperte: '1',
        tipo: entrata ? 'attiva' : 'passiva',
        limit: '20',
        sortBy: 'dataScadenza',
        sortOrder: 'asc',
      })
      if (ricercaDifferita.trim()) sp.set('search', ricercaDifferita.trim())
      const r = await fetch(`/api/scadenzario?${sp}`)
      if (!r.ok) throw new Error('Errore nel caricamento delle scadenze')
      return ((await r.json()) as { data: ScadenzaAperta[] }).data
    },
    enabled: scheda === 'scadenze',
  })

  const scritture = useQuery({
    queryKey: ['collega-fattura', 'scritture', riga.id, entrata, ricercaDifferita],
    queryFn: async (): Promise<ScritturaLibera[]> => {
      // ±30 giorni dalla data del movimento: la scrittura di una chiusura sta
      // lì vicino; una ricerca per testo allarga dentro la stessa finestra.
      const sp = new URLSearchParams({
        registerType: 'BANK',
        senzaRigaBancaria: 'true',
        direction: entrata ? 'inflow' : 'outflow',
        dateFrom: spostaGiorni(riga.transactionDate, -30),
        dateTo: spostaGiorni(riga.transactionDate, 30),
        limit: '20',
      })
      if (ricercaDifferita.trim()) sp.set('search', ricercaDifferita.trim())
      const r = await fetch(`/api/prima-nota?${sp}`)
      if (!r.ok) throw new Error('Errore nel caricamento delle scritture')
      return ((await r.json()) as { data: ScritturaLibera[] }).data
    },
    enabled: scheda === 'scrittura',
  })

  const importoDi = (id: string) => leggiImporto(scelte.get(id) ?? '')
  const totale = arrotonda([...scelte.keys()].reduce((somma, id) => somma + importoDi(id), 0))
  const eccede = totale > residuoRiga + TOLLERANZA
  const importiNonValidi = [...scelte.keys()].some((id) => importoDi(id) <= 0)

  const spunta = (s: ScadenzaAperta, on: boolean) => {
    const prossime = new Map(scelte)
    if (on) {
      // La quota proposta è il minore fra il residuo della scadenza e ciò che
      // resta della riga dopo le altre spunte: un bonifico cumulativo si
      // ripartisce da sé, e si corregge a mano dove serve.
      const proposta = Math.max(0, Math.min(s.importoResiduo, arrotonda(residuoRiga - totale)))
      prossime.set(s.id, scriviImporto(proposta))
    } else {
      prossime.delete(s.id)
    }
    setScelte(prossime)
  }

  const invia = async () => {
    const corpo =
      scheda === 'scadenze'
        ? { scadenze: [...scelte.keys()].map((scheduleId) => ({ scheduleId, amount: importoDi(scheduleId) })) }
        : { scritturaEsistenteId: scritturaId }
    setInCorso(true)
    try {
      const r = await fetch(`/api/bank-transactions/${riga.id}/collega`, {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify(corpo),
      })
      const json = (await r.json().catch(() => ({}))) as { error?: string; residuo?: number; reconciliationIds?: string[] }
      if (!r.ok) throw new Error(json.error || 'Collegamento non riuscito')
      if (scheda === 'scadenze') {
        const n = json.reconciliationIds?.length ?? scelte.size
        toast.success(
          `${n === 1 ? 'Scadenza collegata' : `${n} scadenze collegate`}` +
            ((json.residuo ?? 0) > 0 ? ` · resta un residuo di ${formatCurrency(json.residuo ?? 0)}` : '')
        )
      } else {
        toast.success('Movimento collegato alla scrittura')
      }
      onFatto()
      onChiudi()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Errore sconosciuto')
    } finally {
      setInCorso(false)
    }
  }

  const puoInviare =
    !inCorso && (scheda === 'scadenze' ? scelte.size > 0 && !eccede && !importiNonValidi : !!scritturaId)

  return (
    <>
      <DialogHeader>
        <DialogTitle>Collega fattura</DialogTitle>
        <DialogDescription>
          Movimento del {giorno(riga.transactionDate)} · {entrata ? '+' : '−'}
          {formatCurrency(importoRiga)} · <span className="break-words">{riga.descrizione ?? riga.description}</span>
        </DialogDescription>
      </DialogHeader>

      <Tabs value={scheda} onValueChange={(v) => setScheda(v as 'scadenze' | 'scrittura')}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="scadenze">Fattura / scadenza</TabsTrigger>
          <TabsTrigger value="scrittura">Scrittura esistente</TabsTrigger>
        </TabsList>

        <div className="relative mt-3">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden />
          <Input
            aria-label={scheda === 'scadenze' ? 'Cerca fra le scadenze' : 'Cerca fra le scritture'}
            placeholder={scheda === 'scadenze' ? 'Fornitore, numero, descrizione…' : 'Descrizione…'}
            className="pl-8"
            value={ricerca}
            onChange={(e) => setRicerca(e.target.value)}
          />
        </div>

        <TabsContent value="scadenze" className="mt-3 space-y-3">
          <div className="max-h-[40vh] overflow-y-auto rounded-md border">
            {scadenze.isPending ? (
              <p className="p-3 text-sm text-muted-foreground">Caricamento…</p>
            ) : (scadenze.data ?? []).length === 0 ? (
              <p className="p-3 text-sm text-muted-foreground">Nessuna scadenza aperta corrisponde.</p>
            ) : (
              <ul className="divide-y">
                {(scadenze.data ?? []).map((s) => {
                  const scelta = scelte.has(s.id)
                  const nome = s.supplier?.name ?? s.controparteNome ?? s.descrizione
                  return (
                    <li key={s.id} className={cn('flex flex-wrap items-center gap-3 px-3 py-2 text-sm', scelta && 'bg-muted/50')}>
                      <Checkbox
                        aria-label={`Seleziona ${s.descrizione}`}
                        checked={scelta}
                        onCheckedChange={(v) => spunta(s, v === true)}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium" title={s.descrizione}>
                          {s.descrizione}
                        </div>
                        <div className="truncate text-xs text-muted-foreground">
                          {nome}
                          {s.numeroDocumento ? ` · ${s.numeroDocumento}` : ''} · scade il {giorno(s.dataScadenza)}
                        </div>
                      </div>
                      <div className="text-right text-xs text-muted-foreground">
                        residuo
                        <div className="text-sm font-medium text-foreground">{formatCurrency(s.importoResiduo)}</div>
                      </div>
                      {scelta && (
                        <Input
                          aria-label={`Importo per ${s.descrizione}`}
                          inputMode="decimal"
                          className="w-28 text-right"
                          value={scelte.get(s.id) ?? ''}
                          onChange={(e) => setScelte(new Map(scelte).set(s.id, e.target.value))}
                        />
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className={cn(eccede ? 'text-destructive' : 'text-muted-foreground')}>
              Imputato {formatCurrency(totale)} di {formatCurrency(residuoRiga)}
              {eccede && ' — gli importi superano il residuo del movimento'}
              {!eccede && importiNonValidi && ' — ogni quota deve essere positiva'}
            </span>
          </div>
        </TabsContent>

        <TabsContent value="scrittura" className="mt-3 space-y-3">
          {/* Niente `role="radiogroup"` sul contenitore: fra il gruppo e i
              `radio` ci sarebbero `ul`/`li`, ruoli che lì non sono ammessi, e
              i `<input type="radio">` con lo stesso `name` formano già un
              gruppo da sé. */}
          <div className="max-h-[40vh] overflow-y-auto rounded-md border">
            {scritture.isPending ? (
              <p className="p-3 text-sm text-muted-foreground">Caricamento…</p>
            ) : (scritture.data ?? []).length === 0 ? (
              <p className="p-3 text-sm text-muted-foreground">Nessuna scrittura libera in questi giorni.</p>
            ) : (
              <ul className="divide-y">
                {(scritture.data ?? []).map((e) => {
                  const importo = e.debitAmount ?? e.creditAmount ?? 0
                  const stessoImporto = Math.abs(importo - importoRiga) < TOLLERANZA
                  return (
                    <li key={e.id}>
                      <label className={cn('flex cursor-pointer items-center gap-3 px-3 py-2 text-sm', scritturaId === e.id && 'bg-muted/50')}>
                        <input
                          type="radio"
                          name="scrittura-esistente"
                          aria-label={`Scegli ${e.description}`}
                          checked={scritturaId === e.id}
                          onChange={() => setScritturaId(e.id)}
                        />
                        <span className="w-20 shrink-0 text-muted-foreground">{giorno(e.date)}</span>
                        <span className="min-w-0 flex-1 truncate" title={e.description}>
                          {e.description}
                          {/* Il riferimento del documento distingue due
                              scritture che si somigliano: è il campo che il
                              server manda già e che qui si buttava. */}
                          {e.documentRef && (
                            <span className="ml-1 text-xs text-muted-foreground">· {e.documentRef}</span>
                          )}
                          {e.account && <span className="ml-1 text-xs text-muted-foreground">{e.account.code}</span>}
                        </span>
                        <span className={cn('font-medium', stessoImporto && 'text-emerald-700')}>{formatCurrency(importo)}</span>
                      </label>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Scritture del registro Banca non ancora legate a una riga della banca, nei 30 giorni prima e dopo il movimento; in
            verde quelle dello stesso importo. La riga si lega alla scrittura così com&apos;è, senza crearne una nuova.
          </p>
        </TabsContent>
      </Tabs>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onChiudi} disabled={inCorso}>
          Annulla
        </Button>
        <Button type="button" onClick={invia} disabled={!puoInviare}>
          {inCorso ? 'Collegamento…' : 'Collega'}
        </Button>
      </DialogFooter>
    </>
  )
}

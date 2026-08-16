import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search, SlidersHorizontal } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useDebounce } from '@/hooks/useDebounce'
// Il tipo dei filtri e questo pannello portano lo stesso nome nella spec:
// dentro il file convivono, quindi il tipo entra come `Filtri`.
import type { FiltriEstrattoConto as Filtri } from '@/lib/banca/filtri-estratto-conto'

interface Props {
  filtri: Filtri
  onCambia: (parziali: Partial<Filtri>) => void
  onCancellaFiltri: () => void
}

/** Radix Select non accetta il valore vuoto: «tutti» ha bisogno di un suo segnaposto. */
const TUTTI = '__tutti__'

interface ContoBancario {
  id: string
  name: string
}

async function leggiConti(): Promise<ContoBancario[]> {
  const r = await fetch('/api/bank-accounts?type=BANK')
  if (!r.ok) throw new Error('Errore nel recupero dei conti bancari')
  const risposta = await r.json()
  return Array.isArray(risposta?.accounts) ? risposta.accounts : []
}

export function FiltriEstrattoConto({ filtri, onCambia, onCancellaFiltri }: Props) {
  const { data: conti } = useQuery({ queryKey: ['bank-accounts', 'BANK'], queryFn: leggiConti })

  // La casella di ricerca tiene il proprio testo e filtra quando la digitazione
  // si ferma. Il `disabled` durante il caricamento non va rimesso: il browser
  // toglie il focus a un campo disabilitato e si riesce a scrivere una lettera
  // per volta (lezione dello scadenzario).
  const [ricerca, impostaRicerca] = useState(filtri.search ?? '')
  const ricercaDifferita = useDebounce(ricerca, 300)
  // Ultimo testo consegnato al padre: distingue «l'ho scritto io» da «i filtri
  // sono cambiati da fuori», che è ciò che rende innocua la sincronizzazione
  // nei due versi.
  const ultimaInviata = useRef(filtri.search ?? '')

  useEffect(() => {
    if (ricercaDifferita === ultimaInviata.current) return
    ultimaInviata.current = ricercaDifferita
    onCambia({ search: ricercaDifferita.trim() || undefined, page: 1 })
    // `filtri` e `onCambia` cambiano identità a ogni render del padre: metterli
    // fra le dipendenze rifarebbe partire il timer a ogni giro.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ricercaDifferita])

  // Verso opposto: se i filtri vengono azzerati altrove, la casella si svuota.
  useEffect(() => {
    const esterna = filtri.search ?? ''
    if (esterna === ultimaInviata.current) return
    ultimaInviata.current = esterna
    impostaRicerca(esterna)
  }, [filtri.search])

  const dateAttive = (filtri.dateFrom ? 1 : 0) + (filtri.dateTo ? 1 : 0)

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-[200px] max-w-sm flex-1">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground opacity-50" aria-hidden />
        <Input
          placeholder="Cerca descrizione, causale, note…"
          aria-label="Cerca fra i movimenti"
          value={ricerca}
          onChange={(e) => impostaRicerca(e.target.value)}
          className="pl-8"
        />
      </div>

      <Select
        value={filtri.tipo}
        onValueChange={(v) => onCambia({ tipo: v as Filtri['tipo'], page: 1 })}
      >
        <SelectTrigger className="w-[140px]" aria-label="Tipo di movimento">
          <SelectValue placeholder="Tipo" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="tutti">Tutti</SelectItem>
          <SelectItem value="entrate">Entrate</SelectItem>
          <SelectItem value="uscite">Uscite</SelectItem>
        </SelectContent>
      </Select>

      <Select
        value={filtri.bankAccountId ?? TUTTI}
        onValueChange={(v) => onCambia({ bankAccountId: v === TUTTI ? undefined : v, page: 1 })}
      >
        <SelectTrigger className="w-[180px]" aria-label="Conto bancario">
          <SelectValue placeholder="Conto" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={TUTTI}>Tutti i conti</SelectItem>
          {(conti ?? []).map((conto) => (
            <SelectItem key={conto.id} value={conto.id}>
              {conto.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="flex items-center gap-2">
        <Checkbox
          id="solo-non-riconciliati"
          checked={filtri.soloNonRiconciliati}
          onCheckedChange={(v) => onCambia({ soloNonRiconciliati: v === true, page: 1 })}
        />
        <Label htmlFor="solo-non-riconciliati" className="text-sm font-normal">
          Solo non riconciliati
        </Label>
      </div>

      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm">
            <SlidersHorizontal className="mr-2 h-4 w-4" aria-hidden />
            Filtri
            {dateAttive > 0 && (
              <Badge variant="secondary" className="ml-2">
                {dateAttive}
              </Badge>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-64 space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="data-da">Da</Label>
            <Input
              id="data-da"
              type="date"
              value={filtri.dateFrom ?? ''}
              onChange={(e) => onCambia({ dateFrom: e.target.value || undefined, page: 1 })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="data-a">A</Label>
            <Input
              id="data-a"
              type="date"
              value={filtri.dateTo ?? ''}
              onChange={(e) => onCambia({ dateTo: e.target.value || undefined, page: 1 })}
            />
          </div>
          <Button variant="ghost" size="sm" className="w-full" onClick={onCancellaFiltri}>
            Cancella filtri
          </Button>
        </PopoverContent>
      </Popover>
    </div>
  )
}

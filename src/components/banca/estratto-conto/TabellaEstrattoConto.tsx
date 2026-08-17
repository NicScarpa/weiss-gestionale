import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import Link from 'next/link'
import { ArrowDownLeft, ArrowUpRight, Pencil, Trash2, RotateCcw, MoreHorizontal, Tag, ArrowLeftRight, Link2, Unlink } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { formatCurrency } from '@/lib/formatters'
import { cn } from '@/lib/utils'
import type { RigaEstrattoConto, SezioneMovimentoBancario } from '@/types/reconciliation'
import type { FiltriEstrattoConto, OrdinaPer } from '@/lib/banca/filtri-estratto-conto'
import { COLONNE, type IdColonna } from './colonne'
import { IntestazioneOrdinabile } from './IntestazioneOrdinabile'
import { IconaStato } from './IconaStato'

interface Props {
  righe: RigaEstrattoConto[]
  filtri: FiltriEstrattoConto
  colonneVisibili: ReadonlySet<IdColonna>
  selezionati: Set<string>
  caricamento: boolean
  onOrdina: (campo: OrdinaPer) => void
  onSeleziona: (id: string, selezionata: boolean) => void
  onSelezionaPagina: (selezionata: boolean) => void
  onModifica: (riga: RigaEstrattoConto) => void
  onDettagli: (riga: RigaEstrattoConto) => void
  onSposta: (riga: RigaEstrattoConto, sezione: SezioneMovimentoBancario) => void
  onCestino: (riga: RigaEstrattoConto) => void
  onRipristina: (riga: RigaEstrattoConto) => void
  onCategorizza: (riga: RigaEstrattoConto) => void
  onCollega: (riga: RigaEstrattoConto) => void
  onScollega: (riga: RigaEstrattoConto) => void
}

const SEZIONI: Array<{ valore: SezioneMovimentoBancario; etichetta: string }> = [
  { valore: 'ATTIVI', etichetta: 'Attivi' },
  { valore: 'DELEGHE_F24', etichetta: 'Deleghe F24' },
  { valore: 'CBILL_PAGOPA', etichetta: 'CBILL-PagoPA' },
]

export function TabellaEstrattoConto(p: Props) {
  const colonne = COLONNE.filter((c) => p.colonneVisibili.has(c.id))
  const tuttePagina = p.righe.length > 0 && p.righe.every((r) => p.selezionati.has(r.id))
  return (
    <div className="overflow-x-auto rounded-lg border bg-background">
      <table className="w-full text-sm">
        <thead className="border-b bg-muted/50">
          <tr>
            <th className="w-10 px-3">
              <Checkbox
                aria-label="Seleziona la pagina"
                checked={tuttePagina}
                onCheckedChange={(v) => p.onSelezionaPagina(v === true)}
              />
            </th>
            {colonne.map((c) => (
              <IntestazioneOrdinabile
                key={c.id}
                etichetta={c.etichetta}
                ordina={c.ordina}
                attivo={p.filtri.ordina}
                verso={p.filtri.verso}
                aDestra={c.aDestra}
                onOrdina={p.onOrdina}
              />
            ))}
            <th className="px-3 text-right">Azioni</th>
          </tr>
        </thead>
        {/* Durante un ricaricamento le righe restano al loro posto, appena
            smorzate: sostituirle con uno scheletro farebbe saltare la pagina
            a ogni ordinamento. */}
        <tbody className={cn(p.caricamento && 'opacity-60')}>
          {p.righe.map((r) => (
            <tr key={r.id} className="border-b last:border-0 hover:bg-muted/30">
              <td className="px-3">
                <Checkbox
                  aria-label={`Seleziona ${r.descrizione ?? r.description}`}
                  checked={p.selezionati.has(r.id)}
                  onCheckedChange={(v) => p.onSeleziona(r.id, v === true)}
                />
              </td>
              {colonne.map((c) => (
                <td key={c.id} className={cn('px-3 py-2 align-top', c.aDestra && 'text-right')}>
                  {cella(c.id, r)}
                </td>
              ))}
              <td className="px-3 py-2 text-right whitespace-nowrap">
                <Button variant="ghost" size="icon" aria-label="Modifica" onClick={() => p.onModifica(r)}>
                  <Pencil className="h-4 w-4" aria-hidden />
                </Button>
                {/* Collega fattura / Scollega: l'icona cambia con lo stato del
                    legame (spec, «Le azioni»); una proposta da rivedere non è un
                    legame. Nel Cestino non si tocca la contabilità. */}
                {!p.filtri.cestino &&
                  (r.matchedEntryId && !r.proposta ? (
                    <Button variant="ghost" size="icon" aria-label="Scollega" onClick={() => p.onScollega(r)}>
                      <Unlink className="h-4 w-4" aria-hidden />
                    </Button>
                  ) : (
                    <Button variant="ghost" size="icon" aria-label="Collega fattura" onClick={() => p.onCollega(r)}>
                      <Link2 className="h-4 w-4" aria-hidden />
                    </Button>
                  ))}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" aria-label="Altre azioni">
                      <MoreHorizontal className="h-4 w-4" aria-hidden />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {!p.filtri.cestino && (
                      <>
                        <DropdownMenuItem onClick={() => p.onCategorizza(r)}>
                          <Tag className="mr-2 h-4 w-4" aria-hidden />
                          Categorizza
                        </DropdownMenuItem>
                        {/* Un bonifico che copre più fatture si può completare senza
                            scollegare: la promozione riusa la scrittura. */}
                        {r.stato === 'parziale' && (
                          <DropdownMenuItem onClick={() => p.onCollega(r)}>
                            <Link2 className="mr-2 h-4 w-4" aria-hidden />
                            Collega altra fattura
                          </DropdownMenuItem>
                        )}
                        {/* Riconcilia porta allo strumento, filtrato su questa
                            riga: oggi la pagina di riconciliazione, domani la
                            coda delle proposte allo stesso indirizzo. Solo
                            sulle righe non collegate: una collegata non ha
                            nulla da riconciliare. */}
                        {(!r.matchedEntryId || r.proposta) && (
                          <DropdownMenuItem asChild>
                            <Link href={`/riconciliazione?movimento=${r.id}`}>
                              <ArrowLeftRight className="mr-2 h-4 w-4" aria-hidden />
                              Riconcilia
                            </Link>
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSub>
                          <DropdownMenuSubTrigger>Sposta in</DropdownMenuSubTrigger>
                          <DropdownMenuSubContent>
                            {SEZIONI.filter((s) => s.valore !== r.sezione).map((s) => (
                              <DropdownMenuItem key={s.valore} onClick={() => p.onSposta(r, s.valore)}>
                                {s.etichetta}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuSubContent>
                        </DropdownMenuSub>
                      </>
                    )}
                    <DropdownMenuItem onClick={() => p.onDettagli(r)}>Vedi dettagli</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                {p.filtri.cestino ? (
                  <Button variant="ghost" size="icon" aria-label="Ripristina" onClick={() => p.onRipristina(r)}>
                    <RotateCcw className="h-4 w-4" aria-hidden />
                  </Button>
                ) : (
                  <Button variant="ghost" size="icon" aria-label="Sposta nel Cestino" onClick={() => p.onCestino(r)}>
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function cella(id: IdColonna, r: RigaEstrattoConto) {
  switch (id) {
    case 'data':
      return (
        <div className="whitespace-nowrap">
          {format(new Date(r.transactionDate), 'dd/MM/yy', { locale: it })}
          <div className="mt-1 flex gap-1">
            {/* Chi ha creato la riga e se è stata toccata a mano: i due fatti
                che spiegano perché un numero non combacia con l'estratto. */}
            {r.importSource === 'MANUAL' && (
              <Badge variant="outline" className="text-[10px]">
                Manuale
              </Badge>
            )}
            {r.modificato && (
              <Badge
                variant="outline"
                className="border-amber-400 bg-amber-50 text-[10px] text-amber-800 dark:bg-amber-950 dark:text-amber-200"
              >
                Modificato
              </Badge>
            )}
          </div>
        </div>
      )
    case 'descrizione': {
      const testo = r.descrizione ?? r.description
      return (
        <span className="block max-w-[28rem] truncate" title={testo}>
          {testo || '—'}
        </span>
      )
    }
    case 'causale':
      return (
        <span className="block max-w-[12rem] truncate text-muted-foreground" title={r.causale ?? ''}>
          {r.causale ?? '—'}
        </span>
      )
    case 'conto':
      return r.bankAccount ? <Badge className="bg-violet-700 hover:bg-violet-700">{r.bankAccount.name}</Badge> : '—'
    case 'categoria': {
      const scrittura = r.matchedEntry
      // Una proposta da rivedere porta una scrittura che nessuno ha confermato:
      // la sua categoria non è ancora quella della riga.
      if (!scrittura || r.proposta) return <span className="text-muted-foreground">—</span>
      // Dalla scrittura collegata (spec, decisione 3): conto e centro; senza
      // conto (una R4 senza imputazione, o una collega senza fornitore) si
      // dice «da imputare» — è collegata, ma la categoria manca ancora.
      return (
        <div className="max-w-[16rem]">
          {scrittura.account ? (
            <span className="block truncate" title={`${scrittura.account.code} ${scrittura.account.name}`}>
              <span className="font-mono text-xs text-muted-foreground">{scrittura.account.code}</span> {scrittura.account.name}
            </span>
          ) : (
            <span className="text-muted-foreground">da imputare</span>
          )}
          {scrittura.costCenter && (
            <span className="block truncate text-xs text-muted-foreground" title={scrittura.costCenter.name}>
              {scrittura.costCenter.code} · {scrittura.costCenter.name}
            </span>
          )}
        </div>
      )
    }
    case 'stato':
      return <IconaStato stato={r.stato} residuo={r.residuo} proposta={r.proposta} />
    case 'importo': {
      const entrata = r.amount > 0
      return (
        <span
          className={cn(
            'inline-flex items-center gap-1 whitespace-nowrap font-medium',
            entrata ? 'text-emerald-600' : 'text-red-600'
          )}
        >
          {entrata ? (
            <ArrowDownLeft className="h-3.5 w-3.5" aria-hidden />
          ) : (
            <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
          )}
          {entrata ? '+' : '−'}
          {formatCurrency(Math.abs(r.amount))}
        </span>
      )
    }
  }
}

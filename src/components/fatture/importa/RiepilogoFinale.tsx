'use client'

/**
 * Ultimo passo del wizard: il riepilogo di ciò che è successo.
 *
 * È qui che si vede la differenza con CashKing: il loro riepilogo elenca solo
 * file, numero, fornitore e stato, senza modo di isolare le righe che
 * interessano né di vederne il dettaglio. Qui i contatori filtrano la
 * tabella, e ogni riga si apre sui dati completi della fattura — comprese le
 * ragioni di un fallimento, non solo l'etichetta «Errore».
 */
import { Fragment, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { CheckCircle2Icon, ChevronDownIcon, ChevronRightIcon } from 'lucide-react'
import { formatCurrency } from '@/lib/formatters'
import { cn } from '@/lib/utils'
import { ETICHETTE_STATO, formattaData, type StatoRiga } from './tipi'
import type { RigaAnteprima } from './PassoAnteprima'

export interface EsitoRiga {
  chiave: string
  nomeFile: string
  numero: string
  denominazioneFornitore: string
  stato: StatoRiga
  messaggio?: string
  fattura: RigaAnteprima // il dettaglio completo, per l'espansione
  /** Solo sul ramo `importata`, preso dal corpo della 201. Opzionale per non
   * rompere il test verbatim del brief, che non lo valorizza. */
  fornitoreCreato?: boolean
}

export type FiltroEsito = 'tutte' | StatoRiga

interface Props {
  esiti: EsitoRiga[]
  /** Quante fatture il server dice di avere davvero in archivio, rilette dopo
   * l'importazione. `null` quando la rilettura non è stata possibile (rete,
   * 500): allora il confronto non si può fare, e dirlo è meglio che dare per
   * scontato zero. */
  fattureCreate: number | null
  fornitoriCreati: number
  onChiudi: () => void
  onRicomincia: () => void
}

const VARIANTE_BADGE: Record<StatoRiga, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  importata: 'default',
  duplicata: 'secondary',
  errore: 'destructive',
  esclusa: 'outline',
}

/** «1 fattura importata» / «N fatture importate», con l'accordo giusto. */
function testoFattureImportate(n: number): string {
  return n === 1 ? '1 fattura importata' : `${n} fatture importate`
}

/** «1 riga saltata» / «N righe saltate». */
function testoRigheSaltate(n: number): string {
  return n === 1 ? '1 riga saltata' : `${n} righe saltate`
}

export function RiepilogoFinale({ esiti, fattureCreate, fornitoriCreati, onChiudi, onRicomincia }: Props) {
  const [filtro, setFiltro] = useState<FiltroEsito>('tutte')
  const [espansa, setEspansa] = useState<string | null>(null)

  const importate = esiti.filter((e) => e.stato === 'importata').length
  const duplicate = esiti.filter((e) => e.stato === 'duplicata').length
  const errori = esiti.filter((e) => e.stato === 'errore').length
  const escluse = esiti.filter((e) => e.stato === 'esclusa').length
  const saltate = esiti.length - importate

  const risultati = filtro === 'tutte' ? esiti : esiti.filter((e) => e.stato === filtro)

  const toggleFiltro = (stato: FiltroEsito) => {
    setFiltro((precedente) => (precedente === stato ? 'tutte' : stato))
  }

  const verificaNonEseguita = fattureCreate === null
  const conteggioNonTorna = !verificaNonEseguita && fattureCreate !== importate

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <CheckCircle2Icon className="mt-0.5 h-6 w-6 shrink-0 text-primary" />
        <div>
          <p className="text-lg font-medium">Importazione completata</p>
          <p className="text-sm text-muted-foreground">
            {testoFattureImportate(importate)}, {testoRigheSaltate(saltate)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-5 gap-3">
        <button
          type="button"
          onClick={() => setFiltro('tutte')}
          className={cn(
            'rounded-lg border p-3 text-center transition-colors hover:bg-accent',
            filtro === 'tutte' && 'border-primary bg-accent'
          )}
        >
          <p className="text-2xl font-semibold">{esiti.length}</p>
          <p className="text-sm text-muted-foreground">File elaborati</p>
        </button>
        <button
          type="button"
          onClick={() => toggleFiltro('importata')}
          className={cn(
            'rounded-lg border p-3 text-center transition-colors hover:bg-accent',
            filtro === 'importata' && 'border-primary bg-accent'
          )}
        >
          <p className="text-2xl font-semibold">{importate}</p>
          <p className="text-sm text-muted-foreground">Importate</p>
        </button>
        <button
          type="button"
          onClick={() => toggleFiltro('duplicata')}
          className={cn(
            'rounded-lg border p-3 text-center transition-colors hover:bg-accent',
            filtro === 'duplicata' && 'border-primary bg-accent'
          )}
        >
          <p className="text-2xl font-semibold">{duplicate}</p>
          <p className="text-sm text-muted-foreground">Duplicate</p>
        </button>
        <button
          type="button"
          onClick={() => toggleFiltro('errore')}
          className={cn(
            'rounded-lg border p-3 text-center transition-colors hover:bg-accent',
            filtro === 'errore' && 'border-primary bg-accent'
          )}
        >
          <p className="text-2xl font-semibold">{errori}</p>
          <p className="text-sm text-muted-foreground">Errori</p>
        </button>
        <button
          type="button"
          onClick={() => toggleFiltro('esclusa')}
          className={cn(
            'rounded-lg border p-3 text-center transition-colors hover:bg-accent',
            filtro === 'esclusa' && 'border-primary bg-accent'
          )}
        >
          <p className="text-2xl font-semibold">{escluse}</p>
          <p className="text-sm text-muted-foreground">Escluse</p>
        </button>
      </div>

      <div className="max-h-[45vh] overflow-y-auto rounded-lg border">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-background">
            <TableRow>
              <TableHead className="w-10" />
              <TableHead>File</TableHead>
              <TableHead>Numero</TableHead>
              <TableHead>Fornitore</TableHead>
              <TableHead>Stato</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {risultati.map((e) => {
              const aperta = espansa === e.chiave
              return (
                <Fragment key={e.chiave}>
                  <TableRow>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Dettagli di ${e.nomeFile}`}
                        onClick={() => setEspansa(aperta ? null : e.chiave)}
                      >
                        {aperta ? (
                          <ChevronDownIcon className="h-4 w-4" />
                        ) : (
                          <ChevronRightIcon className="h-4 w-4" />
                        )}
                      </Button>
                    </TableCell>
                    <TableCell className="max-w-40 truncate" title={e.nomeFile}>
                      {e.nomeFile}
                    </TableCell>
                    <TableCell>{e.numero}</TableCell>
                    <TableCell className="max-w-40 truncate" title={e.denominazioneFornitore}>
                      {e.denominazioneFornitore}
                    </TableCell>
                    <TableCell>
                      <Badge variant={VARIANTE_BADGE[e.stato]}>{ETICHETTE_STATO[e.stato]}</Badge>
                      {e.stato === 'errore' && e.messaggio && (
                        <p className="mt-1 text-xs text-destructive">{e.messaggio}</p>
                      )}
                    </TableCell>
                  </TableRow>
                  {aperta && (
                    <TableRow>
                      <TableCell colSpan={5} className="bg-muted/40">
                        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
                          <div>
                            <dt className="text-muted-foreground">Tipo documento</dt>
                            <dd>{e.fattura.tipoDocumento}</dd>
                          </div>
                          <div>
                            <dt className="text-muted-foreground">Data</dt>
                            <dd>{formattaData(e.fattura.data)}</dd>
                          </div>
                          <div>
                            <dt className="text-muted-foreground">Scadenza</dt>
                            <dd>
                              {formattaData(e.fattura.primaScadenza)}
                              {e.fattura.scadenzaStimata && ' (stimata)'}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-muted-foreground">P.IVA fornitore</dt>
                            <dd>{e.fattura.partitaIvaFornitore}</dd>
                          </div>
                          <div>
                            <dt className="text-muted-foreground">Cliente</dt>
                            <dd>{e.fattura.denominazioneCliente}</dd>
                          </div>
                          <div>
                            <dt className="text-muted-foreground">Netto</dt>
                            <dd>{formatCurrency(e.fattura.netAmount)}</dd>
                          </div>
                          <div>
                            <dt className="text-muted-foreground">IVA</dt>
                            <dd>
                              {formatCurrency(e.fattura.vatAmount)} (
                              {e.fattura.aliquote.map((a) => `${a}%`).join(' · ')})
                            </dd>
                          </div>
                          <div>
                            <dt className="text-muted-foreground">Lordo</dt>
                            <dd>{formatCurrency(e.fattura.totalAmount)}</dd>
                          </div>
                          <div>
                            <dt className="text-muted-foreground">Ritenuta</dt>
                            <dd>
                              {e.fattura.ritenuta
                                ? `${formatCurrency(e.fattura.ritenuta.importo)} (${e.fattura.ritenuta.aliquota}%)`
                                : '—'}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-muted-foreground">Archivio di provenienza</dt>
                            <dd>{e.fattura.daZip ?? '—'}</dd>
                          </div>
                          {e.messaggio && (
                            <div className="col-span-2 sm:col-span-4">
                              <dt className="text-muted-foreground">Messaggio</dt>
                              <dd className={cn(e.stato === 'errore' && 'text-destructive')}>{e.messaggio}</dd>
                            </div>
                          )}
                        </dl>
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              )
            })}
          </TableBody>
        </Table>
      </div>

      <section
        aria-label="Verifica integrità importazione"
        className="space-y-3 rounded-lg border p-4"
      >
        <p className="font-medium">Verifica integrità importazione</p>
        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <p className="text-2xl font-semibold">{fattureCreate ?? '—'}</p>
            <p className="text-sm text-muted-foreground">Fatture create nel database</p>
          </div>
          <div>
            <p className="text-2xl font-semibold">{fornitoriCreati}</p>
            <p className="text-sm text-muted-foreground">Fornitori creati</p>
          </div>
          <div>
            <p className="text-2xl font-semibold">{esiti.length}</p>
            <p className="text-sm text-muted-foreground">Righe totali processate</p>
          </div>
        </div>
        {verificaNonEseguita && (
          <p className="text-sm text-muted-foreground">
            Non è stato possibile verificare il conteggio: il server non ha risposto alla
            rilettura. L&apos;importazione può essere andata a buon fine lo stesso.
          </p>
        )}
        {conteggioNonTorna && (
          <p className="text-sm font-medium text-destructive">
            Il conteggio non corrisponde: {importate} dichiarate, {fattureCreate} create.
          </p>
        )}
      </section>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onRicomincia}>
          Importa altri file
        </Button>
        <Button onClick={onChiudi}>Chiudi</Button>
      </div>
    </div>
  )
}

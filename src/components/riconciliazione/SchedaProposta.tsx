'use client'

import * as React from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatDateShort } from '@/lib/constants'
import { formatCurrency } from '@/lib/formatters'
import { PESI, fascia, type Fascia } from '@/lib/reconciliation/scala'
import { cn } from '@/lib/utils'
import {
  importoNumerico,
  type FattoriProposta,
  type ImportoDaApi,
  type PropostaDiRiconciliazione,
} from '@/types/riconciliazione-assistita'
import { titoloRegola } from './regole'

/**
 * Una proposta, aperta.
 *
 * La scheda **non chiama nessuna rotta**: riceve due promesse dal genitore, che
 * possiede la query del lotto e la invalida quando una decisione va a buon
 * fine. Così la scheda sparisce dalla coda perché il server dice che è decisa,
 * non perché il componente ha deciso di nascondersi.
 *
 * Tutto ciò che si vede è persistito dal motore — i sei fattori e le frasi di
 * motivazione col loro segno: qui non si ricostruisce nulla e non si ricalcola
 * niente, perché due punteggi calcolati in due posti prima o poi divergono.
 */

interface Props {
  proposta: PropostaDiRiconciliazione
  /** Rifiuta con un `Error` che porta il messaggio del server. */
  onApprova: (id: string) => Promise<void>
  /** Rifiuta con un `Error` che porta il messaggio del server. */
  onScarta: (id: string, opzioni: { perSempre: boolean; motivo?: string }) => Promise<void>
  /** La prima della coda: è quella su cui si sta decidendo adesso. */
  inEvidenza?: boolean
}

/**
 * I sei fattori nell'ordine del peso, col loro massimo.
 *
 * Il massimo arriva da `PESI` e non da un numero scritto qui: se un giorno la
 * controparte varrà 25 invece di 20, la barra deve dire 18/25 senza che nessuno
 * si ricordi di venire a correggere questa riga.
 */
const FATTORI: Array<{ chiave: keyof FattoriProposta; nome: string; massimo: number }> = [
  { chiave: 'importo', nome: 'Importo', massimo: PESI.IMPORTO },
  { chiave: 'riferimento', nome: 'Riferimento', massimo: PESI.RIFERIMENTO },
  { chiave: 'controparte', nome: 'Controparte', massimo: PESI.CONTROPARTE },
  { chiave: 'data', nome: 'Data', massimo: PESI.DATA },
  { chiave: 'codiceBanca', nome: 'Codice banca', massimo: PESI.CODICE_BANCA },
  { chiave: 'unicita', nome: 'Unicità', massimo: PESI.UNICITA },
]

const ETICHETTA_FASCIA: Record<Fascia, string> = { alta: 'Alta', media: 'Media', bassa: 'Bassa' }

/**
 * Il badge non ha un colore proprio: prende quelli del tema. Alta è il colore
 * pieno, Media il secondario, Bassa il solo contorno — la scala di enfasi si
 * legge anche in bianco e nero, e nessuno dei tre sopravvive al tema scuro per
 * caso.
 */
const VARIANTE_FASCIA: Record<Fascia, 'default' | 'secondary' | 'outline'> = {
  alta: 'default',
  media: 'secondary',
  bassa: 'outline',
}

/** Il residuo della scadenza: quanto resta da saldare adesso. */
function residuoScadenza(totale: ImportoDaApi, pagato: ImportoDaApi): number {
  return importoNumerico(totale) - importoNumerico(pagato)
}

/** La barra segmentata: ogni fattore largo quanto pesa, pieno quanto ha preso. */
function BarraFattori({ fattori }: { fattori: FattoriProposta }) {
  return (
    <div className="space-y-2">
      <div className="flex items-end gap-1">
        {FATTORI.map(({ chiave, nome, massimo }, indice) => {
          const valore = Number(fattori?.[chiave] ?? 0)
          const quota = massimo > 0 ? Math.max(0, Math.min(1, valore / massimo)) : 0
          return (
            <div
              key={chiave}
              // Il segmento è largo quanto il fattore pesa: si vede a colpo
              // d'occhio che l'importo conta il doppio della data.
              style={{ flexGrow: massimo, flexBasis: 0 }}
              className="min-w-0"
            >
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={cn(
                    'h-full rounded-full bg-primary',
                    // Una scala di opacità decrescente col peso: i sei segmenti
                    // restano distinguibili senza introdurre sei colori nuovi.
                    indice >= 4 ? 'opacity-60' : indice >= 2 ? 'opacity-80' : 'opacity-100'
                  )}
                  style={{ width: `${quota * 100}%` }}
                />
              </div>
              <p className="mt-1 truncate text-[11px] leading-tight text-muted-foreground">{nome}</p>
              <p className="text-[11px] font-medium leading-tight tabular-nums">
                {valore}/{massimo}
              </p>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function SchedaProposta({ proposta, onApprova, onScarta, inEvidenza = false }: Props) {
  const [azione, setAzione] = React.useState<'approva' | 'salta' | 'mai' | null>(null)
  const [errore, setErrore] = React.useState<string | null>(null)
  const [chiedeConferma, setChiedeConferma] = React.useState(false)
  const [motivo, setMotivo] = React.useState('')

  const movimento = proposta.bankTransaction
  const importoMovimento = importoNumerico(movimento?.amount)
  const uscita = importoMovimento < 0
  const classificazione = fascia(proposta.punteggio)
  const motivazioni = Array.isArray(proposta.motivazioni) ? proposta.motivazioni : []

  /**
   * Un solo posto in cui una decisione parte, perché il pezzo delicato è uguale
   * per tutte e tre: se il server rifiuta, il messaggio resta **dentro** la
   * scheda e la scheda resta aperta. Il 409 «la scadenza è pagata» è
   * l'informazione che spiega perché l'approvazione non è passata, e in un
   * toast che sparisce dopo tre secondi non la legge nessuno.
   */
  const esegui = async (quale: 'approva' | 'salta' | 'mai', operazione: () => Promise<void>) => {
    setAzione(quale)
    setErrore(null)
    try {
      await operazione()
      setChiedeConferma(false)
    } catch (e) {
      setErrore(e instanceof Error ? e.message : 'Operazione non riuscita')
    } finally {
      setAzione(null)
    }
  }

  const inCorso = azione !== null

  return (
    <article
      className={cn(
        'rounded-lg border bg-card p-4 text-card-foreground shadow-sm',
        inEvidenza && 'ring-2 ring-primary/40'
      )}
      aria-label={`Proposta ${proposta.regola} da ${proposta.punteggio} punti`}
    >
      <header className="flex flex-wrap items-center gap-2 border-b pb-3">
        <Badge variant={VARIANTE_FASCIA[classificazione]}>{ETICHETTA_FASCIA[classificazione]}</Badge>
        <span className="text-2xl font-semibold tabular-nums">{proposta.punteggio}</span>
        <span className="text-xs text-muted-foreground">su 100</span>
        <span className="ml-auto text-xs text-muted-foreground">
          {proposta.regola} · {titoloRegola(proposta.regola)}
        </span>
      </header>

      <div className="grid gap-4 pt-3 md:grid-cols-2">
        {/* A sinistra il movimento: la causale intera, che è tutto ciò che il
            motore ha letto — e quindi tutto ciò su cui si può controllarlo. */}
        <section className="min-w-0 space-y-1">
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Movimento bancario
          </h3>
          {movimento ? (
            <>
              <p className="text-sm text-muted-foreground">
                {formatDateShort(movimento.transactionDate)} · {uscita ? 'Uscita' : 'Entrata'}
              </p>
              <p className="text-lg font-semibold tabular-nums">
                {formatCurrency(Math.abs(importoMovimento))}
              </p>
              <p className="break-words text-sm text-muted-foreground">{movimento.description}</p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Nessun movimento bancario su questa proposta.</p>
          )}
        </section>

        {/* A destra le scadenze: più di una quando il pagamento è cumulativo. */}
        <section className="min-w-0 space-y-3">
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {proposta.gambe.length > 1 ? `Scadenze (${proposta.gambe.length})` : 'Scadenza'}
          </h3>
          {proposta.gambe.map((gamba) => {
            const scadenza = gamba.schedule
            if (!scadenza) {
              return (
                <p key={gamba.id} className="text-sm text-muted-foreground">
                  Gamba senza scadenza: {formatCurrency(importoNumerico(gamba.importo))}
                </p>
              )
            }
            const residuo = residuoScadenza(scadenza.importoTotale, scadenza.importoPagato)
            return (
              <div key={gamba.id} className="min-w-0 rounded-md border bg-muted/40 p-2">
                <p className="break-words text-sm font-medium">{scadenza.descrizione}</p>
                {scadenza.controparteNome && (
                  <p className="break-words text-sm text-muted-foreground">{scadenza.controparteNome}</p>
                )}
                <p className="text-xs text-muted-foreground">
                  {scadenza.numeroDocumento ? `${scadenza.numeroDocumento} · ` : ''}
                  Scade il {formatDateShort(scadenza.dataScadenza)}
                </p>
                {scadenza.invoice?.invoiceNumber && (
                  <p className="break-words text-xs text-muted-foreground">
                    Fattura {scadenza.invoice.invoiceNumber}
                    {scadenza.invoice.supplierName ? ` · ${scadenza.invoice.supplierName}` : ''}
                  </p>
                )}
                <p className="mt-1 text-sm tabular-nums">
                  <span className="font-semibold">{formatCurrency(importoNumerico(gamba.importo))}</span>
                  <span className="text-muted-foreground"> · residuo {formatCurrency(residuo)}</span>
                </p>
              </div>
            )
          })}
        </section>
      </div>

      <div className="mt-4 space-y-3 border-t pt-3">
        <BarraFattori fattori={proposta.fattori} />

        <ul className="space-y-1 text-sm">
          {motivazioni.map((motivazione, indice) => (
            <li key={`${motivazione.testo}-${indice}`} className="flex items-start gap-2">
              <span
                aria-hidden="true"
                className={motivazione.segno === '+' ? 'text-primary' : 'text-destructive'}
              >
                {motivazione.segno === '+' ? '✓' : '✗'}
              </span>
              <span className="sr-only">{motivazione.segno === '+' ? 'A favore:' : 'Contro:'}</span>
              <span className="min-w-0 break-words text-muted-foreground">{motivazione.testo}</span>
            </li>
          ))}
        </ul>
      </div>

      {errore && (
        <p
          role="alert"
          className="mt-3 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {errore}
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <Button onClick={() => void esegui('approva', () => onApprova(proposta.id))} disabled={inCorso}>
          {azione === 'approva' ? 'Approvo…' : 'Approva'}
        </Button>
        <Button
          variant="outline"
          onClick={() => void esegui('salta', () => onScarta(proposta.id, { perSempre: false, motivo: undefined }))}
          disabled={inCorso}
        >
          {azione === 'salta' ? 'Salto…' : 'Salta per ora'}
        </Button>
        <Button variant="destructive" onClick={() => setChiedeConferma(true)} disabled={inCorso}>
          Non propormelo mai più
        </Button>
      </div>

      <AlertDialog open={chiedeConferma} onOpenChange={(aperto) => !inCorso && setChiedeConferma(aperto)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Non proporre mai più questo abbinamento?</AlertDialogTitle>
            <AlertDialogDescription>
              La coppia viene esclusa per sempre: nessun lotto futuro la riproporrà, neanche
              rilanciando l&apos;analisi sullo stesso periodo. «Salta per ora» invece la toglie solo da
              questa coda.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label htmlFor={`motivo-${proposta.id}`}>Motivo (facoltativo)</Label>
            <Input
              id={`motivo-${proposta.id}`}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Perché non è un abbinamento valido"
              maxLength={500}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={inCorso}>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                // La conferma resta aperta finché la rotta non risponde: la
                // chiude `esegui`, non il clic.
                e.preventDefault()
                void esegui('mai', () =>
                  onScarta(proposta.id, { perSempre: true, motivo: motivo.trim() || undefined })
                )
              }}
              disabled={inCorso}
            >
              {azione === 'mai' ? 'Escludo…' : 'Conferma'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </article>
  )
}

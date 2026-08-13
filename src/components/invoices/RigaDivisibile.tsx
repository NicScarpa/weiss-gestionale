'use client'

/**
 * Righe figlie di una riga fattura divisa fra più conti (Task 9, spec
 * sezione 5c, decisione 3). Sempre dentro la stessa tabella di
 * `LineItemsTable` — mai una finestra che copre le altre righe — perché la
 * decisione si prende guardando il resto della fattura, non isolandola.
 *
 * Un solo stato locale copre sia una divisione appena aperta (bozza vuota)
 * sia la modifica di una già salvata (bozza precompilata da
 * `riga.imputazioni`): stessa UI, stesso controllo di quadratura, nessun
 * ramo separato per i due casi. Il seed avviene una sola volta al
 * montaggio (lazy init di `useState`): il chiamante monta un'istanza per
 * riga (una sola, dentro il `Fragment` chiavato su `riga.numeroLinea` in
 * `LineItemsTable`), quindi non serve un effetto che la riallinei ai dati
 * del server — dopo un salvataggio riuscito i numeri locali sono già quelli
 * appena scritti, e su un rifiuto del server (passo 3) restano quelli che
 * l'utente stava correggendo, non vengono persi.
 */

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { TableCell, TableRow } from '@/components/ui/table'
import { AccountCombobox } from '@/components/prima-nota/shared/AccountCombobox'
import { formatCurrencyOrZero as formatCurrency } from '@/lib/formatters'
import { TOLLERANZA_IMPORTI, pallino, type RigaVisualizzata } from './InvoiceDetailSections'

/**
 * Una quota in fase di compilazione. `importo` è una stringa, non un
 * numero: una quota può essere "vuota, l'utente non ha ancora scritto
 * niente", e forzarla a 0 in quel momento mostrerebbe uno zero vagante in un
 * campo che non è stato ancora toccato (vedi CLAUDE.md, "0 vagante").
 */
export interface QuotaBozza {
  progressivo: number
  accountId?: string
  importo: string
}

/**
 * Stato iniziale delle quote: se la riga è già divisa sul server, una voce
 * per OGNI quota esistente — non troncata a due. Questa UI crea sempre e
 * solo due quote per una divisione nuova (vedi il report per il perché), ma
 * se i dati ne portano di più (scritti da altrove) troncarle qui e poi
 * salvare cancellerebbe silenziosamente quelle in eccesso: il server tratta
 * la richiesta come autorevole sulla riga che nomina.
 * Se la riga non è ancora divisa, due quote vuote: la prima eredita solo il
 * conto dell'eventuale imputazione singola già presente, mai l'importo —
 * l'utente deve dichiarare esplicitamente come si spartisce, non trovarsi
 * un importo che sembra già corretto senza averlo scelto.
 */
function quoteIniziali(riga: RigaVisualizzata): QuotaBozza[] {
  if (riga.imputazioni.length >= 2) {
    return riga.imputazioni.map((imp) => ({
      progressivo: imp.progressivo,
      accountId: imp.accountId,
      importo: String(imp.importo),
    }))
  }
  const esistente = riga.imputazioni[0]
  return [
    { progressivo: 0, accountId: esistente?.accountId, importo: '' },
    { progressivo: 1, accountId: undefined, importo: '' },
  ]
}

/**
 * Somma delle quote, trattando un importo non ancora compilato o non
 * numerico come zero: una riga a metà deve comunque mostrare uno scarto
 * utile, non `NaN` propagato nel messaggio.
 */
export function sommaQuote(quote: QuotaBozza[]): number {
  return quote.reduce((somma, q) => {
    const n = parseFloat(q.importo)
    return somma + (Number.isNaN(n) ? 0 : n)
  }, 0)
}

/**
 * Vero quando la somma delle quote combacia con l'importo della riga madre,
 * stessa tolleranza del server (`TOLLERANZA_IMPORTI`, righe-conti/route.ts):
 * è il vincolo del passo 2, verificato PRIMA di salvare — non dopo un 400.
 */
export function quoteQuadrano(quote: QuotaBozza[], importoRiga: number): boolean {
  return Math.abs(sommaQuote(quote) - importoRiga) <= TOLLERANZA_IMPORTI
}

/**
 * Ogni quota ha un conto scelto e un importo valido e positivo (stesso
 * `.positive()` di righe-conti/route.ts): condizione necessaria, insieme a
 * `quoteQuadrano`, per poter salvare. Senza questo controllo una quota
 * incompleta produrrebbe una richiesta che il server rifiuterebbe comunque
 * (Zod), ma con un errore generico invece del messaggio mirato che il
 * pulsante disabilitato già evita di far scattare.
 */
export function quoteComplete(quote: QuotaBozza[]): boolean {
  return quote.every((q) => {
    const n = parseFloat(q.importo)
    return !!q.accountId && !Number.isNaN(n) && n > 0
  })
}

/**
 * Messaggio dello scarto, stesso lessico del rifiuto server
 * (righe-conti/route.ts: «mancano X» / «ci sono X di troppo») così che, se
 * il salvataggio viene comunque rifiutato (passo 3), chi legge riconosce la
 * stessa frase invece di due formulazioni diverse per lo stesso concetto.
 */
export function messaggioScarto(quote: QuotaBozza[], importoRiga: number): string {
  const somma = sommaQuote(quote)
  const differenza = importoRiga - somma
  if (Math.abs(differenza) <= TOLLERANZA_IMPORTI) {
    return `Le quote coprono l'importo della riga (${formatCurrency(importoRiga)})`
  }
  const scarto =
    differenza > 0
      ? `mancano ${formatCurrency(differenza)}`
      : `ci sono ${formatCurrency(Math.abs(differenza))} di troppo`
  return `Le quote sommano a ${formatCurrency(somma)} su ${formatCurrency(importoRiga)}: ${scarto}`
}

/** Arrotonda al centesimo: lo stesso schema di `round2` in SplitEntryDialog
 * (suddivisione di un movimento), duplicato invece che condiviso perché è
 * tre righe e l'unico punto in comune fra i due componenti è il concetto,
 * non il codice — SplitEntryDialog divide un movimento per importo,
 * RigaDivisibile una riga fattura, con vincoli diversi (qui la somma deve
 * combaciare esattamente, là può restare un residuo). */
function round2(n: number): number {
  return Math.round(n * 100) / 100
}

interface RigaDivisibileProps {
  riga: RigaVisualizzata
  canEditAccounts: boolean
  /**
   * Assente per una riga già divisa e salvata: non esiste più una riga a
   * quota singola a cui tornare, quindi niente pulsante Annulla. Presente
   * solo per una divisione appena aperta e non ancora salvata: la riporta
   * alla tendina normale, scartando la bozza (Task 9, decisione sul
   * collasso — vedi il report).
   */
  onAnnulla?: () => void
  /** Riceve SEMPRE l'insieme completo delle quote correnti: il chiamante
   * (`LineItemsTable`) lo inoltra a `onSplitSave`, che il server tratta come
   * autorevole sull'intera riga. */
  onSalva: (quote: Array<{ progressivo: number; accountId: string; importo: number }>) => void
}

export function RigaDivisibile({ riga, canEditAccounts, onAnnulla, onSalva }: RigaDivisibileProps) {
  const [quote, setQuote] = useState<QuotaBozza[]>(() => quoteIniziali(riga))

  const aggiornaQuota = (indice: number, patch: Partial<QuotaBozza>) => {
    setQuote((prev) => prev.map((q, i) => (i === indice ? { ...q, ...patch } : q)))
  }

  const quadra = quoteQuadrano(quote, riga.importo)
  const completa = quoteComplete(quote)
  const puoSalvare = quadra && completa

  const handleSalva = () => {
    onSalva(
      quote.map((q) => ({
        progressivo: q.progressivo,
        // Sicuro grazie a `puoSalvare` (disabilita il bottone finché
        // `quoteComplete` non è vera): a questo punto ogni quota ha già un
        // accountId e un importo numerico valido.
        accountId: q.accountId!,
        importo: round2(parseFloat(q.importo)),
      }))
    )
  }

  return (
    <>
      {quote.map((quota, indice) => {
        // Il pallino riflette l'ultimo stato noto dal server per QUESTA
        // quota (per progressivo, non per posizione): finché non si salva
        // di nuovo, un'eventuale modifica locale non ancora inviata non
        // cambia lo stato mostrato — stesso comportamento della tendina a
        // quota singola, che non anticipa mai un salvataggio non ancora
        // avvenuto.
        const imputazioneEsistente = riga.imputazioni.find((imp) => imp.progressivo === quota.progressivo)
        const stato = pallino(imputazioneEsistente)
        return (
          <TableRow key={quota.progressivo} className="bg-slate-50/60">
            <TableCell className="text-slate-300" aria-hidden="true">
              └
            </TableCell>
            <TableCell />
            <TableCell className="text-right text-slate-400">—</TableCell>
            <TableCell className="text-right text-slate-400">—</TableCell>
            <TableCell className="text-right text-slate-400">—</TableCell>
            <TableCell className="text-right">
              <Input
                type="number"
                step="0.01"
                placeholder="0,00"
                value={quota.importo}
                onChange={(e) => aggiornaQuota(indice, { importo: e.target.value })}
                disabled={!canEditAccounts}
                className="text-right"
                aria-label={`Importo quota ${indice + 1} della riga ${riga.numeroLinea}`}
              />
            </TableCell>
            <TableCell>
              <div className="flex items-center gap-2">
                <AccountCombobox
                  value={quota.accountId}
                  onChange={(accountId) => aggiornaQuota(indice, { accountId })}
                  disabled={!canEditAccounts}
                  // Stesso filtro della tendina a quota singola (Task 8,
                  // punto d): una quota può finire su un conto PATRIMONIALE
                  // quanto sull'intera riga.
                  types={['COSTO', 'PATRIMONIALE']}
                  placeholder="Seleziona conto"
                />
                {stato && (
                  <span
                    className={`h-2.5 w-2.5 rounded-full shrink-0 ${stato.className}`}
                    title={stato.title}
                  />
                )}
              </div>
            </TableCell>
          </TableRow>
        )
      })}
      <TableRow className="bg-slate-50/60">
        <TableCell colSpan={7} className="py-2">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className={quadra ? 'text-green-600' : 'text-amber-600'}>
              {messaggioScarto(quote, riga.importo)}
            </span>
            <div className="flex gap-2">
              {onAnnulla && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={onAnnulla}
                  disabled={!canEditAccounts}
                >
                  Annulla
                </Button>
              )}
              <Button
                type="button"
                size="sm"
                onClick={handleSalva}
                disabled={!canEditAccounts || !puoSalvare}
              >
                Salva
              </Button>
            </div>
          </div>
        </TableCell>
      </TableRow>
    </>
  )
}

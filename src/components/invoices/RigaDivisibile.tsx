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
import { TOLLERANZA_IMPORTI, pallino, type RigaVisualizzata } from './riga-fattura-condivisa'

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

/** Arrotonda al centesimo: lo stesso schema di `round2` in SplitEntryDialog
 * (suddivisione di un movimento), duplicato invece che condiviso perché è
 * tre righe e l'unico punto in comune fra i due componenti è il concetto,
 * non il codice — SplitEntryDialog divide un movimento per importo,
 * RigaDivisibile una riga fattura, con vincoli diversi (qui la somma deve
 * combaciare esattamente, là può restare un residuo). */
function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * Quote pronte per essere salvate, o `null` se anche una sola non lo è.
 * "Pronta" = ha un conto e un importo che, arrotondato al centesimo come lo
 * arrotonda il salvataggio, è positivo — stesso `.positive()` del server
 * (righe-conti/route.ts). Controllare l'importo grezzo con `n > 0` (versione
 * precedente) lasciava passare un caso limite: `parseFloat('0.001')` è `0.001`,
 * supera `> 0`, ma `round2` lo porta a `0`, che il server rifiuta con
 * l'errore generico di Zod invece che col pulsante già disabilitato
 * (revisione team lead, round 1, minor).
 *
 * Un'unica funzione sia per decidere se "Salva" può abilitarsi
 * (`quotePronte(quote) !== null`) sia per costruire il payload esatto da
 * inviare: le due cose non possono disallinearsi, e dentro il ciclo
 * TypeScript restringe `accountId` da opzionale a `string` sul controllo
 * `!q.accountId`, senza bisogno di un'asserzione `!` che dipendesse solo dal
 * pulsante disabilitato per essere sicura (revisione team lead, round 1,
 * minor: prima l'asserzione in `handleSalva` era sicura solo perché il
 * bottone era spento, non perché il codice lo garantisse da sé).
 */
export function quotePronte(
  quote: QuotaBozza[]
): Array<{ progressivo: number; accountId: string; importo: number }> | null {
  const pronte: Array<{ progressivo: number; accountId: string; importo: number }> = []
  for (const q of quote) {
    const n = parseFloat(q.importo)
    if (!q.accountId || Number.isNaN(n) || round2(n) <= 0) return null
    pronte.push({ progressivo: q.progressivo, accountId: q.accountId, importo: round2(n) })
  }
  return pronte
}

/**
 * Ogni quota ha un conto scelto e un importo valido e positivo: condizione
 * necessaria, insieme a `quoteQuadrano`, per poter salvare. Implementata
 * sopra `quotePronte` invece di ripetere il controllo, per non avere due
 * definizioni di "completa" che potrebbero divergere.
 */
export function quoteComplete(quote: QuotaBozza[]): boolean {
  return quotePronte(quote) !== null
}

/**
 * Cosa manca perché tutte le quote siano compilate — usata quando
 * `quotePronte` è `null`, per dire ESATTAMENTE cosa manca invece di lasciare
 * che il messaggio racconti solo la somma. Senza questo, 60 + 40 su una
 * riga da 100 con il conto della seconda quota non ancora scelto mostrava
 * il messaggio verde di `messaggioScarto` ("le quote coprono l'importo
 * della riga") mentre "Salva" restava spento per un motivo che non
 * compariva da nessuna parte — il vincolo del passo 2 visibile solo a
 * metà (revisione team lead, round 1, Important 1).
 */
export function messaggioIncompleto(quote: QuotaBozza[]): string {
  const problemi = quote.flatMap((quota, indice) => {
    const lista: string[] = []
    if (!quota.accountId) lista.push(`manca il conto della quota ${indice + 1}`)
    const n = parseFloat(quota.importo)
    if (Number.isNaN(n) || round2(n) <= 0) {
      lista.push(`la quota ${indice + 1} deve avere un importo maggiore di zero`)
    }
    return lista
  })
  return problemi.join('; ')
}

/**
 * Messaggio dello scarto, stesso lessico del rifiuto server
 * (righe-conti/route.ts: «mancano X» / «ci sono X di troppo») così che, se
 * il salvataggio viene comunque rifiutato (passo 3), chi legge riconosce la
 * stessa frase invece di due formulazioni diverse per lo stesso concetto.
 * Presuppone quote già `quotePronte` (conto e importo a posto): il chiamante
 * mostra `messaggioIncompleto` finché non lo sono, questa funzione non torna
 * a ripetere quel controllo.
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

interface RigaDivisibileProps {
  riga: RigaVisualizzata
  canEditAccounts: boolean
  /**
   * Assente per una riga già divisa e salvata: niente pulsante Annulla,
   * perché non c'è una riga a quota singola non ancora esistita a cui
   * tornare. L'unione (vedi `onSalva` con una sola quota, sotto) è la via
   * di ritorno equivalente per quel caso — non un ripristino della bozza,
   * ma un salvataggio esplicito che il server sa già interpretare come
   * "torna a quota singola" (righe-conti/route.ts, `divisa = quote.length
   * > 1`). Presente solo per una divisione appena aperta e non ancora
   * salvata: la riporta alla tendina normale, scartando la bozza.
   */
  onAnnulla?: () => void
  /** Riceve SEMPRE l'insieme completo delle quote da salvare — una sola per
   * "unisci in un conto solo", tutte per un salvataggio normale — mai un
   * sottoinsieme arbitrario: il chiamante (`LineItemsTable`) lo inoltra a
   * `onSplitSave`, che il server tratta come autorevole sull'intera riga. */
  onSalva: (quote: Array<{ progressivo: number; accountId: string; importo: number }>) => void
}

export function RigaDivisibile({ riga, canEditAccounts, onAnnulla, onSalva }: RigaDivisibileProps) {
  const [quote, setQuote] = useState<QuotaBozza[]>(() => quoteIniziali(riga))

  const aggiornaQuota = (indice: number, patch: Partial<QuotaBozza>) => {
    setQuote((prev) => prev.map((q, i) => (i === indice ? { ...q, ...patch } : q)))
  }

  const quadra = quoteQuadrano(quote, riga.importo)
  const pronte = quotePronte(quote)
  const puoSalvare = quadra && pronte !== null
  // Finché una quota non è pronta (conto o importo mancante), il messaggio
  // dice QUELLO — non lo scarto sulla somma, che potrebbe già quadrare
  // (60+40=100) e mostrarsi verde mentre "Salva" resta spento per un motivo
  // che altrimenti non comparirebbe da nessuna parte.
  const messaggio = pronte ? messaggioScarto(quote, riga.importo) : messaggioIncompleto(quote)

  const handleSalva = () => {
    if (!pronte) return
    onSalva(pronte)
  }

  // Riporta la riga a un'unica imputazione, sul conto della prima quota:
  // una sola quota nella richiesta e il server smette di trattare la riga
  // come divisa, ricalcolando l'importo dal documento e cancellando le
  // quote non citate (righe-conti/route.ts, `divisa = quote.length > 1` e
  // la `deleteMany` che segue). È l'unica via di ritorno per una riga già
  // salvata: prima di questa azione non ce n'era nessuna (revisione team
  // lead, round 1, Important 2).
  const primoConto = quote[0]?.accountId
  const handleUnisci = () => {
    if (!primoConto) return
    onSalva([{ progressivo: 0, accountId: primoConto, importo: riga.importo }])
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
                placeholder="0.00"
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
            {/* Verde solo quando "Salva" è davvero abilitato: prima il
                colore seguiva solo `quadra` (la somma), quindi un conto
                scelto su due poteva già mostrare verde — "le quote coprono
                l'importo della riga" — con Salva ancora spento perché manca
                l'altro conto (revisione team lead, round 1, Important 1). */}
            <span className={puoSalvare ? 'text-green-600' : 'text-amber-600'}>{messaggio}</span>
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
              {!onAnnulla && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleUnisci}
                  disabled={!canEditAccounts || !primoConto}
                  title="Riporta la riga a un'unica imputazione, sul conto della prima quota"
                >
                  Unisci in un conto solo
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

import { money, sumMoney, toApi } from '@/lib/money'
import { REGISTRI_IMPLICITI } from '@/types/prima-nota'
import type {
  RegisterType,
  EntryType,
  JournalEntry,
  RegistriDelTrasferimento,
  TipoTrasferimento,
} from '@/types/prima-nota'

/**
 * Un trasferimento male indicato: manca la destinazione, o coincide con
 * l'origine. È un dato che chi registra può correggere, non un guasto.
 */
export class TrasferimentoNonValidoError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TrasferimentoNonValidoError'
  }
}

/**
 * Da quale registro a quale registro si muove il denaro.
 *
 * Per versamento e prelievo il `registerType` ricevuto viene ignorato: la
 * direzione è quella canonica anche se il client ne dichiara un'altra, perché
 * un «versamento dalla banca» non è un'operazione diversa, è un dato sbagliato,
 * e ciò che l'utente ha scelto è il tipo di operazione. Il giroconto invece non
 * ha direzione implicita: chi lo registra deve dire da dove a dove, e senza
 * quell'indicazione la richiesta va rifiutata invece che indovinata.
 */
export function registriDelTrasferimento(
  entryType: TipoTrasferimento,
  registerType: RegisterType,
  counterRegisterType?: RegisterType | null
): RegistriDelTrasferimento {
  if (entryType !== 'GIROCONTO') {
    return REGISTRI_IMPLICITI[entryType]
  }

  if (!counterRegisterType) {
    throw new TrasferimentoNonValidoError(
      'Un giroconto richiede il registro di destinazione: indica da dove a dove si sposta il denaro.'
    )
  }

  if (counterRegisterType === registerType) {
    throw new TrasferimentoNonValidoError(
      'Un giroconto deve spostare il denaro fra due registri diversi.'
    )
  }

  return { da: registerType, a: counterRegisterType }
}

/**
 * Determina se un movimento è DARE o AVERE in base al registro e tipo.
 *
 * Vale per un movimento a riga singola e per **ciascuno dei due lati** di un
 * trasferimento, presi uno alla volta. Il giroconto è l'eccezione: non avendo
 * una direzione implicita, la coppia registro+tipo non basta a dire da che
 * parte va l'importo, e la funzione si ferma invece di rispondere a caso.
 * Rispondeva DARE per entrambi i registri, ed era il modo in cui un giroconto
 * registrato a mano faceva comparire denaro dal nulla.
 */
export function getMovementDirection(
  registerType: RegisterType,
  entryType: EntryType
): 'DEBIT' | 'CREDIT' {
  // CASSA
  if (registerType === 'CASH') {
    switch (entryType) {
      case 'INCASSO':
      case 'PRELIEVO': // Da banca → entra in cassa
        return 'DEBIT' // Dare (+)
      case 'USCITA':
      case 'VERSAMENTO': // Verso banca → esce da cassa
        return 'CREDIT' // Avere (-)
    }
  }

  // BANCA
  if (registerType === 'BANK') {
    switch (entryType) {
      case 'INCASSO':
      case 'VERSAMENTO': // Da cassa → entra in banca
        return 'DEBIT' // Dare (+)
      case 'USCITA':
      case 'PRELIEVO': // Verso cassa → esce da banca
        return 'CREDIT' // Avere (-)
    }
  }

  throw new TrasferimentoNonValidoError(
    'Il giroconto non ha una direzione implicita: usa registriDelTrasferimento() ' +
      'per sapere da quale registro esce e in quale entra.'
  )
}

/**
 * Converte tipo movimento e importo in dare/avere.
 *
 * L'importo è generico perché la stessa decisione serve sia sui `number` della
 * UI sia sui `Money` che vanno in colonna: costringerli a passare da `number`
 * per attraversare questa funzione vanificherebbe la precisione (vedi
 * `@/lib/money`). Il valore non viene toccato, solo messo dalla parte giusta.
 */
export function toDebitCredit<T = number>(
  registerType: RegisterType,
  entryType: EntryType,
  amount: T
): { debitAmount: T | null; creditAmount: T | null } {
  const direction = getMovementDirection(registerType, entryType)

  if (direction === 'DEBIT') {
    return { debitAmount: amount, creditAmount: null }
  } else {
    return { debitAmount: null, creditAmount: amount }
  }
}

/**
 * Calcola il saldo progressivo per una lista di movimenti
 */
export function calculateRunningBalances(
  entries: JournalEntry[],
  openingBalance: number = 0
): JournalEntry[] {
  let balance = money(openingBalance)

  return entries.map((entry) => {
    // Saldo = precedente + dare - avere
    balance = balance.plus(money(entry.debitAmount)).minus(money(entry.creditAmount))

    return {
      ...entry,
      runningBalance: toApi(balance),
    }
  })
}

/**
 * Calcola totali per un gruppo di movimenti
 */
export function calculateTotals(entries: JournalEntry[]): {
  totalDebits: number
  totalCredits: number
  netMovement: number
} {
  const totalDebits = sumMoney(entries.map((entry) => entry.debitAmount))
  const totalCredits = sumMoney(entries.map((entry) => entry.creditAmount))

  return {
    totalDebits: toApi(totalDebits),
    totalCredits: toApi(totalCredits),
    netMovement: toApi(totalDebits.minus(totalCredits)),
  }
}

/**
 * Dettaglio uscita per generare descrizione
 */
interface ExpenseDetail {
  payee?: string
  description?: string
  documentRef?: string
}

/**
 * Genera descrizione automatica per movimento da chiusura
 */
export function generateClosureDescription(
  type: 'revenue' | 'expense' | 'deposit' | 'pos',
  closureDate: Date,
  detail?: string | ExpenseDetail
): string {
  const dateStr = closureDate.toLocaleDateString('it-IT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })

  switch (type) {
    case 'revenue':
      return `Incasso giornaliero contanti ${dateStr}`
    case 'pos':
      return `Incasso giornaliero POS ${dateStr}`
    case 'expense':
      // Se detail è un oggetto ExpenseDetail
      if (detail && typeof detail === 'object') {
        const parts: string[] = []
        if (detail.payee) parts.push(detail.payee)
        if (detail.description) parts.push(detail.description)
        if (detail.documentRef) parts.push(`Rif. ${detail.documentRef}`)

        if (parts.length > 0) {
          return `${parts.join(' - ')} (${dateStr})`
        }
      }
      // Se detail è stringa (backward compatibility)
      if (typeof detail === 'string') {
        return `Uscita: ${detail} (${dateStr})`
      }
      return `Uscita ${dateStr}`
    case 'deposit':
      return `Versamento in banca ${dateStr}`
  }
}

/**
 * Formatta importo con segno per visualizzazione
 */
export function formatSignedAmount(
  debitAmount?: number | null,
  creditAmount?: number | null
): { value: number; sign: '+' | '-'; formatted: string } {
  if (debitAmount && debitAmount > 0) {
    return {
      value: debitAmount,
      sign: '+',
      formatted: `+${debitAmount.toLocaleString('it-IT', {
        style: 'currency',
        currency: 'EUR',
      })}`,
    }
  }

  if (creditAmount && creditAmount > 0) {
    return {
      value: creditAmount,
      sign: '-',
      formatted: `-${creditAmount.toLocaleString('it-IT', {
        style: 'currency',
        currency: 'EUR',
      })}`,
    }
  }

  return {
    value: 0,
    sign: '+',
    formatted: '€0,00',
  }
}

/**
 * Verifica se un movimento è modificabile
 * (non modificabile se generato automaticamente da chiusura validata)
 */
export function isEntryEditable(entry: Pick<JournalEntry, 'closureId'>): boolean {
  return !entry.closureId
}

export type MovimentoEditAction = 'completa' | 'riclassifica' | 'nessuna'

/**
 * Decide quale dialog di modifica proporre per un movimento (Task 15).
 * Un movimento normale si apre sempre nel form completo ('completa'). Un
 * movimento generato da chiusura (isEntryEditable false) è dato contabile
 * intoccabile: solo l'admin può correggerlo, e solo per riclassificare
 * conto/centro di costo (PUT /api/prima-nota/[id], ramo admin del Task 8) —
 * per chiunque altro non c'è alcuna azione di modifica disponibile, perché
 * il server la rifiuterebbe comunque con 403.
 */
export function resolveMovimentoEditAction(
  entry: Pick<JournalEntry, 'closureId'>,
  isAdmin: boolean
): MovimentoEditAction {
  if (isEntryEditable(entry)) return 'completa'
  return isAdmin ? 'riclassifica' : 'nessuna'
}

/**
 * Stato dei filtri della lista movimenti (pagina Prima Nota > Movimenti).
 */
export interface MovimentiFiltersState {
  registerType?: RegisterType
  dateFrom?: Date
  dateTo?: Date
  entryType?: string
  accountId?: string
  costCenterId?: string
  budgetCategoryId?: string
  verified?: boolean
  search: string
}

/**
 * Filtri "vuoti": stato iniziale e valore a cui torna "Cancella filtri".
 */
export const DEFAULT_MOVIMENTI_FILTERS: MovimentiFiltersState = {
  registerType: undefined,
  dateFrom: undefined,
  dateTo: undefined,
  entryType: undefined,
  accountId: undefined,
  costCenterId: undefined,
  budgetCategoryId: undefined,
  verified: undefined,
  search: '',
}

/**
 * Conta i filtri attivi nella barra dei movimenti, per il pulsante
 * "Cancella filtri" di MovimentiFilters (data da/a vale come un unico
 * filtro "periodo", coerente con l'unico controllo DateRangePicker che lo
 * imposta).
 */
export function countActiveMovimentiFilters(filters: MovimentiFiltersState): number {
  return [
    filters.registerType,
    filters.dateFrom || filters.dateTo,
    filters.entryType,
    filters.accountId,
    filters.costCenterId,
    filters.budgetCategoryId,
    filters.verified !== undefined,
    filters.search,
  ].filter(Boolean).length
}

/**
 * Raggruppa movimenti per data
 */
export function groupEntriesByDate(
  entries: JournalEntry[]
): Map<string, JournalEntry[]> {
  const grouped = new Map<string, JournalEntry[]>()

  for (const entry of entries) {
    const dateKey = new Date(entry.date).toISOString().split('T')[0]
    const existing = grouped.get(dateKey) || []
    grouped.set(dateKey, [...existing, entry])
  }

  return grouped
}

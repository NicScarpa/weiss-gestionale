/**
 * Formattazione degli importi e delle percentuali, in un posto solo.
 *
 * Prima di questo file `formatCurrency` esisteva in 16 copie: tre esportate da
 * `lib/` (`utils`, `constants`, `invoice-utils`) e tredici scritte dentro il
 * componente che ne aveva bisogno. Quasi tutte erano la stessa riga, ma non
 * tutte: alcune rispondevano `-` sull'importo assente, una `€ 0,00`, quella
 * del PDF la stringa vuota. Le differenze che contano sono sopravvissute come
 * funzioni distinte — così sono visibili qui invece che nascoste in fondo a un
 * componente, dove chi le trovava le riscriveva da capo.
 */

const EURO = new Intl.NumberFormat('it-IT', {
  style: 'currency',
  currency: 'EUR',
})

const DECIMALE = new Intl.NumberFormat('it-IT', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/** Importo in euro all'italiana: `1.234,56 €`. */
export function formatCurrency(amount: number): string {
  return EURO.format(amount)
}

/**
 * Come `formatCurrency`, ma l'importo assente diventa un trattino: in tabella
 * una cella vuota si legge come uno zero, che è un'altra cosa.
 */
export function formatCurrencyOrDash(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return '-'
  return EURO.format(amount)
}

/**
 * Variante per i dati che arrivano dal parser delle fatture elettroniche, dove
 * gli importi viaggiano come stringhe e l'assenza va letta come zero.
 */
export function formatCurrencyOrZero(
  value: string | number | null | undefined
): string {
  if (value === null || value === undefined) return '€ 0,00'
  const num = typeof value === 'string' ? parseFloat(value) : value
  if (Number.isNaN(num)) return '€ 0,00'
  return EURO.format(num)
}

/**
 * Variante per i PDF: lo zero e l'assente diventano stringa vuota, perché le
 * celle a zero della prima nota vanno lasciate bianche. I chiamanti che invece
 * lo zero devono scriverlo sfruttano quella stringa vuota con `|| '0,00 €'`.
 * Il separatore prima di `€` è uno spazio normale e non lo spazio unificatore
 * che `Intl` inserisce con `style: 'currency'`.
 */
export function formatCurrencyPdf(value: number | null | undefined): string {
  if (value === null || value === undefined || value === 0) return ''
  return `${DECIMALE.format(value)} €`
}

/**
 * Percentuale a un decimale. Con `segno` il valore positivo è preceduto dal
 * `+`, come serve ai confronti fra periodi dove il verso della variazione è
 * l'informazione principale.
 */
export function formatPercentage(
  value: number,
  options: { segno?: boolean } = {}
): string {
  const prefisso = options.segno && value > 0 ? '+' : ''
  return `${prefisso}${value.toFixed(1)}%`
}

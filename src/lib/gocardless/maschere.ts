/**
 * L'IBAN in una forma che si può mostrare a schermo e scrivere in un log senza
 * consegnarlo: le prime due lettere del paese e le ultime quattro cifre, che
 * bastano a distinguere un conto dall'altro e non bastano a disporne.
 */
export function mascheraIban(iban: string): string {
  const pulito = iban.replace(/\s+/g, '').toUpperCase()
  if (pulito.length < 8) return '••••'
  return `${pulito.slice(0, 2)}•• •••• ${pulito.slice(-4)}`
}

import type { CostCenterOption } from '@/components/prima-nota/shared/CostCenterSelect'

/**
 * Centro di costo preselezionato in testata per una nuova chiusura: il
 * locale principale (Weiss Cafè), non il centro di default del server
 * (STR — struttura/amministrazione, usato altrove per i conti con regola
 * DEFAULT_STR). Se il form lasciasse il campo vuoto, il server ricadrebbe
 * su STR: un risultato diverso da quello atteso da chi compila la chiusura.
 */
export const CLOSURE_DEFAULT_COST_CENTER_CODE = 'WEISS'

/**
 * Id del centro da preselezionare in testata su una nuova chiusura, o
 * `undefined` se il centro atteso non è (ancora) nell'elenco — capita solo
 * con un'anagrafica incompleta; in quel caso il campo resta vuoto e
 * l'obbligatorietà del select lo segnala al submit, non qui.
 */
export function resolveDefaultClosureCostCenterId(
  costCenters: CostCenterOption[]
): string | undefined {
  return costCenters.find((cc) => cc.code === CLOSURE_DEFAULT_COST_CENTER_CODE)?.id
}

/** Codice del centro dato il suo id, per costruire l'etichetta "Come chiusura (CODICE)". */
export function getCostCenterCode(
  costCenters: CostCenterOption[],
  costCenterId: string | undefined
): string | undefined {
  if (!costCenterId) return undefined
  return costCenters.find((cc) => cc.id === costCenterId)?.code
}

/**
 * Centro effettivo di una riga spesa: l'override della riga se presente,
 * altrimenti il centro di testata. Rispecchia la stessa regola applicata
 * lato server in `closure-journal-entries.ts` (`expense.costCenterId ??
 * closure.costCenterId`), qui usata per mostrare all'utente cosa erediterà
 * la riga prima ancora di salvare.
 */
export function resolveEffectiveExpenseCostCenterId(
  expenseCostCenterId: string | null | undefined,
  testataCostCenterId: string | undefined
): string | undefined {
  return expenseCostCenterId ?? testataCostCenterId ?? undefined
}

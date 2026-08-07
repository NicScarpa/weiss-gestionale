import type { CostCenterOption } from '@/components/prima-nota/shared/CostCenterSelect'
import { CENTRO_OPERATIVO_DEFAULT_CODE } from '@/lib/cost-centers'

/**
 * Centro di costo preselezionato in testata per una nuova chiusura: il
 * locale principale (Weiss Cafè), non il centro di default di sistema
 * (STR — struttura/amministrazione, usato per i conti con regola
 * DEFAULT_STR). È lo stesso centro operativo predefinito che il server usa
 * ovunque debba indovinare un'imputazione: vedi `@/lib/cost-centers` per la
 * distinzione fra i due "predefiniti".
 */
export const CLOSURE_DEFAULT_COST_CENTER_CODE = CENTRO_OPERATIVO_DEFAULT_CODE

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

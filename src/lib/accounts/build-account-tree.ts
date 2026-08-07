/**
 * Costruisce l'albero mastro → gruppo → voce da una lista piatta di voci con
 * la gerarchia denormalizzata (mastroCode/mastroNome/gruppoCode/gruppoNome),
 * come arrivano sia da `GET /api/accounts` sia dalle righe del conto
 * economico (`RigaContoEconomico` in `src/lib/report/conto-economico.ts`).
 *
 * Funzione pura e generica: non assume nient'altro sulla voce oltre ai
 * quattro campi di gerarchia, così la pagina di amministrazione (Task 18) la
 * usa sui conti veri e propri e il report per centro (Task 21-22) sulle
 * righe già aggregate in euro, senza bisogno di adattatori.
 *
 * Livelli sintetici — nessuno sparisce:
 * - i conti fuori dal piano v4 (patrimoniali e legacy) hanno `mastroCode`
 *   nullo: finiscono in un mastro sintetico (`mastroCode`/`mastroNome`
 *   nulli) invece di sparire dalla vista;
 * - una voce con mastro presente ma senza gruppo (la maggior parte dei
 *   mastri, articolati in gruppi solo nei casi 20/28/32 del piano WEISS)
 *   finisce in un gruppo sintetico (`gruppoCode`/`gruppoNome` nulli) sotto
 *   il proprio mastro, invece di uscire dall'albero.
 *
 * La funzione non inventa etichette per questi livelli sintetici (niente
 * "Altri conti" o "Senza gruppo" scritto qui): resta fedele ai null di
 * origine, l'etichetta è una scelta di chi visualizza l'albero (tabella del
 * report vs. componente admin possono volerne una diversa).
 *
 * Ordinamento: mastri e gruppi mantengono l'ordine di prima comparsa
 * nell'input (che arriva già ordinato per code, sia da `/api/accounts` sia
 * dall'aggregatore del conto economico); il livello sintetico va sempre in
 * fondo a prescindere da dove compare nell'input — senza questa regola i
 * conti patrimoniali (es. code "100", "110") si intreccerebbero in mezzo ai
 * mastri economici per puro ordinamento alfabetico del codice.
 */

export interface AccountHierarchyFields {
  mastroCode: string | null
  mastroNome: string | null
  gruppoCode: string | null
  gruppoNome: string | null
}

export interface AccountTreeGruppo<T extends AccountHierarchyFields> {
  gruppoCode: string | null
  gruppoNome: string | null
  voci: T[]
}

export interface AccountTreeMastro<T extends AccountHierarchyFields> {
  mastroCode: string | null
  mastroNome: string | null
  gruppi: AccountTreeGruppo<T>[]
}

/** Sposta in fondo l'elemento la cui chiave è `null`, preservando l'ordine relativo degli altri. */
function moveNullKeyToEnd<G>(items: G[], keyOf: (item: G) => string | null): G[] {
  const index = items.findIndex((item) => keyOf(item) === null)
  if (index < 0) return items
  const result = [...items]
  const [nullItem] = result.splice(index, 1)
  result.push(nullItem)
  return result
}

export function buildAccountTree<T extends AccountHierarchyFields>(voci: readonly T[]): AccountTreeMastro<T>[] {
  const mastri = new Map<string | null, AccountTreeMastro<T>>()

  for (const voce of voci) {
    let mastro = mastri.get(voce.mastroCode)
    if (!mastro) {
      mastro = { mastroCode: voce.mastroCode, mastroNome: voce.mastroNome, gruppi: [] }
      mastri.set(voce.mastroCode, mastro)
    }

    let gruppo = mastro.gruppi.find((g) => g.gruppoCode === voce.gruppoCode)
    if (!gruppo) {
      gruppo = { gruppoCode: voce.gruppoCode, gruppoNome: voce.gruppoNome, voci: [] }
      mastro.gruppi.push(gruppo)
    }
    gruppo.voci.push(voce)
  }

  const mastriOrdinati = moveNullKeyToEnd(Array.from(mastri.values()), (m) => m.mastroCode)
  return mastriOrdinati.map((mastro) => ({
    ...mastro,
    gruppi: moveNullKeyToEnd(mastro.gruppi, (g) => g.gruppoCode),
  }))
}

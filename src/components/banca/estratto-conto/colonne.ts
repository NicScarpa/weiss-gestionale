import type { OrdinaPer } from '@/lib/banca/filtri-estratto-conto'

/**
 * Le colonne della lista, nell'ordine in cui compaiono. Mostrarle o nasconderle
 * è una scelta del browser (`localStorage`), come in CashKing; l'ordine invece è
 * fisso: una colonna riattivata torna al suo posto. «Azioni» non è qui perché
 * non si nasconde.
 */
export type IdColonna = 'data' | 'descrizione' | 'causale' | 'conto' | 'stato' | 'importo'

export interface Colonna {
  id: IdColonna
  etichetta: string
  /** Presente sulle colonne ordinabili lato server. */
  ordina?: OrdinaPer
  aDestra?: boolean
}

export const COLONNE: readonly Colonna[] = [
  { id: 'data', etichetta: 'Data', ordina: 'data' },
  { id: 'descrizione', etichetta: 'Descrizione', ordina: 'descrizione' },
  { id: 'causale', etichetta: 'Causale', ordina: 'causale' },
  { id: 'conto', etichetta: 'Conto Bancario' },
  { id: 'stato', etichetta: 'Stato' },
  { id: 'importo', etichetta: 'Importo', ordina: 'importo', aDestra: true },
]

export const CHIAVE_COLONNE = 'weiss.estrattoConto.colonne'
export const CHIAVE_RIGHE = 'weiss.estrattoConto.righePerPagina'
export const RIGHE_PER_PAGINA = [20, 50, 100] as const

const TUTTE = COLONNE.map((c) => c.id)

export function leggiColonneVisibili(storage: Pick<Storage, 'getItem'> | null): Set<IdColonna> {
  try {
    const grezzo = storage?.getItem(CHIAVE_COLONNE)
    if (!grezzo) return new Set(TUTTE)
    const elenco = JSON.parse(grezzo)
    if (!Array.isArray(elenco)) return new Set(TUTTE)
    const valide = TUTTE.filter((id) => elenco.includes(id))
    return new Set(valide.length > 0 ? valide : TUTTE)
  } catch {
    return new Set(TUTTE)
  }
}

export function salvaColonneVisibili(
  storage: Pick<Storage, 'setItem'> | null,
  visibili: Set<IdColonna>
): void {
  storage?.setItem(CHIAVE_COLONNE, JSON.stringify(TUTTE.filter((id) => visibili.has(id))))
}

export function leggiRighePerPagina(storage: Pick<Storage, 'getItem'> | null): number {
  const n = Number(storage?.getItem(CHIAVE_RIGHE))
  return (RIGHE_PER_PAGINA as readonly number[]).includes(n) ? n : 100
}

export function salvaRighePerPagina(storage: Pick<Storage, 'setItem'> | null, n: number): void {
  storage?.setItem(CHIAVE_RIGHE, String(n))
}

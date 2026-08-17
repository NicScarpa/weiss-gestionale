import type { OrdinaPer } from '@/lib/banca/filtri-estratto-conto'

/**
 * Le colonne della lista, nell'ordine in cui compaiono. Mostrarle o nasconderle
 * è una scelta del browser (`localStorage`), come in CashKing; l'ordine invece è
 * fisso: una colonna riattivata torna al suo posto. «Azioni» non è qui perché
 * non si nasconde.
 */
export type IdColonna = 'data' | 'descrizione' | 'causale' | 'conto' | 'categoria' | 'stato' | 'importo'

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
  { id: 'categoria', etichetta: 'Categoria' },
  { id: 'stato', etichetta: 'Stato' },
  { id: 'importo', etichetta: 'Importo', ordina: 'importo', aDestra: true },
]

/** La chiave della consegna A: elencava le VISIBILI. Si legge ancora, non si scrive più. */
export const CHIAVE_COLONNE = 'weiss.estrattoConto.colonne'
/** Da qui in poi si salvano le NASCOSTE: una colonna aggiunta dopo nasce visibile. */
export const CHIAVE_COLONNE_NASCOSTE = 'weiss.estrattoConto.colonneNascoste'
export const CHIAVE_RIGHE = 'weiss.estrattoConto.righePerPagina'
export const RIGHE_PER_PAGINA = [20, 50, 100] as const

const TUTTE = COLONNE.map((c) => c.id)
/** Le colonne che esistevano quando la memoria salvava le visibili: da lì si capisce cosa era stato nascosto. */
const COLONNE_DELLA_CONSEGNA_A: readonly IdColonna[] = ['data', 'descrizione', 'causale', 'conto', 'stato', 'importo']

function daNascoste(nascoste: unknown): Set<IdColonna> {
  if (!Array.isArray(nascoste)) return new Set(TUTTE)
  const visibili = TUTTE.filter((id) => !nascoste.includes(id))
  return new Set(visibili.length > 0 ? visibili : TUTTE)
}

export function leggiColonneVisibili(storage: Pick<Storage, 'getItem'> | null): Set<IdColonna> {
  try {
    const nascoste = storage?.getItem(CHIAVE_COLONNE_NASCOSTE)
    if (nascoste) return daNascoste(JSON.parse(nascoste))
    // La memoria della consegna A: ciò che non c'era, era nascosto — ma solo
    // fra le colonne di allora, così la Categoria compare anche a chi aveva
    // già scelto le sue colonne.
    const grezzo = storage?.getItem(CHIAVE_COLONNE)
    if (!grezzo) return new Set(TUTTE)
    const visibiliAllora = JSON.parse(grezzo)
    if (!Array.isArray(visibiliAllora)) return new Set(TUTTE)
    return daNascoste(COLONNE_DELLA_CONSEGNA_A.filter((id) => !visibiliAllora.includes(id)))
  } catch {
    return new Set(TUTTE)
  }
}

export function salvaColonneVisibili(
  storage: Pick<Storage, 'setItem'> | null,
  visibili: Set<IdColonna>
): void {
  storage?.setItem(CHIAVE_COLONNE_NASCOSTE, JSON.stringify(TUTTE.filter((id) => !visibili.has(id))))
}

export function leggiRighePerPagina(storage: Pick<Storage, 'getItem'> | null): number {
  const n = Number(storage?.getItem(CHIAVE_RIGHE))
  return (RIGHE_PER_PAGINA as readonly number[]).includes(n) ? n : 100
}

export function salvaRighePerPagina(storage: Pick<Storage, 'setItem'> | null, n: number): void {
  storage?.setItem(CHIAVE_RIGHE, String(n))
}

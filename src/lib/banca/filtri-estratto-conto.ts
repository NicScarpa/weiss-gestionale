import { z } from 'zod'
import { reconciliationStatusSchema } from '@/lib/validations/reconciliation'
import type { SezioneMovimentoBancario } from '@/types/reconciliation'

/**
 * I filtri della lista dell'estratto conto, letti e scritti nell'URL: così
 * `?ordina=importo&verso=desc` si incolla in una chat e ricarica la stessa
 * vista (spec, decisione 7). Nessun import da Prisma: questo modulo lo usa
 * anche il client.
 */
export const ORDINA = ['data', 'descrizione', 'causale', 'importo'] as const
export type OrdinaPer = (typeof ORDINA)[number]

const flag = z.enum(['0', '1']).default('0').transform((v) => v === '1')

export const filtriEstrattoContoSchema = z.object({
  sezione: z.enum(['ATTIVI', 'DELEGHE_F24', 'CBILL_PAGOPA']).default('ATTIVI'),
  cestino: flag,
  tipo: z.enum(['tutti', 'entrate', 'uscite']).default('tutti'),
  bankAccountId: z.string().min(1).optional(),
  soloNonRiconciliati: flag,
  search: z.string().trim().min(1).max(200).optional(),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  // Non ha un ingresso in `filtriInSearchParams`: serve solo alla pagina
  // `/riconciliazione`, che compone da sé `?status=TO_REVIEW` finché esiste.
  status: reconciliationStatusSchema.optional(),
  ordina: z.enum(ORDINA).default('data'),
  verso: z.enum(['asc', 'desc']).default('desc'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(100),
})

export type FiltriEstrattoConto = z.infer<typeof filtriEstrattoContoSchema> & { sezione: SezioneMovimentoBancario }

export const FILTRI_DEFAULT: FiltriEstrattoConto = filtriEstrattoContoSchema.parse({})

/** Un parametro non valido cade sul suo default: l'URL non deve mai rompere la pagina. */
export function filtriDaSearchParams(sp: URLSearchParams): FiltriEstrattoConto {
  const grezzi: Record<string, string> = {}
  for (const chiave of Object.keys(filtriEstrattoContoSchema.shape)) {
    const v = sp.get(chiave)
    if (v !== null && v !== '') grezzi[chiave] = v
  }
  const esito = filtriEstrattoContoSchema.safeParse(grezzi)
  if (esito.success) return esito.data
  // Riprova campo per campo, tenendo solo quelli validi.
  const validi: Record<string, string> = {}
  for (const [chiave, valore] of Object.entries(grezzi)) {
    if (filtriEstrattoContoSchema.pick({ [chiave]: true } as never).safeParse({ [chiave]: valore }).success) validi[chiave] = valore
  }
  return filtriEstrattoContoSchema.parse(validi)
}

/** Scrive solo ciò che differisce dai default; conserva ciò che c'è già in `base` (es. `register`, `vista`). */
export function filtriInSearchParams(f: FiltriEstrattoConto, base = new URLSearchParams()): URLSearchParams {
  const sp = new URLSearchParams(base)
  for (const chiave of Object.keys(filtriEstrattoContoSchema.shape)) sp.delete(chiave)
  const metti = (chiave: string, valore: string | number | boolean | undefined, def: unknown) => {
    if (valore === undefined || valore === def) return
    sp.set(chiave, typeof valore === 'boolean' ? '1' : String(valore))
  }
  metti('sezione', f.sezione, FILTRI_DEFAULT.sezione)
  metti('cestino', f.cestino, false)
  metti('tipo', f.tipo, FILTRI_DEFAULT.tipo)
  metti('bankAccountId', f.bankAccountId, undefined)
  metti('soloNonRiconciliati', f.soloNonRiconciliati, false)
  metti('search', f.search, undefined)
  metti('dateFrom', f.dateFrom, undefined)
  metti('dateTo', f.dateTo, undefined)
  metti('ordina', f.ordina, FILTRI_DEFAULT.ordina)
  metti('verso', f.verso, FILTRI_DEFAULT.verso)
  metti('page', f.page, FILTRI_DEFAULT.page)
  metti('limit', f.limit, FILTRI_DEFAULT.limit)
  return sp
}

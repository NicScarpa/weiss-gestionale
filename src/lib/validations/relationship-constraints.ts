/**
 * Schemi Zod per validazione vincoli relazionali fra dipendenti.
 *
 * Il modello Prisma `RelationshipConstraint` non ha campi numerici dedicati:
 * le soglie vivono nel Json `config`. Il solver
 * (`src/lib/shift-generation/constraints.ts`) le legge con le chiavi
 * `minOverlapMinutes` e `maxShiftsTogether` come prima scelta, quindi sono
 * quelle che UI e API devono scrivere.
 */
import { z } from 'zod'

export const REL_CONSTRAINT_TYPES = [
  'SAME_DAY_OFF',
  'NEVER_TOGETHER',
  'ALWAYS_TOGETHER',
  'MIN_OVERLAP',
  'MAX_TOGETHER',
] as const

export type RelConstraintType = (typeof REL_CONSTRAINT_TYPES)[number]

export const RelConstraintTypeSchema = z.enum(REL_CONSTRAINT_TYPES)

/**
 * Limiti dei parametri configurabili, condivisi fra editor e API perché gli
 * attributi min/max degli input e la validazione server non divergano.
 */
export const REL_CONSTRAINT_LIMITS = {
  /** Minuti di sovrapposizione richiesti per il passaggio di consegne */
  minOverlapMinutes: { min: 0, max: 480, step: 15, default: 30 },
  /** Turni svolti fianco a fianco consentiti in una settimana */
  maxShiftsTogether: { min: 1, max: 14, step: 1, default: 3 },
} as const

/**
 * Parametri numerici ammessi in `config`.
 *
 * `maxHoursTogether` è accettato perché il solver lo riconosce (variante in ore
 * di MAX_TOGETHER), anche se l'editor scrive sempre la variante in turni.
 * Object strict: una chiave sconosciuta è quasi sempre un refuso che il solver
 * ignorerebbe in silenzio, lasciando attivo il default.
 */
export const RelConstraintConfigSchema = z.strictObject(
  {
    minOverlapMinutes: z
      .number()
      .int('I minuti di sovrapposizione devono essere un numero intero')
      .min(
        REL_CONSTRAINT_LIMITS.minOverlapMinutes.min,
        'I minuti di sovrapposizione non possono essere negativi'
      )
      .max(
        REL_CONSTRAINT_LIMITS.minOverlapMinutes.max,
        'I minuti di sovrapposizione non possono superare 480 (8 ore)'
      )
      .optional(),
    maxShiftsTogether: z
      .number()
      .int('Il numero massimo di turni insieme deve essere un numero intero')
      .min(
        REL_CONSTRAINT_LIMITS.maxShiftsTogether.min,
        'Il numero massimo di turni insieme deve essere almeno 1'
      )
      .max(
        REL_CONSTRAINT_LIMITS.maxShiftsTogether.max,
        'Il numero massimo di turni insieme non può superare 14'
      )
      .optional(),
    maxHoursTogether: z
      .number()
      .min(0, 'Le ore massime insieme non possono essere negative')
      .max(168, 'Le ore massime insieme non possono superare 168 (una settimana)')
      .optional(),
  },
  { error: 'Parametro di configurazione non riconosciuto per questo tipo di vincolo' }
)

export type RelConstraintConfig = z.infer<typeof RelConstraintConfigSchema>

/**
 * Parametro pertinente a ciascun tipo di vincolo. Gli altri tipi non hanno
 * soglie configurabili: il loro `config` deve restare vuoto.
 */
const CONFIG_KEY_BY_TYPE: Record<RelConstraintType, keyof RelConstraintConfig | null> = {
  SAME_DAY_OFF: null,
  NEVER_TOGETHER: null,
  ALWAYS_TOGETHER: null,
  MIN_OVERLAP: 'minOverlapMinutes',
  MAX_TOGETHER: 'maxShiftsTogether',
}

/**
 * Verifica che i parametri salvati appartengano al tipo di vincolo scelto:
 * un `maxShiftsTogether` su un MIN_OVERLAP verrebbe ignorato dal solver e
 * l'utente crederebbe di aver configurato una soglia che non esiste.
 *
 * Ritorna il messaggio di errore in italiano, o null se la config è coerente.
 */
export function validateRelConstraintConfig(
  constraintType: RelConstraintType,
  config: RelConstraintConfig | undefined
): string | null {
  if (!config) return null

  const allowedKey = CONFIG_KEY_BY_TYPE[constraintType]
  const providedKeys = (Object.keys(config) as (keyof RelConstraintConfig)[]).filter(
    key => config[key] !== undefined
  )

  if (constraintType === 'MAX_TOGETHER') {
    // Variante in ore ammessa, ma non insieme a quella in turni: il solver
    // leggerebbe solo le ore e il limite in turni resterebbe lettera morta
    const extraneous = providedKeys.filter(
      key => key !== 'maxShiftsTogether' && key !== 'maxHoursTogether'
    )
    if (extraneous.length > 0) {
      return 'Il vincolo "Massimo turni insieme" accetta solo il numero massimo di turni (o di ore) insieme'
    }
    if (providedKeys.includes('maxShiftsTogether') && providedKeys.includes('maxHoursTogether')) {
      return 'Indicare il limite in turni oppure in ore, non entrambi'
    }
    return null
  }

  const extraneous = providedKeys.filter(key => key !== allowedKey)
  if (extraneous.length === 0) return null

  return allowedKey
    ? 'Il vincolo "Sovrapposizione minima" accetta solo i minuti di sovrapposizione'
    : 'Questo tipo di vincolo non ha parametri configurabili'
}

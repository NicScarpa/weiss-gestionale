import type { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { CENTRO_OPERATIVO_DEFAULT_CODE } from '@/lib/cost-centers'

/**
 * I soli modelli che la risoluzione interroga. Il tipo si ricava dal client
 * reale (esteso dall'adapter) e non da `PrismaClient` di libreria: solo così
 * combacia sia con il client globale sia con quello di transazione, che ne è
 * un `Omit` (stesso pattern di allocation-service).
 */
export type DbCentriDiCosto = Pick<typeof prisma, 'costCenter' | 'account'>

export type RisoluzioneCentro =
  | { outcome: 'ok'; costCenterId: string }
  | {
      outcome: 'invalid'
      motivo: string
      code: 'CENTRO_DI_COSTO_OBBLIGATORIO' | 'CENTRO_DI_COSTO_NON_VALIDO'
    }

/**
 * Chi sta registrando il movimento. Non è una preferenza del chiamante: è il
 * fatto che decide cosa succede quando un conto OBBLIGATORIO si presenta
 * senza centro.
 *
 * - `interattivo`: c'è un umano davanti al form. Il centro glielo si chiede
 *   (esito `invalid`, che le route traducono in 400): chi registra a mano
 *   deve decidere, non gli si assegna un centro di nascosto.
 * - `automatico`: non c'è nessuno a cui chiedere — import dell'estratto
 *   conto, motore delle regole dello scadenzario, ereditarietà delle fette
 *   dalla fattura alla riconciliazione. Il sistema indovina, e indovina il
 *   centro operativo predefinito (WEISS); il movimento va poi marcato
 *   `verified: false` dal chiamante, perché la supposizione richiede
 *   un'approvazione manuale.
 */
export type ContestoRisoluzione = 'interattivo' | 'automatico'

/**
 * Il centro di default di sistema (STR): quello con `isDefault` sulla
 * tabella. È la destinazione delle 46 voci del piano ufficiale che portano la
 * regola `DEFAULT_STR` — le amministrative. Ritorna `null` se non è
 * configurato (o è disattivato), lasciando al chiamante la scelta fra errore
 * e ripiego.
 */
export async function trovaCentroStrutturale(
  db: DbCentriDiCosto
): Promise<{ id: string } | null> {
  return db.costCenter.findFirst({ where: { isDefault: true, isActive: true } })
}

/**
 * Il centro operativo predefinito (WEISS), cioè la risposta a "il sistema
 * deve indovinare". Se l'anagrafica non lo contiene o è disattivato si
 * ripiega sul centro strutturale, con un warning: meglio un movimento
 * imputato male e da verificare che nessun movimento.
 */
async function risolviCentroOperativo(db: DbCentriDiCosto): Promise<string> {
  const operativo = await db.costCenter.findFirst({
    where: { code: CENTRO_OPERATIVO_DEFAULT_CODE, isActive: true },
  })
  if (operativo) return operativo.id

  logger.warn('Centro operativo predefinito non disponibile: si ripiega sul centro di sistema', {
    code: CENTRO_OPERATIVO_DEFAULT_CODE,
  })
  return esigiCentroStrutturale(db)
}

async function esigiCentroStrutturale(db: DbCentriDiCosto): Promise<string> {
  const strutturale = await trovaCentroStrutturale(db)
  if (!strutturale) {
    // Errore di configurazione (mancano dati di setup), non un esito di
    // validazione: non è responsabilità del chiamante gestirlo come 'invalid'.
    throw new Error('Nessun centro di costo di default configurato')
  }
  return strutturale.id
}

/**
 * Risolve e valida il centro di costo da applicare a un movimento/voce del
 * piano dei conti v4. Va chiamato dentro la stessa transazione che scrive il
 * movimento, quindi accetta anche il client di transazione oltre al client
 * globale.
 *
 * Ordine di risoluzione:
 * 1. centro esplicito, se esiste ed è attivo — vince sempre, in ogni
 *    contesto: una scelta umana non si riscrive;
 * 2. conto (o fetta) con regola `OBBLIGATORIO` → lo si chiede all'utente se
 *    il contesto è interattivo, altrimenti è il centro operativo (WEISS);
 * 3. conto con regola `DEFAULT_STR` → centro di sistema (STR), in entrambi i
 *    contesti: la regola viene dal piano ufficiale e non si indovina nulla;
 * 4. nessun conto da interrogare → STR se interattivo, WEISS se automatico.
 *    Senza conto non c'è nessuna regola da rispettare: il sistema sta
 *    indovinando, ed è il caso del movimento appena importato dall'estratto
 *    conto, che il conto lo riceverà dopo (per riconciliazione o a mano).
 */
export async function risolviCentroDiCosto(
  db: DbCentriDiCosto,
  input: { accountId?: string | null; costCenterId?: string | null; accountIdsFette?: string[] },
  contesto: ContestoRisoluzione = 'interattivo'
): Promise<RisoluzioneCentro> {
  if (input.costCenterId) {
    const centro = await db.costCenter.findUnique({ where: { id: input.costCenterId } })
    if (centro && centro.isActive) {
      return { outcome: 'ok', costCenterId: centro.id }
    }
    return {
      outcome: 'invalid',
      motivo: 'Centro di costo inesistente o disattivato.',
      code: 'CENTRO_DI_COSTO_NON_VALIDO',
    }
  }

  // Ordine di ispezione: prima il conto dominante, poi le fette, così il
  // conto citato nel messaggio è il primo OBBLIGATORIO incontrato in
  // quest'ordine.
  const idsDaVerificare = [
    ...(input.accountId ? [input.accountId] : []),
    ...(input.accountIdsFette ?? []),
  ]

  if (idsDaVerificare.length > 0) {
    const conti = await db.account.findMany({
      where: { id: { in: idsDaVerificare } },
      select: { id: true, code: true, name: true, costCenterRule: true },
    })
    const contiPerId = new Map(conti.map((c) => [c.id, c]))
    for (const id of idsDaVerificare) {
      const conto = contiPerId.get(id)
      if (conto?.costCenterRule === 'OBBLIGATORIO') {
        if (contesto === 'automatico') {
          return { outcome: 'ok', costCenterId: await risolviCentroOperativo(db) }
        }
        return {
          outcome: 'invalid',
          motivo: `Il conto ${conto.code} — ${conto.name} richiede un centro di costo.`,
          code: 'CENTRO_DI_COSTO_OBBLIGATORIO',
        }
      }
    }
    // Nessun conto OBBLIGATORIO fra quelli ispezionati: la regola del piano è
    // DEFAULT_STR (o il conto non ha regola) e vale in entrambi i contesti.
    return { outcome: 'ok', costCenterId: await esigiCentroStrutturale(db) }
  }

  if (contesto === 'automatico') {
    return { outcome: 'ok', costCenterId: await risolviCentroOperativo(db) }
  }
  return { outcome: 'ok', costCenterId: await esigiCentroStrutturale(db) }
}

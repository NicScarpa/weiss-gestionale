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

/**
 * Da dove viene il centro di costo. Va persistito sul movimento
 * (`JournalEntry.costCenterSource`) perché a posteriori non è ricostruibile:
 * guardando il solo `costCenterId`, un WEISS indovinato dal sistema è
 * indistinguibile da un WEISS scelto da un umano.
 *
 * - `scelto`: l'ha indicato una persona, nel form del movimento o nella
 *   regola dello scadenzario che ha configurato. Non si tocca e non si
 *   rivaluta.
 * - `piano`: l'ha dettato la regola del conto (`DEFAULT_STR` → STR). Nessuno
 *   ha supposto niente, ma la risposta vale finché il conto è quello: se il
 *   conto cambia — succede quando le fette della fattura riscrivono il
 *   dominante — la regola va riapplicata al conto nuovo.
 * - `supposto`: l'ha indovinato il sistema, perché non c'era nient'altro da
 *   cui dedurlo. Il movimento va lasciato `verified: false` e non può essere
 *   promosso a verificato da un'automazione, nemmeno da una regola con
 *   `autoVerify`: quella spunta vale per il conto che l'utente ha
 *   configurato, non per un centro indovinato dopo.
 */
export type OrigineCentro = 'scelto' | 'piano' | 'supposto'

export type RisoluzioneCentro =
  | { outcome: 'ok'; costCenterId: string; origine: OrigineCentro }
  | {
      outcome: 'invalid'
      motivo: string
      code: 'CENTRO_DI_COSTO_OBBLIGATORIO' | 'CENTRO_DI_COSTO_NON_VALIDO'
    }

/**
 * Se il centro manca, si può ancora chiederlo a qualcuno? Non è una
 * preferenza del chiamante: è il fatto che decide cosa succede quando un
 * conto OBBLIGATORIO si presenta senza centro.
 *
 * - `interattivo`: c'è un umano davanti a un form che quel campo ce l'ha. Il
 *   centro glielo si chiede (esito `invalid`, che le route traducono in 400):
 *   chi registra a mano deve decidere, non gli si assegna un centro di
 *   nascosto.
 * - `automatico`: nessuno può scegliere adesso — import dell'estratto conto,
 *   motore delle regole dello scadenzario, batch di ricategorizzazione,
 *   ereditarietà delle fette dalla fattura, o form che il campo non ce
 *   l'ha nemmeno (il versamento cassa→banca). O indovina il sistema, o il
 *   movimento non nasce: quindi indovina, e indovina il centro operativo
 *   predefinito (WEISS). L'esito porta `origine: 'supposto'` e il movimento va
 *   lasciato `verified: false`, perché una supposizione richiede
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
 * Il centro già sul movimento va riproposto alla risoluzione, o trattato come
 * assente perché la regola del conto NUOVO possa rivalutarlo? Si pone quando
 * il conto di un movimento cambia dopo che il centro è già stato scritto: le
 * fette ereditate dalla fattura che riscrivono il dominante, o il batch di
 * ricategorizzazione che applica una regola.
 *
 * - provenienza `scelto` → si ripropone: una scelta umana non si riscrive mai;
 * - provenienza `piano` o `supposto` → si tratta come assente: nel primo caso
 *   la regola che l'aveva dettato riguardava il conto di prima, nel secondo
 *   non c'era nessuna regola;
 * - provenienza ignota (`null`) → si ricade sull'euristica che precede questa
 *   colonna: il centro di sistema davanti a un conto operativo è il ripiego di
 *   quando il conto non c'era, ogni altro centro si rispetta. Serve ai
 *   movimenti anteriori alla colonna e a quelli da chiusura, che non la
 *   valorizzano; è conservativa, quindi non introduce falsi positivi dove la
 *   provenienza non si sa.
 */
export function centroDaRiproporre(
  movimento: { costCenterId: string | null; costCenterSource: string | null },
  centroStrutturaleId: string | null
): string | null {
  if (!movimento.costCenterId) return null
  if (movimento.costCenterSource === 'scelto') return movimento.costCenterId
  if (movimento.costCenterSource) return null
  return movimento.costCenterId === centroStrutturaleId ? null : movimento.costCenterId
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
      return { outcome: 'ok', costCenterId: centro.id, origine: 'scelto' }
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
          return {
            outcome: 'ok',
            costCenterId: await risolviCentroOperativo(db),
            origine: 'supposto',
          }
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
    // Non è una supposizione: è l'Excel aziendale che ha già risposto.
    return { outcome: 'ok', costCenterId: await esigiCentroStrutturale(db), origine: 'piano' }
  }

  if (contesto === 'automatico') {
    return { outcome: 'ok', costCenterId: await risolviCentroOperativo(db), origine: 'supposto' }
  }
  // Interattivo senza conto da interrogare: il giroconto o il movimento che
  // il conto non ce l'ha proprio. Il centro di sistema non è una supposizione
  // sul conto, ma nemmeno una scelta: resta il default strutturale.
  return { outcome: 'ok', costCenterId: await esigiCentroStrutturale(db), origine: 'piano' }
}

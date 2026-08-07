/**
 * Script 03 — Migrazione al piano dei conti WEISS v4.
 *
 * ⚠️ Questo script modifica il piano dei conti di un gestionale in esercizio.
 * Leggere prima `docs/migrazione-piano-conti-v4.md` (generato dallo script
 * 02) e farlo approvare: la tabella dice esattamente quali conti verranno
 * disattivati e quali righe di budget verranno cancellate.
 *
 * ⚠️ INDICARE SEMPRE `DATABASE_URL` sulla riga di comando. Lo script legge il
 * `.env` del progetto se la variabile non c'è, e il `.env` punta alla
 * PRODUZIONE. Prima di scrivere su un bersaglio non locale viene chiesto di
 * ribattere a mano la sua identità, ma la difesa che conta è dire fin
 * dall'inizio dove si vuole andare a parare.
 *
 * MODALITÀ: il dry-run è il DEFAULT. Senza `--execute` lo script legge,
 * controlla, salva lo snapshot per il rollback e stampa il piano d'azione,
 * ma non scrive una riga.
 *
 * Cosa fa, tutto dentro UNA transazione SERIALIZABLE:
 *   1. ricontrolla le guardie pre-volo (ricontando, non fidandosi dei numeri
 *      del dry-run: fra i due passaggi può essere successo di tutto);
 *   2. inserisce/aggiorna le 155 voci di PIANO_CONTI_WEISS_V4 — sulle voci
 *      già presenti tocca solo l'anagrafica (nome, mastro/gruppo, regola
 *      centro di costo) e MAI is_active;
 *   3. assegna `system_key = CORRISPETTIVI` alla voce 10.01: da quel momento
 *      le chiusure di cassa nascono imputate ai ricavi senza altri deploy;
 *   4. porta a `is_active = false` i conti legacy RICAVO/COSTO (non li
 *      cancella: restano leggibili nello storico);
 *   5. cancella righe di budget e mappature budget dei conti legacy
 *      (`--mantieni-budget` per saltare questo passo);
 *   6. scrive un audit log riepilogativo.
 *
 * Se una guardia non regge, la transazione non parte e il database resta
 * esattamente com'era.
 *
 * Uso:
 *   DATABASE_URL="..." npx tsx scripts/piano-v4/03-migrate.ts             # dry-run
 *   DATABASE_URL="..." npx tsx scripts/piano-v4/03-migrate.ts --execute   # scrive
 *
 * Flag:
 *   --mantieni-budget      salta il passo 5 (righe e mappature restano su conti spenti)
 *   --riattiva-voci-v4     riattiva le 155 voci spente da un rollback precedente
 *   --lascia-voci-spente   procede accettando di lasciare spente le voci v4 già presenti
 *   --snapshot-dir <path>  dove salvare lo snapshot (default: scripts/piano-v4/snapshots)
 *
 * Il rollback è `04-rollback.ts --snapshot <file salvato qui>`.
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

import { CENTRI_DI_COSTO, PIANO_CONTI_WEISS_V4 } from '../../src/lib/accounts/piano-conti-weiss-v4'

import {
  argomento,
  bersaglio,
  CHIAVI_DURE,
  comeDb,
  confermaScrittura,
  contaRiferimenti,
  creaClient,
  descriviDatabase,
  flag,
  formattaDettaglioDuri,
  formattaDettaglioMorbidi,
  stampaIntestazione,
  validaArgomenti,
  type Db,
  type RiepilogoRiferimenti,
} from './_comune'

const SYSTEM_KEYS_RICHIESTE = ['CASSA', 'BANCA', 'DEBITI_FORNITORI']
const VOCE_CORRISPETTIVI = '10.01'
const CODICI_V4 = [...new Set(PIANO_CONTI_WEISS_V4.map((v) => v.code))]

validaArgomenti(['execute', 'mantieni-budget', 'riattiva-voci-v4', 'lascia-voci-spente'], ['snapshot-dir'])

const esegui = flag('execute')
const mantieniBudget = flag('mantieni-budget')
const riattivaVociV4 = flag('riattiva-voci-v4')
const lasciaVociSpente = flag('lascia-voci-spente')
const cartellaSnapshot = argomento('snapshot-dir') ?? join(__dirname, 'snapshots')

// ════════════════════════════════════════════════════════════════════════
//  RILEVAZIONE DELLO STATO E GUARDIE
// ════════════════════════════════════════════════════════════════════════

interface ContoLegacy {
  id: string
  code: string
  name: string
  type: string
  isActive: boolean
  systemKey: string | null
}

/** Anagrafica completa di una voce v4: tutto ciò che l'upsert sovrascrive. */
interface AnagraficaVoce {
  id: string
  code: string
  name: string
  type: string
  isActive: boolean
  systemKey: string | null
  mastroCode: string | null
  mastroNome: string | null
  gruppoCode: string | null
  gruppoNome: string | null
  costCenterRule: string
}

interface Stato {
  legacy: ContoLegacy[]
  v4Presenti: AnagraficaVoce[]
  centriMancanti: string[]
  systemKeyMancanti: string[]
  collisioni: string[]
  corrispettiviAltrove: string | null
  riferimentiLegacy: Map<string, RiepilogoRiferimenti>
  /** Id delle righe che il passo 5 cancellerebbe: servono a confrontarli con lo snapshot. */
  budgetLineIds: string[]
  mappingIds: string[]
}

async function rilevaStato(db: Db): Promise<Stato> {
  // Conti legacy = economici del vecchio piano (mastro_code NULL). I
  // patrimoniali (ATTIVO/PASSIVO) restano: il piano v4 copre solo il conto
  // economico e su di loro poggiano cassa, banca e debiti v/fornitori.
  const legacy = await db.account.findMany({
    where: { mastroCode: null, type: { in: ['RICAVO', 'COSTO'] } },
    orderBy: { code: 'asc' },
    select: { id: true, code: true, name: true, type: true, isActive: true, systemKey: true },
  })

  const v4Presenti = await db.account.findMany({
    where: { code: { in: CODICI_V4 } },
    orderBy: { code: 'asc' },
    select: {
      id: true,
      code: true,
      name: true,
      type: true,
      isActive: true,
      systemKey: true,
      mastroCode: true,
      mastroNome: true,
      gruppoCode: true,
      gruppoNome: true,
      costCenterRule: true,
    },
  })

  // Guardia: i 4 centri di costo devono esistere ed essere attivi (lo script
  // 01 li ha già creati in produzione; se mancano, i movimenti imputati alle
  // voci OBBLIGATORIO non avrebbero dove andare).
  const centri = await db.costCenter.findMany({ select: { code: true, isActive: true } })
  const centriAttivi = new Set(centri.filter((c) => c.isActive).map((c) => c.code))
  const centriMancanti = CENTRI_DI_COSTO.map((c) => c.code).filter((c) => !centriAttivi.has(c))

  // Guardia: le chiavi di sistema dei patrimoniali devono già esserci.
  const sistema = await db.account.findMany({
    where: { systemKey: { in: SYSTEM_KEYS_RICHIESTE } },
    select: { code: true, systemKey: true, isActive: true },
  })
  const systemKeyPresenti = new Set(sistema.filter((s) => s.isActive).map((s) => s.systemKey as string))
  const systemKeyMancanti = SYSTEM_KEYS_RICHIESTE.filter((k) => !systemKeyPresenti.has(k))

  // Guardia: nessun conto estraneo occupa un codice delle 155 voci.
  // Un conto legacy che avesse per caso il codice "20.1.01" verrebbe
  // trasformato in silenzio dall'upsert: meglio fermarsi.
  const collisioni: string[] = []
  for (const esistente of v4Presenti) {
    const voce = PIANO_CONTI_WEISS_V4.find((v) => v.code === esistente.code)!
    if (esistente.mastroCode === null) {
      collisioni.push(`${esistente.code} — "${esistente.name}" esiste ma non è una voce v4 (mastro_code NULL)`)
    } else if (esistente.type !== voce.tipo) {
      collisioni.push(`${esistente.code} — tipo ${esistente.type} nel database, ${voce.tipo} nel piano v4`)
    }
  }

  // Guardia: la systemKey CORRISPETTIVI è @unique. Se qualcuno l'ha già
  // messa su un altro conto l'update fallirebbe a metà transazione.
  const corrispettivi = await db.account.findFirst({
    where: { systemKey: 'CORRISPETTIVI' },
    select: { code: true },
  })
  const corrispettiviAltrove =
    corrispettivi && corrispettivi.code !== VOCE_CORRISPETTIVI ? corrispettivi.code : null

  const legacyIds = legacy.map((l) => l.id)
  const riferimentiLegacy = await contaRiferimenti(db, legacyIds)

  const budgetLineIds = (
    await db.budgetLine.findMany({ where: { accountId: { in: legacyIds } }, select: { id: true } })
  ).map((b) => b.id)
  const mappingIds = (
    await db.accountBudgetMapping.findMany({
      where: { accountId: { in: legacyIds } },
      select: { id: true },
    })
  ).map((m) => m.id)

  return {
    legacy,
    v4Presenti,
    centriMancanti,
    systemKeyMancanti,
    collisioni,
    corrispettiviAltrove,
    riferimentiLegacy,
    budgetLineIds,
    mappingIds,
  }
}

/** Elenco leggibile dei motivi per cui la migrazione non può partire. */
function valutaGuardie(stato: Stato): string[] {
  const problemi: string[] = []

  if (stato.centriMancanti.length > 0) {
    problemi.push(
      `centri di costo mancanti o disattivati: ${stato.centriMancanti.join(', ')} — eseguire prima scripts/piano-v4/01-centri-e-sistema.ts`
    )
  }

  if (stato.systemKeyMancanti.length > 0) {
    problemi.push(
      `system_key mancanti su conti attivi: ${stato.systemKeyMancanti.join(', ')} — eseguire prima scripts/piano-v4/01-centri-e-sistema.ts`
    )
  }

  for (const c of stato.collisioni) {
    problemi.push(`collisione di codice: ${c}`)
  }

  if (stato.corrispettiviAltrove) {
    problemi.push(
      `la system_key CORRISPETTIVI è già sul conto ${stato.corrispettiviAltrove}: va tolta prima di assegnarla a ${VOCE_CORRISPETTIVI}`
    )
  }

  // Solo i conti che la migrazione spegnerebbe davvero: un conto legacy già
  // archiviato con i suoi movimenti storici non è un ostacolo, resta com'è.
  for (const conto of stato.legacy.filter((l) => l.isActive)) {
    const rif = stato.riferimentiLegacy.get(conto.id)
    if (rif && rif.duri > 0) {
      problemi.push(
        `${conto.code} — "${conto.name}" ha ${rif.duri} ${rif.duri === 1 ? 'riferimento contabile' : 'riferimenti contabili'} (${formattaDettaglioDuri(rif)}): rimappare le scritture prima di disattivarlo`
      )
    }
    if (conto.systemKey) {
      problemi.push(
        `${conto.code} — "${conto.name}" porta la system_key ${conto.systemKey}: spostarla su un conto che resta attivo`
      )
    }
  }

  // Le voci v4 già presenti ma spente: la migrazione non le riaccende (non
  // deve poter resuscitare ciò che il committente ha spento a mano), quindi
  // finirebbe lasciando un piano dei conti senza voci economiche attive.
  // Meglio fermarsi e farsi dire cosa si vuole.
  const v4Spente = stato.v4Presenti.filter((v) => !v.isActive)
  if (v4Spente.length > 0 && !riattivaVociV4 && !lasciaVociSpente) {
    problemi.push(
      `${v4Spente.length} voci del piano v4 sono già presenti ma DISATTIVATE (${v4Spente
        .slice(0, 5)
        .map((v) => v.code)
        .join(', ')}${v4Spente.length > 5 ? ', …' : ''}). ` +
        'La migrazione non tocca is_active sulle voci esistenti, quindi resterebbero spente. ' +
        'Rilanciare con --riattiva-voci-v4 (tipico dopo un rollback) oppure con --lascia-voci-spente se è voluto.'
    )
  }

  return problemi
}

// ════════════════════════════════════════════════════════════════════════
//  SNAPSHOT PER IL ROLLBACK
// ════════════════════════════════════════════════════════════════════════

interface Snapshot {
  versione: number
  generatoIl: string
  database: string
  bersaglio: string
  modalita: string
  mantieniBudget: boolean
  contiLegacy: ContoLegacy[]
  vociV4Preesistenti: AnagraficaVoce[]
  budgetLines: Record<string, unknown>[]
  accountBudgetMappings: Record<string, unknown>[]
}

async function costruisciSnapshot(db: Db, stato: Stato): Promise<Snapshot> {
  const legacyIds = stato.legacy.map((l) => l.id)

  const budgetLines = await db.budgetLine.findMany({ where: { accountId: { in: legacyIds } } })
  const mappings = await db.accountBudgetMapping.findMany({ where: { accountId: { in: legacyIds } } })

  return {
    versione: 2,
    generatoIl: new Date().toISOString(),
    database: descriviDatabase(),
    bersaglio: bersaglio(),
    modalita: esegui ? 'execute' : 'dry-run',
    mantieniBudget,
    // Stato dei conti legacy PRIMA della migrazione: il rollback ci
    // ripristina is_active così com'era (non tutti sono per forza attivi).
    contiLegacy: stato.legacy,
    // Voci v4 che esistevano GIÀ, con l'anagrafica INTERA: l'upsert la
    // sovrascrive (nome, mastro, gruppo, regola centro), quindi senza questi
    // campi il rollback non potrebbe rimettere a posto una voce che qualcuno
    // aveva personalizzato a mano.
    vociV4Preesistenti: stato.v4Presenti,
    budgetLines: budgetLines.map((b) => JSON.parse(JSON.stringify(b))),
    accountBudgetMappings: mappings.map((m) => JSON.parse(JSON.stringify(m))),
  }
}

function scriviSnapshot(snapshot: Snapshot): string {
  mkdirSync(cartellaSnapshot, { recursive: true })
  const nome = `${new Date().toISOString().replace(/[:.]/g, '-')}-${esegui ? 'execute' : 'dry-run'}.json`
  const percorso = join(cartellaSnapshot, nome)
  writeFileSync(percorso, JSON.stringify(snapshot, null, 2), 'utf8')
  return percorso
}

// ════════════════════════════════════════════════════════════════════════
//  PIANO D'AZIONE
// ════════════════════════════════════════════════════════════════════════

function stampaPiano(stato: Stato) {
  const daCreare = PIANO_CONTI_WEISS_V4.filter(
    (v) => !stato.v4Presenti.some((p) => p.code === v.code)
  ).length
  const daAggiornare = PIANO_CONTI_WEISS_V4.length - daCreare
  const daDisattivare = stato.legacy.filter((l) => l.isActive)
  const v4Spente = stato.v4Presenti.filter((v) => !v.isActive)

  console.log('PIANO D\'AZIONE')
  console.log('')
  console.log(`  1. voci del piano v4: ${daCreare} da creare, ${daAggiornare} già presenti (aggiorno solo l'anagrafica)`)
  if (v4Spente.length > 0) {
    console.log(
      riattivaVociV4
        ? `     ↳ ${v4Spente.length} voci risultano spente: le riattivo (--riattiva-voci-v4)`
        : `     ↳ ${v4Spente.length} voci risultano spente e restano spente (--lascia-voci-spente)`
    )
  }
  console.log(`  2. system_key CORRISPETTIVI sulla voce ${VOCE_CORRISPETTIVI}`)
  console.log(`  3. conti legacy RICAVO/COSTO da disattivare: ${daDisattivare.length} (su ${stato.legacy.length} legacy totali)`)
  for (const c of daDisattivare) {
    const rif = stato.riferimentiLegacy.get(c.id)
    const nota = rif && rif.morbidi > 0 ? ` — riferimenti morbidi: ${formattaDettaglioMorbidi(rif)}` : ''
    console.log(`       · ${c.code.padEnd(10)} ${c.name}${nota}`)
  }
  const plurale = (n: number, uno: string, molti: string) => `${n} ${n === 1 ? uno : molti}`
  if (mantieniBudget) {
    console.log(
      `  4. budget: NON tocco nulla (--mantieni-budget) — resterebbero ${plurale(stato.budgetLineIds.length, 'riga', 'righe')} di budget e ${plurale(stato.mappingIds.length, 'mappatura', 'mappature')} su conti disattivati`
    )
  } else {
    console.log(
      `  4. cancello ${plurale(stato.budgetLineIds.length, 'riga', 'righe')} di budget e ${plurale(stato.mappingIds.length, 'mappatura', 'mappature')} budget dei conti legacy`
    )
  }
  console.log('  5. audit log riepilogativo')
  console.log('')
}

// ════════════════════════════════════════════════════════════════════════
//  ESECUZIONE
// ════════════════════════════════════════════════════════════════════════

interface Riepilogo {
  vociCreate: number
  vociAggiornate: number
  vociRiattivate: number
  legacyDisattivati: string[]
  budgetLinesCancellate: number
  mappingCancellate: number
  corrispettivi: 'assegnata' | 'già presente'
}

class GuardieFallite extends Error {
  constructor(public problemi: string[]) {
    super('Guardie pre-volo fallite')
    this.name = 'GuardieFallite'
  }
}

const stessoInsieme = (a: string[], b: string[]) =>
  a.length === b.length && [...a].sort().join(' ') === [...b].sort().join(' ')

async function applica(tx: Db, snapshot: Snapshot): Promise<Riepilogo> {
  // Le guardie si rivalutano QUI dentro, sui dati della transazione: fra il
  // dry-run e l'esecuzione qualcuno può aver registrato un movimento su un
  // conto che stiamo per disattivare.
  const statoTx = await rilevaStato(tx)
  const problemi = valutaGuardie(statoTx)

  // Lo snapshot è stato letto fuori dalla transazione. Se nel frattempo
  // l'insieme delle righe di budget da cancellare è cambiato, cancellarle
  // significherebbe distruggere righe che il rollback non sa ripristinare.
  if (!mantieniBudget) {
    const snapBudget = snapshot.budgetLines.map((b) => b.id as string)
    const snapMapping = snapshot.accountBudgetMappings.map((m) => m.id as string)
    if (!stessoInsieme(statoTx.budgetLineIds, snapBudget)) {
      problemi.push(
        `le righe di budget da cancellare non coincidono con lo snapshot (snapshot ${snapBudget.length}, ora ${statoTx.budgetLineIds.length}): qualcuno ha scritto sul budget nel frattempo. Rifare il dry-run.`
      )
    }
    if (!stessoInsieme(statoTx.mappingIds, snapMapping)) {
      problemi.push(
        `le mappature budget da cancellare non coincidono con lo snapshot (snapshot ${snapMapping.length}, ora ${statoTx.mappingIds.length}): qualcuno ha scritto nel frattempo. Rifare il dry-run.`
      )
    }
  }

  if (problemi.length > 0) throw new GuardieFallite(problemi)

  let vociCreate = 0
  let vociAggiornate = 0
  const presenti = new Set(statoTx.v4Presenti.map((v) => v.code))

  for (const voce of PIANO_CONTI_WEISS_V4) {
    const anagrafica = {
      name: voce.nome,
      mastroCode: voce.mastroCode,
      mastroNome: voce.mastroNome,
      gruppoCode: voce.gruppoCode ?? null,
      gruppoNome: voce.gruppoNome ?? null,
      costCenterRule: voce.regolaCentro,
    }
    await tx.account.upsert({
      where: { code: voce.code },
      // Su una voce già presente NON si tocca is_active: se il committente
      // l'ha disattivata a mano, la migrazione non deve resuscitarla.
      update: anagrafica,
      create: { code: voce.code, type: voce.tipo, ...anagrafica },
    })
    if (presenti.has(voce.code)) vociAggiornate++
    else vociCreate++
  }

  // Riattivazione esplicita: serve solo per rimettere in piedi il piano dopo
  // un rollback.
  let vociRiattivate = 0
  if (riattivaVociV4) {
    vociRiattivate = (
      await tx.account.updateMany({
        where: { code: { in: CODICI_V4 }, isActive: false },
        data: { isActive: true },
      })
    ).count
  }

  // La voce Corrispettivi diventa il conto di sistema delle chiusure di
  // cassa: il codice delle chiusure la cerca già, tollerando l'assenza.
  const corrispettivi = await tx.account.findUnique({
    where: { code: VOCE_CORRISPETTIVI },
    select: { systemKey: true },
  })
  if (!corrispettivi) {
    // Impossibile per costruzione (l'upsert appena fatto include 10.01):
    // se succede, qualcosa non torna e non si prosegue al buio.
    throw new Error(
      `la voce ${VOCE_CORRISPETTIVI} non esiste dopo l'upsert delle 155 voci: annullo tutto`
    )
  }
  if (corrispettivi.systemKey && corrispettivi.systemKey !== 'CORRISPETTIVI') {
    throw new Error(
      `la voce ${VOCE_CORRISPETTIVI} porta già la system_key ${corrispettivi.systemKey}: annullo tutto invece di sovrascriverla`
    )
  }
  let esitoCorrispettivi: Riepilogo['corrispettivi'] = 'già presente'
  if (corrispettivi.systemKey !== 'CORRISPETTIVI') {
    await tx.account.update({
      where: { code: VOCE_CORRISPETTIVI },
      data: { systemKey: 'CORRISPETTIVI' },
    })
    esitoCorrispettivi = 'assegnata'
  }

  const daDisattivare = statoTx.legacy.filter((l) => l.isActive)
  if (daDisattivare.length > 0) {
    await tx.account.updateMany({
      where: { id: { in: daDisattivare.map((l) => l.id) } },
      data: { isActive: false },
    })
  }

  let budgetLinesCancellate = 0
  let mappingCancellate = 0
  if (!mantieniBudget && statoTx.legacy.length > 0) {
    const ids = statoTx.legacy.map((l) => l.id)
    budgetLinesCancellate = (await tx.budgetLine.deleteMany({ where: { accountId: { in: ids } } })).count
    mappingCancellate = (await tx.accountBudgetMapping.deleteMany({ where: { accountId: { in: ids } } }))
      .count
  }

  const riepilogo: Riepilogo = {
    vociCreate,
    vociAggiornate,
    vociRiattivate,
    legacyDisattivati: daDisattivare.map((l) => l.code),
    budgetLinesCancellate,
    mappingCancellate,
    corrispettivi: esitoCorrispettivi,
  }

  // Audit log scritto direttamente (non via src/lib/audit.ts: quello passa
  // dal client applicativo e da next/headers, fuori da un contesto di
  // richiesta HTTP). Così però finisce dentro la transazione, che è meglio.
  const admin = await tx.user.findFirst({
    where: { role: { name: 'admin' }, isActive: true },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  })
  await tx.auditLog.create({
    data: {
      userId: admin?.id ?? null,
      action: 'UPDATE',
      entityType: 'Account',
      newValues: JSON.parse(
        JSON.stringify({
          operazione: 'migrazione-piano-conti-v4',
          script: 'scripts/piano-v4/03-migrate.ts',
          snapshot: snapshot.generatoIl,
          ...riepilogo,
        })
      ),
    },
  })

  return riepilogo
}

function stampaProblemi(problemi: string[]) {
  console.error('❌ MIGRAZIONE BLOCCATA — le premesse non reggono:')
  console.error('')
  for (const p of problemi) console.error(`   • ${p}`)
  console.error('')
  console.error('   Nessuna scrittura è stata effettuata.')
}

async function main() {
  stampaIntestazione(
    'Piano dei conti v4 — script 03: migrazione',
    esegui ? 'ESECUZIONE (scrive nel database)' : 'DRY-RUN (nessuna scrittura) — usare --execute per scrivere'
  )

  const { prisma, chiudi } = creaClient()
  try {
    const stato = await rilevaStato(prisma)

    console.log(`Conti legacy RICAVO/COSTO trovati: ${stato.legacy.length}`)
    console.log(`Voci del piano v4 già presenti  : ${stato.v4Presenti.length} su ${PIANO_CONTI_WEISS_V4.length}`)
    console.log('')

    // Lo snapshot si salva SEMPRE e PRIMA di qualunque scrittura: è la rete
    // sotto al trapezio, non un sottoprodotto del dry-run.
    const snapshot = await costruisciSnapshot(prisma, stato)
    const percorsoSnapshot = scriviSnapshot(snapshot)
    console.log(`💾 Snapshot per il rollback: ${percorsoSnapshot}`)
    console.log('')

    const problemi = valutaGuardie(stato)
    if (problemi.length > 0) {
      stampaProblemi(problemi)
      console.error('')
      console.error(`   Riferimenti considerati bloccanti: ${CHIAVI_DURE.join(', ')}`)
      process.exitCode = 1
      return
    }
    console.log('✅ Guardie pre-volo superate')
    console.log('')

    stampaPiano(stato)

    if (!esegui) {
      console.log('DRY-RUN: nulla è stato scritto.')
      console.log('')
      console.log('Per eseguire davvero (con la STESSA DATABASE_URL di questa esecuzione):')
      console.log(
        `  DATABASE_URL="…" npx tsx scripts/piano-v4/03-migrate.ts --execute${mantieniBudget ? ' --mantieni-budget' : ''}${riattivaVociV4 ? ' --riattiva-voci-v4' : ''}${lasciaVociSpente ? ' --lascia-voci-spente' : ''}`
      )
      return
    }

    await confermaScrittura()

    const riepilogo = await prisma.$transaction((tx) => applica(comeDb(tx), snapshot), {
      timeout: 180_000,
      maxWait: 30_000,
      // Le guardie ricontano dentro la transazione, ma con READ COMMITTED
      // un'altra sessione può inserire un movimento fra il ricalcolo e
      // l'updateMany di disattivazione: esattamente ciò che la guardia
      // esiste per impedire. Serializable chiude la finestra.
      isolationLevel: 'Serializable',
    })

    console.log('✅ MIGRAZIONE COMPLETATA')
    console.log('')
    console.log(`   voci v4 create        : ${riepilogo.vociCreate}`)
    console.log(`   voci v4 aggiornate    : ${riepilogo.vociAggiornate}`)
    if (riattivaVociV4) console.log(`   voci v4 riattivate    : ${riepilogo.vociRiattivate}`)
    console.log(`   system_key CORRISPETTIVI: ${riepilogo.corrispettivi} (voce ${VOCE_CORRISPETTIVI})`)
    console.log(`   conti legacy disattivati: ${riepilogo.legacyDisattivati.length} (${riepilogo.legacyDisattivati.join(', ') || 'nessuno'})`)
    console.log(`   righe di budget cancellate: ${riepilogo.budgetLinesCancellate}`)
    console.log(`   mappature budget cancellate: ${riepilogo.mappingCancellate}`)
    console.log('')
    console.log('Passi successivi:')
    console.log('  DATABASE_URL="…" npx tsx scripts/piano-v4/verifica.ts')
    console.log(`  DATABASE_URL="…" npx tsx scripts/piano-v4/04-rollback.ts --snapshot ${percorsoSnapshot}`)
  } catch (e) {
    if (e instanceof GuardieFallite) {
      stampaProblemi(e.problemi)
      process.exitCode = 1
      return
    }
    throw e
  } finally {
    await chiudi()
  }
}

main().catch((e) => {
  console.error('❌ Errore durante la migrazione (transazione annullata, database invariato):', e)
  process.exitCode = 1
})

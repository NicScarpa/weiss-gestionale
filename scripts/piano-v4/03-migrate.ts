/**
 * Script 03 — Migrazione al piano dei conti WEISS v4.
 *
 * ⚠️ Questo script modifica il piano dei conti di un gestionale in esercizio.
 * Leggere prima `docs/migrazione-piano-conti-v4.md` (generato dallo script
 * 02) e farlo approvare: la tabella dice esattamente quali conti verranno
 * disattivati e quali righe di budget verranno cancellate.
 *
 * MODALITÀ: il dry-run è il DEFAULT. Senza `--execute` lo script legge,
 * controlla, salva lo snapshot per il rollback e stampa il piano d'azione,
 * ma non scrive una riga.
 *
 * Cosa fa, tutto dentro UNA transazione:
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
 *   npx tsx scripts/piano-v4/03-migrate.ts                  # dry-run (default)
 *   npx tsx scripts/piano-v4/03-migrate.ts --execute        # scrive davvero
 *   npx tsx scripts/piano-v4/03-migrate.ts --execute --mantieni-budget
 *   npx tsx scripts/piano-v4/03-migrate.ts --execute --riattiva-voci-v4
 *
 * `--mantieni-budget` salta il passo 5. `--riattiva-voci-v4` serve solo a
 * rimettere in piedi il piano dopo un rollback: riattiva le 155 voci che il
 * rollback aveva spento. Senza quel flag il passo 2 non tocca mai is_active.
 *
 * Il rollback è `04-rollback.ts --snapshot <file salvato qui>`.
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

import { CENTRI_DI_COSTO, PIANO_CONTI_WEISS_V4 } from '../../src/lib/accounts/piano-conti-weiss-v4'

import {
  argomento,
  CHIAVI_DURE,
  comeDb,
  contaRiferimenti,
  contoAllaRovescia,
  creaClient,
  descriviDatabase,
  flag,
  formattaDettaglio,
  formattaDettaglioDuri,
  stampaIntestazione,
  type Db,
  type RiepilogoRiferimenti,
} from './_comune'

const SYSTEM_KEYS_RICHIESTE = ['CASSA', 'BANCA', 'DEBITI_FORNITORI']
const VOCE_CORRISPETTIVI = '10.01'
const CODICI_V4 = new Set(PIANO_CONTI_WEISS_V4.map((v) => v.code))

const esegui = flag('execute')
const mantieniBudget = flag('mantieni-budget')
const riattivaVociV4 = flag('riattiva-voci-v4')
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

interface Stato {
  legacy: ContoLegacy[]
  v4Presenti: ContoLegacy[]
  centriMancanti: string[]
  systemKeyMancanti: string[]
  collisioni: string[]
  corrispettiviAltrove: string | null
  riferimentiLegacy: Map<string, RiepilogoRiferimenti>
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
    where: { code: { in: [...CODICI_V4] } },
    orderBy: { code: 'asc' },
    select: {
      id: true,
      code: true,
      name: true,
      type: true,
      isActive: true,
      systemKey: true,
      mastroCode: true,
    },
  })

  // Guardia: i 4 centri di costo devono esistere e essere attivi (lo script
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
    if ((esistente as { mastroCode: string | null }).mastroCode === null) {
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

  const riferimentiLegacy = await contaRiferimenti(
    db,
    legacy.map((l) => l.id)
  )

  return {
    legacy,
    v4Presenti: v4Presenti as ContoLegacy[],
    centriMancanti,
    systemKeyMancanti,
    collisioni,
    corrispettiviAltrove,
    riferimentiLegacy,
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

  for (const conto of stato.legacy) {
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

  return problemi
}

// ════════════════════════════════════════════════════════════════════════
//  SNAPSHOT PER IL ROLLBACK
// ════════════════════════════════════════════════════════════════════════

async function salvaSnapshot(db: Db, stato: Stato): Promise<string> {
  const legacyIds = stato.legacy.map((l) => l.id)

  const budgetLines = await db.budgetLine.findMany({ where: { accountId: { in: legacyIds } } })
  const mappings = await db.accountBudgetMapping.findMany({ where: { accountId: { in: legacyIds } } })

  const snapshot = {
    versione: 1,
    generatoIl: new Date().toISOString(),
    database: descriviDatabase(),
    modalita: esegui ? 'execute' : 'dry-run',
    mantieniBudget,
    // Stato dei conti legacy PRIMA della migrazione: il rollback ci
    // ripristina is_active così com'era (non tutti sono per forza attivi).
    contiLegacy: stato.legacy.map((l) => ({
      id: l.id,
      code: l.code,
      name: l.name,
      type: l.type,
      isActive: l.isActive,
      systemKey: l.systemKey,
    })),
    // Voci v4 che esistevano GIÀ: il rollback non deve disattivarle, deve
    // riportarle allo stato di partenza.
    vociV4Preesistenti: stato.v4Presenti.map((v) => ({
      id: v.id,
      code: v.code,
      isActive: v.isActive,
      systemKey: v.systemKey,
    })),
    budgetLines: budgetLines.map((b) => JSON.parse(JSON.stringify(b))),
    accountBudgetMappings: mappings.map((m) => JSON.parse(JSON.stringify(m))),
  }

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
  const v4Disattivate = stato.v4Presenti.filter((v) => !v.isActive)

  console.log('PIANO D\'AZIONE')
  console.log('')
  console.log(`  1. voci del piano v4: ${daCreare} da creare, ${daAggiornare} già presenti (aggiorno solo l'anagrafica)`)
  if (v4Disattivate.length > 0) {
    if (riattivaVociV4) {
      console.log(`     ↳ ${v4Disattivate.length} voci v4 risultano disattivate: le riattivo (--riattiva-voci-v4)`)
    } else {
      console.log(
        `     ⚠️  ${v4Disattivate.length} voci v4 risultano DISATTIVATE e resteranno tali: la migrazione non tocca mai is_active`
      )
      console.log(
        '         sulle voci già presenti. Se vengono da un rollback precedente, rilanciare con --riattiva-voci-v4.'
      )
    }
  }
  console.log(`  2. system_key CORRISPETTIVI sulla voce ${VOCE_CORRISPETTIVI}`)
  console.log(`  3. conti legacy RICAVO/COSTO da disattivare: ${daDisattivare.length} (su ${stato.legacy.length} legacy totali)`)
  for (const c of daDisattivare) {
    const rif = stato.riferimentiLegacy.get(c.id)
    const nota = rif && rif.totale > 0 ? ` — riferimenti morbidi: ${formattaDettaglio(rif)}` : ''
    console.log(`       · ${c.code.padEnd(10)} ${c.name}${nota}`)
  }
  const righeBudget = [...stato.riferimentiLegacy.values()].reduce(
    (s, r) => s + (r.dettaglio['budget_lines.account_id'] ?? 0),
    0
  )
  const mappature = [...stato.riferimentiLegacy.values()].reduce(
    (s, r) => s + (r.dettaglio['account_budget_mappings.account_id'] ?? 0),
    0
  )
  const plurale = (n: number, uno: string, molti: string) => `${n} ${n === 1 ? uno : molti}`
  if (mantieniBudget) {
    console.log(
      `  4. budget: NON tocco nulla (--mantieni-budget) — resterebbero ${plurale(righeBudget, 'riga', 'righe')} di budget e ${plurale(mappature, 'mappatura', 'mappature')} su conti disattivati`
    )
  } else {
    console.log(
      `  4. cancello ${plurale(righeBudget, 'riga', 'righe')} di budget e ${plurale(mappature, 'mappatura', 'mappature')} budget dei conti legacy`
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
  corrispettiviAssegnata: boolean
}

async function applica(tx: Db): Promise<Riepilogo> {
  // Le guardie si rivalutano QUI dentro, sui dati della transazione: fra il
  // dry-run e l'esecuzione qualcuno può aver registrato un movimento su un
  // conto che stiamo per disattivare.
  const statoTx = await rilevaStato(tx)
  const problemi = valutaGuardie(statoTx)
  if (problemi.length > 0) {
    throw new GuardieFallite(problemi)
  }

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
  // un rollback. Non è mai automatica, perché "aggiornare l'anagrafica" non
  // deve poter resuscitare una voce spenta a mano dal committente.
  let vociRiattivate = 0
  if (riattivaVociV4) {
    vociRiattivate = (
      await tx.account.updateMany({
        where: { code: { in: [...CODICI_V4] }, isActive: false },
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
  let corrispettiviAssegnata = false
  if (corrispettivi && corrispettivi.systemKey !== 'CORRISPETTIVI') {
    await tx.account.update({
      where: { code: VOCE_CORRISPETTIVI },
      data: { systemKey: 'CORRISPETTIVI' },
    })
    corrispettiviAssegnata = true
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
    corrispettiviAssegnata,
  }

  // Audit log scritto direttamente (non via src/lib/audit.ts: quello passa
  // dal client applicativo e da next/headers, fuori da un contesto di
  // richiesta HTTP).
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
          ...riepilogo,
        })
      ),
    },
  })

  return riepilogo
}

class GuardieFallite extends Error {
  constructor(public problemi: string[]) {
    super('Guardie pre-volo fallite')
    this.name = 'GuardieFallite'
  }
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
    const percorsoSnapshot = await salvaSnapshot(prisma, stato)
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
      console.log('Per eseguire davvero:')
      console.log(
        `  npx tsx scripts/piano-v4/03-migrate.ts --execute${mantieniBudget ? ' --mantieni-budget' : ''}${riattivaVociV4 ? ' --riattiva-voci-v4' : ''}`
      )
      return
    }

    await contoAllaRovescia(5)

    const riepilogo = await prisma.$transaction((tx) => applica(comeDb(tx)), {
      timeout: 180_000,
      maxWait: 30_000,
    })

    console.log('✅ MIGRAZIONE COMPLETATA')
    console.log('')
    console.log(`   voci v4 create        : ${riepilogo.vociCreate}`)
    console.log(`   voci v4 aggiornate    : ${riepilogo.vociAggiornate}`)
    if (riattivaVociV4) console.log(`   voci v4 riattivate    : ${riepilogo.vociRiattivate}`)
    console.log(`   system_key CORRISPETTIVI: ${riepilogo.corrispettiviAssegnata ? `assegnata a ${VOCE_CORRISPETTIVI}` : 'già presente'}`)
    console.log(`   conti legacy disattivati: ${riepilogo.legacyDisattivati.length} (${riepilogo.legacyDisattivati.join(', ') || 'nessuno'})`)
    console.log(`   righe di budget cancellate: ${riepilogo.budgetLinesCancellate}`)
    console.log(`   mappature budget cancellate: ${riepilogo.mappingCancellate}`)
    console.log('')
    console.log('Passi successivi:')
    console.log('  npx tsx scripts/piano-v4/verifica.ts')
    console.log(`  npx tsx scripts/piano-v4/04-rollback.ts --snapshot ${percorsoSnapshot}   # se serve tornare indietro`)
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

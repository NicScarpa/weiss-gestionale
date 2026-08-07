/**
 * Script 04 — Rollback della migrazione al piano dei conti v4.
 *
 * Riporta il database allo stato fotografato dallo snapshot che `03-migrate.ts`
 * salva prima di scrivere. In una sola transazione:
 *   1. riattiva i conti legacy come erano nello snapshot;
 *   2. ripristina righe di budget e mappature budget cancellate;
 *   3. toglie la `system_key = CORRISPETTIVI` dalla voce 10.01 se lo snapshot
 *      dice che prima non c'era;
 *   4. disattiva — non cancella MAI — le 155 voci v4 introdotte dalla
 *      migrazione. Le voci che esistevano già prima tornano allo stato di
 *      partenza registrato nello snapshot.
 *
 * Regola non negoziabile: una voce v4 che nel frattempo ha acquisito
 * riferimenti (un movimento, una fetta, una riga fattura, una regola…) NON
 * viene toccata e il rollback si ferma elencandole. Cancellarle o
 * disattivarle romperebbe dati nati dopo la migrazione: in quel caso il
 * rollback va deciso a mano, non a colpi di script.
 *
 * MODALITÀ: dry-run di default, `--execute` per scrivere davvero.
 *
 * Uso:
 *   npx tsx scripts/piano-v4/04-rollback.ts --snapshot scripts/piano-v4/snapshots/<file>.json
 *   npx tsx scripts/piano-v4/04-rollback.ts --snapshot <file>.json --execute
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { PIANO_CONTI_WEISS_V4 } from '../../src/lib/accounts/piano-conti-weiss-v4'

import {
  argomento,
  comeDb,
  contaRiferimenti,
  contoAllaRovescia,
  creaClient,
  flag,
  formattaDettaglio,
  stampaIntestazione,
  type Db,
} from './_comune'

const VOCE_CORRISPETTIVI = '10.01'
const esegui = flag('execute')

interface Snapshot {
  versione: number
  generatoIl: string
  database: string
  modalita: string
  mantieniBudget?: boolean
  contiLegacy: { id: string; code: string; name: string; type: string; isActive: boolean; systemKey: string | null }[]
  vociV4Preesistenti: { id: string; code: string; isActive: boolean; systemKey: string | null }[]
  budgetLines: Record<string, unknown>[]
  accountBudgetMappings: Record<string, unknown>[]
}

function leggiSnapshot(percorso: string): Snapshot {
  const grezzo = JSON.parse(readFileSync(percorso, 'utf8'))
  if (grezzo.versione !== 1) {
    throw new Error(`Snapshot di versione ${grezzo.versione}: questo script legge solo la versione 1`)
  }
  for (const campo of ['contiLegacy', 'vociV4Preesistenti', 'budgetLines', 'accountBudgetMappings']) {
    if (!Array.isArray(grezzo[campo])) {
      throw new Error(`Snapshot malformato: manca l'elenco "${campo}"`)
    }
  }
  return grezzo as Snapshot
}

/**
 * Le colonne data vanno riconvertite: nel JSON sono stringhe ISO. Si guarda
 * il nome della colonna oltre alla forma del valore, per non trasformare in
 * data una nota di testo che per caso somigli a un timestamp.
 */
function ripristinaTipi(riga: Record<string, unknown>): Record<string, unknown> {
  const fuori: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(riga)) {
    const sembraData = typeof v === 'string' && /(?:At|Date)$/.test(k) && /^\d{4}-\d{2}-\d{2}T/.test(v)
    fuori[k] = sembraData ? new Date(v as string) : v
  }
  return fuori
}

interface Piano {
  legacyDaRiattivare: { id: string; code: string; name: string }[]
  budgetLinesDaRipristinare: number
  mappingDaRipristinare: number
  vociDaDisattivare: { code: string; name: string }[]
  vociDaRiportareAllaStatoPrecedente: { code: string; isActive: boolean }[]
  corrispettiviDaTogliere: boolean
  vociConRiferimenti: { code: string; name: string; dettaglio: string }[]
}

async function calcolaPiano(db: Db, snap: Snapshot): Promise<Piano> {
  const preesistenti = new Map(snap.vociV4Preesistenti.map((v) => [v.code, v]))

  // Conti legacy: si riattiva solo ciò che nello snapshot risultava attivo.
  const legacyOra = await db.account.findMany({
    where: { id: { in: snap.contiLegacy.map((c) => c.id) } },
    select: { id: true, code: true, name: true, isActive: true },
  })
  const statoOra = new Map(legacyOra.map((c) => [c.id, c]))
  const legacyDaRiattivare = snap.contiLegacy
    .filter((c) => c.isActive && statoOra.get(c.id) && !statoOra.get(c.id)!.isActive)
    .map((c) => ({ id: c.id, code: c.code, name: c.name }))

  // Budget: si reinserisce solo ciò che oggi manca.
  const idBudgetLines = snap.budgetLines.map((b) => b.id as string)
  const budgetLinesEsistenti = new Set(
    (await db.budgetLine.findMany({ where: { id: { in: idBudgetLines } }, select: { id: true } })).map(
      (b) => b.id
    )
  )
  const idMapping = snap.accountBudgetMappings.map((m) => m.id as string)
  const mappingEsistenti = new Set(
    (
      await db.accountBudgetMapping.findMany({ where: { id: { in: idMapping } }, select: { id: true } })
    ).map((m) => m.id)
  )

  // Voci v4 oggi nel database.
  const codiciV4 = PIANO_CONTI_WEISS_V4.map((v) => v.code)
  const vociOra = await db.account.findMany({
    where: { code: { in: codiciV4 } },
    select: { id: true, code: true, name: true, isActive: true, systemKey: true },
  })

  const riferimenti = await contaRiferimenti(
    db,
    vociOra.map((v) => v.id)
  )

  const vociConRiferimenti: Piano['vociConRiferimenti'] = []
  const vociDaDisattivare: Piano['vociDaDisattivare'] = []
  const vociDaRiportareAllaStatoPrecedente: Piano['vociDaRiportareAllaStatoPrecedente'] = []

  for (const voce of vociOra) {
    const rif = riferimenti.get(voce.id)
    const prima = preesistenti.get(voce.code)
    if (prima) {
      // Esisteva già: torna com'era, senza guardare i riferimenti (non è la
      // migrazione ad averla introdotta).
      if (prima.isActive !== voce.isActive) {
        vociDaRiportareAllaStatoPrecedente.push({ code: voce.code, isActive: prima.isActive })
      }
      continue
    }
    if (rif && rif.totale > 0) {
      vociConRiferimenti.push({ code: voce.code, name: voce.name, dettaglio: formattaDettaglio(rif) })
      continue
    }
    if (voce.isActive) vociDaDisattivare.push({ code: voce.code, name: voce.name })
  }

  const corrispettivi = vociOra.find((v) => v.code === VOCE_CORRISPETTIVI)
  const corrispettiviPrima = preesistenti.get(VOCE_CORRISPETTIVI)
  const corrispettiviDaTogliere = Boolean(
    corrispettivi &&
      corrispettivi.systemKey === 'CORRISPETTIVI' &&
      corrispettiviPrima?.systemKey !== 'CORRISPETTIVI'
  )

  return {
    legacyDaRiattivare,
    budgetLinesDaRipristinare: snap.budgetLines.filter((b) => !budgetLinesEsistenti.has(b.id as string))
      .length,
    mappingDaRipristinare: snap.accountBudgetMappings.filter((m) => !mappingEsistenti.has(m.id as string))
      .length,
    vociDaDisattivare,
    vociDaRiportareAllaStatoPrecedente,
    corrispettiviDaTogliere,
    vociConRiferimenti,
  }
}

class RollbackBloccato extends Error {
  constructor(public voci: Piano['vociConRiferimenti']) {
    super('Rollback bloccato: voci v4 con riferimenti')
    this.name = 'RollbackBloccato'
  }
}

function stampaBlocco(voci: Piano['vociConRiferimenti']) {
  console.error('❌ ROLLBACK BLOCCATO — queste voci del piano v4 hanno già riferimenti:')
  console.error('')
  for (const v of voci) console.error(`   • ${v.code} — ${v.name}: ${v.dettaglio}`)
  console.error('')
  console.error('   Disattivarle romperebbe dati nati dopo la migrazione, e cancellarle')
  console.error('   non è mai un\'opzione. Nessuna scrittura è stata effettuata: decidere')
  console.error('   a mano come rimappare quei riferimenti, poi rilanciare.')
}

async function applica(tx: Db, snap: Snapshot): Promise<Piano> {
  // Ricalcolo dentro la transazione: fra dry-run ed esecuzione il database
  // può essere cambiato.
  const piano = await calcolaPiano(tx, snap)
  if (piano.vociConRiferimenti.length > 0) {
    throw new RollbackBloccato(piano.vociConRiferimenti)
  }

  if (piano.legacyDaRiattivare.length > 0) {
    await tx.account.updateMany({
      where: { id: { in: piano.legacyDaRiattivare.map((c) => c.id) } },
      data: { isActive: true },
    })
  }

  // Il ripristino del budget va fatto PRIMA di toccare le voci v4: le righe
  // puntano ai conti legacy, che a questo punto sono di nuovo attivi.
  const idBudgetLines = snap.budgetLines.map((b) => b.id as string)
  const giaPresenti = new Set(
    (await tx.budgetLine.findMany({ where: { id: { in: idBudgetLines } }, select: { id: true } })).map(
      (b) => b.id
    )
  )
  for (const riga of snap.budgetLines) {
    if (giaPresenti.has(riga.id as string)) continue
    await tx.budgetLine.create({ data: ripristinaTipi(riga) as never })
  }

  const idMapping = snap.accountBudgetMappings.map((m) => m.id as string)
  const mappingPresenti = new Set(
    (
      await tx.accountBudgetMapping.findMany({ where: { id: { in: idMapping } }, select: { id: true } })
    ).map((m) => m.id)
  )
  for (const riga of snap.accountBudgetMappings) {
    if (mappingPresenti.has(riga.id as string)) continue
    await tx.accountBudgetMapping.create({ data: ripristinaTipi(riga) as never })
  }

  if (piano.corrispettiviDaTogliere) {
    await tx.account.update({
      where: { code: VOCE_CORRISPETTIVI },
      data: { systemKey: null },
    })
  }

  if (piano.vociDaDisattivare.length > 0) {
    await tx.account.updateMany({
      where: { code: { in: piano.vociDaDisattivare.map((v) => v.code) } },
      data: { isActive: false },
    })
  }

  for (const v of piano.vociDaRiportareAllaStatoPrecedente) {
    await tx.account.update({ where: { code: v.code }, data: { isActive: v.isActive } })
  }

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
          operazione: 'rollback-piano-conti-v4',
          script: 'scripts/piano-v4/04-rollback.ts',
          snapshot: snap.generatoIl,
          legacyRiattivati: piano.legacyDaRiattivare.map((c) => c.code),
          vociV4Disattivate: piano.vociDaDisattivare.length,
          budgetLinesRipristinate: piano.budgetLinesDaRipristinare,
          mappingRipristinate: piano.mappingDaRipristinare,
        })
      ),
    },
  })

  return piano
}

async function main() {
  const percorso = argomento('snapshot')
  if (!percorso) {
    console.error('❌ Manca --snapshot <file>: il rollback ha bisogno della fotografia')
    console.error('   salvata da 03-migrate.ts (cartella scripts/piano-v4/snapshots/).')
    process.exitCode = 1
    return
  }

  const assoluto = resolve(process.cwd(), percorso)
  const snap = leggiSnapshot(assoluto)

  stampaIntestazione(
    'Piano dei conti v4 — script 04: rollback',
    esegui ? 'ESECUZIONE (scrive nel database)' : 'DRY-RUN (nessuna scrittura) — usare --execute per scrivere'
  )

  console.log(`Snapshot  : ${assoluto}`)
  console.log(`  generato: ${snap.generatoIl} (modalità ${snap.modalita})`)
  console.log(`  database: ${snap.database}`)
  console.log('')

  const { prisma, chiudi } = creaClient()
  try {
    const piano = await calcolaPiano(prisma, snap)

    if (piano.vociConRiferimenti.length > 0) {
      stampaBlocco(piano.vociConRiferimenti)
      process.exitCode = 1
      return
    }

    console.log('PIANO D\'AZIONE')
    console.log('')
    console.log(`  1. conti legacy da riattivare: ${piano.legacyDaRiattivare.length}`)
    for (const c of piano.legacyDaRiattivare) console.log(`       · ${c.code.padEnd(10)} ${c.name}`)
    console.log(`  2. righe di budget da ripristinare: ${piano.budgetLinesDaRipristinare}`)
    console.log(`     mappature budget da ripristinare: ${piano.mappingDaRipristinare}`)
    console.log(
      `  3. system_key CORRISPETTIVI: ${piano.corrispettiviDaTogliere ? `da togliere dalla voce ${VOCE_CORRISPETTIVI}` : 'da lasciare com\'è'}`
    )
    console.log(`  4. voci v4 da disattivare (mai cancellare): ${piano.vociDaDisattivare.length}`)
    console.log(
      `  5. voci v4 preesistenti da riportare allo stato di partenza: ${piano.vociDaRiportareAllaStatoPrecedente.length}`
    )
    console.log('')

    if (!esegui) {
      console.log('DRY-RUN: nulla è stato scritto.')
      console.log('')
      console.log('Per eseguire davvero:')
      console.log(`  npx tsx scripts/piano-v4/04-rollback.ts --snapshot ${percorso} --execute`)
      return
    }

    await contoAllaRovescia(5)

    const fatto = await prisma.$transaction((tx) => applica(comeDb(tx), snap), {
      timeout: 180_000,
      maxWait: 30_000,
    })

    console.log('✅ ROLLBACK COMPLETATO')
    console.log('')
    console.log(`   conti legacy riattivati    : ${fatto.legacyDaRiattivare.length}`)
    console.log(`   righe di budget ripristinate: ${fatto.budgetLinesDaRipristinare}`)
    console.log(`   mappature budget ripristinate: ${fatto.mappingDaRipristinare}`)
    console.log(`   voci v4 disattivate        : ${fatto.vociDaDisattivare.length}`)
    console.log('')
    console.log('Le voci v4 restano in tabella disattivate: nessun conto è stato cancellato.')
  } catch (e) {
    if (e instanceof RollbackBloccato) {
      stampaBlocco(e.voci)
      process.exitCode = 1
      return
    }
    throw e
  } finally {
    await chiudi()
  }
}

main().catch((e) => {
  console.error('❌ Errore durante il rollback (transazione annullata, database invariato):', e)
  process.exitCode = 1
})
